import * as Dialog from "@radix-ui/react-dialog";
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import type { PlaceSearchResult } from "../../../shared/ipc";
import type { TerrainLayer } from "../../../shared/model";
import { useEditorStore } from "../store";

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
}

type PolygonPoint = [longitude: number, latitude: number];

const CAPABILITIES_URL = "https://cache.kartverket.no/v1/wmts/1.0.0/WMTSCapabilities.xml";
const FALLBACK_TILE =
  "https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png";
const ESRI_EXPORT_ROOT = "https://services.arcgisonline.com/ArcGIS/rest/services";
const MAX_SELECTION_METERS = 2_000;

function discoverTopoTemplate(xml: string): string {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const layers = Array.from(document.getElementsByTagNameNS("*", "Layer"));
  const topo = layers.find((layer) => {
    const identifier = Array.from(layer.getElementsByTagNameNS("*", "Identifier"))[0];
    return identifier?.textContent?.trim() === "topo";
  });
  const resource = topo?.getElementsByTagNameNS("*", "ResourceURL")[0];
  const template = resource?.getAttribute("template");
  if (!template) return FALLBACK_TILE;
  return template
    .replace("{TileMatrixSet}", "webmercator")
    .replace("{TileMatrix}", "{z}")
    .replace("{TileRow}", "{y}")
    .replace("{TileCol}", "{x}");
}

function polygonBounds(points: PolygonPoint[]) {
  const longitudes = points.map(([longitude]) => longitude);
  const latitudes = points.map(([, latitude]) => latitude);
  return {
    west: Math.min(...longitudes),
    south: Math.min(...latitudes),
    east: Math.max(...longitudes),
    north: Math.max(...latitudes),
  };
}

function polygonDimensionsMeters(points: PolygonPoint[]) {
  const bounds = polygonBounds(points);
  const latitude = (bounds.south + bounds.north) / 2;
  return {
    width: (bounds.east - bounds.west) * 111_320 * Math.cos((latitude * Math.PI) / 180),
    height: (bounds.north - bounds.south) * 111_320,
  };
}

function polygonCenter(points: PolygonPoint[]): PolygonPoint {
  const bounds = polygonBounds(points);
  return [(bounds.west + bounds.east) / 2, (bounds.south + bounds.north) / 2];
}

function selectionFeatureCollection(points: PolygonPoint[]) {
  const features: Array<
    | {
        type: "Feature";
        properties: Record<string, never>;
        geometry: { type: "Point"; coordinates: PolygonPoint };
      }
    | {
        type: "Feature";
        properties: Record<string, never>;
        geometry: { type: "Polygon"; coordinates: PolygonPoint[][] };
      }
  > = points.map((coordinates) => ({
    type: "Feature" as const,
    properties: {},
    geometry: { type: "Point" as const, coordinates },
  }));
  if (points.length >= 3) {
    features.push({
      type: "Feature" as const,
      properties: {},
      geometry: { type: "Polygon" as const, coordinates: [[...points, points[0] ?? [0, 0]]] },
    });
  }
  return { type: "FeatureCollection" as const, features };
}

function staticMapImageUrl(
  bounds: { west: number; south: number; east: number; north: number },
  imagery: "map" | "satellite",
): string {
  const service = imagery === "satellite" ? "World_Imagery" : "World_Topo_Map";
  const bbox = [bounds.west, bounds.south, bounds.east, bounds.north]
    .map((value) => value.toFixed(7))
    .join(",");
  return `${ESRI_EXPORT_ROOT}/${service}/MapServer/export?bbox=${bbox}&bboxSR=4326&imageSR=4326&size=1024,1024&format=png32&transparent=false&f=image`;
}

export function TerrainDialog({ open, onOpenChange }: Props) {
  const mapHostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const addTerrain = useEditorStore((state) => state.addTerrain);
  const importTerrain = useEditorStore((state) => state.importTerrain);
  const [tileTemplate, setTileTemplate] = useState(FALLBACK_TILE);
  const [providerStatus, setProviderStatus] = useState("Checking Kartverket WMTS...");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [polygon, setPolygon] = useState<PolygonPoint[]>([]);
  const [mapCenter, setMapCenter] = useState<PolygonPoint>([10.7522, 59.9139]);
  const [imageryMode, setImageryMode] = useState<"map" | "satellite">("satellite");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const selection = useMemo(
    () => (polygon.length >= 3 ? polygonDimensionsMeters(polygon) : undefined),
    [polygon],
  );
  const selectionTooLarge = Boolean(
    selection && Math.max(selection.width, selection.height) > MAX_SELECTION_METERS,
  );
  const canImport = polygon.length >= 3 && !selectionTooLarge;

  useEffect(() => {
    if (!open) return;
    void window.sketcher.terrain
      .fetchCapabilities(CAPABILITIES_URL)
      .then((xml) => {
        setTileTemplate(discoverTopoTemplate(xml));
        setProviderStatus("Kartverket Topo map is ready");
      })
      .catch(() => setProviderStatus("Using the public Kartverket Topo map fallback"));
  }, [open]);

  useEffect(() => {
    if (!open || !mapHostRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapHostRef.current,
      center: [10.7522, 59.9139],
      zoom: 14,
      attributionControl: { compact: true },
      style: {
        version: 8,
        sources: {
          kartverket: {
            type: "raster",
            tiles: [tileTemplate],
            tileSize: 256,
            attribution: "© Kartverket",
          },
        },
        layers: [{ id: "kartverket", type: "raster", source: "kartverket" }],
      },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("moveend", () => {
      const center = map.getCenter();
      setMapCenter([center.lng, center.lat]);
    });
    map.on("load", () => {
      map.addSource("selection", {
        type: "geojson",
        data: selectionFeatureCollection([]),
      });
      map.addLayer({
        id: "selection-fill",
        type: "fill",
        source: "selection",
        paint: { "fill-color": "#4fc3ff", "fill-opacity": 0.2 },
      });
      map.addLayer({
        id: "selection-line",
        type: "line",
        source: "selection",
        paint: { "line-color": "#0f6f9d", "line-width": 3 },
      });
      map.addLayer({
        id: "selection-points",
        type: "circle",
        source: "selection",
        paint: {
          "circle-color": "#ffffff",
          "circle-radius": 5,
          "circle-stroke-color": "#0f6f9d",
          "circle-stroke-width": 2,
        },
      });
    });
    mapRef.current = map;
    mapHostRef.current.dataset.mapReady = "true";
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [open, tileTemplate]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => {
      const source = map.getSource("selection") as GeoJSONSource | undefined;
      source?.setData(selectionFeatureCollection(polygon));
    };
    if (map.isStyleLoaded()) update();
    else map.once("load", update);
  }, [polygon]);

  const search = async () => {
    setError(undefined);
    try {
      setResults(await window.sketcher.terrain.search(query));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const choose = (result: PlaceSearchResult) => {
    mapRef.current?.flyTo({ center: [result.longitude, result.latitude], zoom: 15 });
    setMapCenter([result.longitude, result.latitude]);
    setPolygon([]);
    setResults([]);
  };

  const addPolygonPoint = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest(".maplibregl-ctrl")) return;
    const host = mapHostRef.current;
    if (!host) return;
    const bounds = host.getBoundingClientRect();
    const map = mapRef.current;
    const point = map
      ? map.unproject([event.clientX - bounds.left, event.clientY - bounds.top])
      : {
          lng: mapCenter[0] + ((event.clientX - bounds.left) / bounds.width - 0.5) * 0.02,
          lat: mapCenter[1] - ((event.clientY - bounds.top) / bounds.height - 0.5) * 0.02,
        };
    setError(undefined);
    setPolygon((points) => [...points, [point.lng, point.lat]]);
  };

  const addSelectedMap = async () => {
    if (!canImport || !selection) {
      setError("Click at least three points to outline an area up to 2 × 2 km.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const bounds = polygonBounds(polygon);
      const imageryBase64 = await window.sketcher.terrain.fetchImage(
        staticMapImageUrl(bounds, imageryMode),
      );
      const id = crypto.randomUUID();
      const anchor = polygonCenter(polygon);
      const layer: TerrainLayer = {
        id,
        name: `${imageryMode === "satellite" ? "Satellite" : "Map"} area ${anchor[1].toFixed(4)}, ${anchor[0].toFixed(4)}`,
        provider: "custom",
        attribution:
          imageryMode === "satellite"
            ? "Esri, Maxar, Earthstar Geographics and the GIS User Community"
            : "Esri, HERE, Garmin, FAO, NOAA, USGS, OpenStreetMap contributors, and the GIS User Community",
        boundsWgs84: [bounds.west, bounds.south, bounds.east, bounds.north],
        clipPolygonWgs84: polygon,
        sourceEpsg: "EPSG:4326",
        anchorWgs84: anchor,
        absoluteAnchorElevation: 0,
        verticalOffset: 0,
        widthMm: Math.max(1, selection.width * 1000),
        heightMm: Math.max(1, selection.height * 1000),
        imageryArchivePath: `${id}-${imageryMode}.png`,
        gridSize: [2, 2],
        elevationsMm: [0, 0, 0, 0],
        visible: true,
      };
      addTerrain(layer, undefined, imageryBase64);
      onOpenChange(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content terrain-dialog">
          <div className="dialog-heading">
            <div>
              <span className="eyebrow">Map import</span>
              <Dialog.Title>Import a map area</Dialog.Title>
              <Dialog.Description>
                Search or navigate, then click at least three map points to draw an area up to 2 × 2
                km.
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close terrain dialog">
              ×
            </Dialog.Close>
          </div>
          <div className="terrain-layout">
            <div className="terrain-controls">
              <div className="search-row">
                <input
                  placeholder="Search Norwegian place..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void search();
                  }}
                />
                <button className="button secondary" onClick={() => void search()}>
                  Search
                </button>
              </div>
              {results.length > 0 && (
                <div className="search-results">
                  {results.map((result) => (
                    <button
                      key={`${result.name}-${result.latitude}-${result.longitude}`}
                      onClick={() => choose(result)}
                    >
                      <strong>{result.name}</strong>
                      <span>{result.municipality}</span>
                    </button>
                  ))}
                </div>
              )}
              <label>
                Image style
                <select
                  value={imageryMode}
                  onChange={(event) => setImageryMode(event.target.value as "map" | "satellite")}
                >
                  <option value="satellite">Satellite image</option>
                  <option value="map">Topographic map</option>
                </select>
              </label>
              <div className="provider-card">
                <span className="status-dot" />
                <div>
                  <strong>{providerStatus}</strong>
                  <span>
                    {polygon.length} point{polygon.length === 1 ? "" : "s"} selected
                    {selection &&
                      ` · ${Math.round(selection.width)} × ${Math.round(selection.height)} m`}
                  </span>
                </div>
              </div>
              {selectionTooLarge && (
                <div className="inline-error">Keep the selected area within 2 × 2 km.</div>
              )}
              {error && <div className="inline-error">{error}</div>}
              <button
                className="button primary wide"
                disabled={busy || !canImport}
                aria-label="Import selected map area"
                onClick={() => void addSelectedMap()}
              >
                {busy ? "Caching map image..." : "Import selected map area"}
              </button>
              <button className="button secondary wide" onClick={() => setPolygon([])}>
                Clear map selection
              </button>
              <button
                className="button ghost wide"
                onClick={() => {
                  void importTerrain();
                  onOpenChange(false);
                }}
              >
                Import local GeoTIFF instead
              </button>
              <p className="supporting-text">
                This MVP adds a cached flat map surface at Z=0. It does not fetch elevation or LiDAR
                data.
              </p>
            </div>
            <div
              className="map-frame"
              ref={mapHostRef}
              role="application"
              aria-label="Map area selector"
              data-map-ready="true"
              onClick={addPolygonPoint}
              onKeyDown={(event) => {
                if (event.key === "Escape") setPolygon([]);
              }}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
