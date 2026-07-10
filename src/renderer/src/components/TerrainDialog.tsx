import * as Dialog from "@radix-ui/react-dialog";
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type { PlaceSearchResult } from "../../../shared/ipc";
import type { TerrainLayer } from "../../../shared/model";
import { useEditorStore } from "../store";

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
}

const CAPABILITIES_URL = "https://cache.kartverket.no/v1/wmts/1.0.0/WMTSCapabilities.xml";
const FALLBACK_TILE =
  "https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png";

function boundsAround(latitude: number, longitude: number, sizeMeters: number) {
  const halfLatitude = sizeMeters / 2 / 111_320;
  const halfLongitude = sizeMeters / 2 / (111_320 * Math.cos((latitude * Math.PI) / 180));
  return {
    west: longitude - halfLongitude,
    south: latitude - halfLatitude,
    east: longitude + halfLongitude,
    north: latitude + halfLatitude,
  };
}

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

export function TerrainDialog({ open, onOpenChange }: Props) {
  const mapHostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const addTerrain = useEditorStore((state) => state.addTerrain);
  const importTerrain = useEditorStore((state) => state.importTerrain);
  const [tileTemplate, setTileTemplate] = useState(FALLBACK_TILE);
  const [providerStatus, setProviderStatus] = useState("Checking Kartverket WMTS…");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [latitude, setLatitude] = useState(59.9139);
  const [longitude, setLongitude] = useState(10.7522);
  const [sizeMeters, setSizeMeters] = useState(500);
  const [resolution, setResolution] = useState(33);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    void window.sketcher.terrain
      .fetchCapabilities(CAPABILITIES_URL)
      .then((xml) => {
        setTileTemplate(discoverTopoTemplate(xml));
        setProviderStatus("Kartverket Topo discovered from WMTS capabilities");
      })
      .catch(() => setProviderStatus("Using cached Kartverket Topo service template"));
  }, [open]);

  useEffect(() => {
    if (!open || !mapHostRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapHostRef.current,
      center: [longitude, latitude],
      zoom: 14,
      canvasContextAttributes: { preserveDrawingBuffer: true },
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
    map.on("load", () => {
      map.addSource("selection", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "selection-fill",
        type: "fill",
        source: "selection",
        paint: { "fill-color": "#4fc3ff", "fill-opacity": 0.18 },
      });
      map.addLayer({
        id: "selection-line",
        type: "line",
        source: "selection",
        paint: { "line-color": "#7ad8ff", "line-width": 2 },
      });
    });
    map.on("click", (event) => {
      setLongitude(event.lngLat.lng);
      setLatitude(event.lngLat.lat);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [open, tileTemplate, latitude, longitude]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const bounds = boundsAround(latitude, longitude, sizeMeters);
    const source = map.getSource("selection") as GeoJSONSource | undefined;
    source?.setData({
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [bounds.west, bounds.south],
            [bounds.east, bounds.south],
            [bounds.east, bounds.north],
            [bounds.west, bounds.north],
            [bounds.west, bounds.south],
          ],
        ],
      },
    });
  }, [latitude, longitude, sizeMeters]);

  const search = async () => {
    setError(undefined);
    try {
      setResults(await window.sketcher.terrain.search(query));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const choose = (result: PlaceSearchResult) => {
    setLatitude(result.latitude);
    setLongitude(result.longitude);
    mapRef.current?.flyTo({ center: [result.longitude, result.latitude], zoom: 15 });
    setResults([]);
  };

  const addOnlineTerrain = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const sampled = await window.sketcher.terrain.sampleElevation(
        latitude,
        longitude,
        sizeMeters,
        sizeMeters,
        resolution,
      );
      const centerIndex = Math.floor(sampled.elevationsMeters.length / 2);
      const anchorElevation = sampled.elevationsMeters[centerIndex] ?? 0;
      const bounds = boundsAround(latitude, longitude, sizeMeters);
      const map = mapRef.current;
      let imageryBase64: string | undefined;
      if (map) {
        map.fitBounds(
          [
            [bounds.west, bounds.south],
            [bounds.east, bounds.north],
          ],
          { padding: 0, duration: 0 },
        );
        await new Promise<void>((resolve) => map.once("idle", () => resolve()));
        imageryBase64 = map.getCanvas().toDataURL("image/png").split(",")[1];
      }
      const id = crypto.randomUUID();
      const layer: TerrainLayer = {
        id,
        name: `Terrain ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
        provider: "kartverket",
        attribution: `© Kartverket · ${sampled.dataSource}`,
        boundsWgs84: [bounds.west, bounds.south, bounds.east, bounds.north],
        sourceEpsg: "EPSG:4258",
        anchorWgs84: [longitude, latitude],
        absoluteAnchorElevation: anchorElevation,
        verticalOffset: 0,
        widthMm: sizeMeters * 1000,
        heightMm: sizeMeters * 1000,
        imageryArchivePath: imageryBase64 ? `${id}-topo.png` : undefined,
        gridSize: [sampled.columns, sampled.rows],
        elevationsMm: sampled.elevationsMeters.map((value) => (value - anchorElevation) * 1000),
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
              <span className="eyebrow">Site context</span>
              <Dialog.Title>Add terrain layer</Dialog.Title>
              <Dialog.Description>
                Select up to 2×2 km. Elevation is normalized to zero at the centre.
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
                  placeholder="Search Norwegian place…"
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
              <div className="field-row">
                <label>
                  Latitude
                  <input
                    type="number"
                    step="0.0001"
                    value={latitude}
                    onChange={(event) => setLatitude(Number(event.target.value))}
                  />
                </label>
                <label>
                  Longitude
                  <input
                    type="number"
                    step="0.0001"
                    value={longitude}
                    onChange={(event) => setLongitude(Number(event.target.value))}
                  />
                </label>
              </div>
              <label>
                Area size
                <select
                  value={sizeMeters}
                  onChange={(event) => setSizeMeters(Number(event.target.value))}
                >
                  <option value={250}>250 × 250 m</option>
                  <option value={500}>500 × 500 m</option>
                  <option value={1000}>1 × 1 km</option>
                  <option value={2000}>2 × 2 km</option>
                </select>
              </label>
              <label>
                Terrain detail
                <select
                  value={resolution}
                  onChange={(event) => setResolution(Number(event.target.value))}
                >
                  <option value={17}>Preview · 17×17</option>
                  <option value={33}>Standard · 33×33</option>
                  <option value={65}>High · 65×65</option>
                </select>
              </label>
              <div className="provider-card">
                <span className="status-dot" />
                <div>
                  <strong>{providerStatus}</strong>
                  <span>
                    {resolution * resolution} elevation samples · approximately{" "}
                    {Math.ceil((resolution * resolution * 16) / 1024)} KB model data
                  </span>
                </div>
              </div>
              {error && <div className="inline-error">{error}</div>}
              <button
                className="button primary wide"
                disabled={busy}
                onClick={() => void addOnlineTerrain()}
              >
                {busy ? "Sampling elevation…" : "Add map + elevation"}
              </button>
              <button
                className="button secondary wide"
                onClick={() => {
                  void importTerrain();
                  onOpenChange(false);
                }}
              >
                Import local GeoTIFF instead
              </button>
              <p className="supporting-text">
                Online elevation uses Kartverket Høydedata. For full-resolution LiDAR-derived DTM,
                import a downloaded GeoTIFF.
              </p>
            </div>
            <div className="map-frame" ref={mapHostRef} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
