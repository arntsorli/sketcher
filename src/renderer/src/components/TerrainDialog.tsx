import * as Dialog from "@radix-ui/react-dialog";
import * as L from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlaceSearchResult } from "../../../shared/ipc";
import type { TerrainLayer } from "../../../shared/model";
import { useEditorStore } from "../store";
import {
  boundsPolygon,
  imageSizeForSelection,
  MAP_SOURCES,
  MAX_SELECTION_METERS,
  type MapImageMode,
  type PolygonPoint,
  polygonBounds,
  polygonCenter,
  polygonDimensionsMeters,
  staticMapImageUrl,
} from "./mapSelection";

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
}

type SelectionTool = "navigate" | "polygon";

const DEFAULT_CENTER: PolygonPoint = [10.7522, 59.9139];

export function TerrainDialog({ open, onOpenChange }: Props) {
  const mapHostRef = useRef<HTMLDivElement>(null);
  const [mapHost, setMapHost] = useState<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayersRef = useRef<Record<MapImageMode, L.TileLayer> | null>(null);
  const selectionLayerRef = useRef<L.LayerGroup | null>(null);
  const pointsRef = useRef<PolygonPoint[]>([]);
  const selectionToolRef = useRef<SelectionTool>("navigate");
  const addTerrain = useEditorStore((state) => state.addTerrain);
  const importTerrain = useEditorStore((state) => state.importTerrain);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [points, setPoints] = useState<PolygonPoint[]>([]);
  const [selectionTool, setSelectionTool] = useState<SelectionTool>("navigate");
  const [imageryMode, setImageryMode] = useState<MapImageMode>("satellite");
  const [mapStatus, setMapStatus] = useState("Loading map...");
  const [searchBusy, setSearchBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const captureMapHost = useCallback((node: HTMLDivElement | null) => {
    mapHostRef.current = node;
    setMapHost(node);
  }, []);

  const selection = useMemo(
    () => (points.length >= 3 ? polygonDimensionsMeters(points) : undefined),
    [points],
  );
  const selectionTooLarge = Boolean(
    selection &&
      (selection.width > MAX_SELECTION_METERS || selection.height > MAX_SELECTION_METERS),
  );
  const selectedImageSize = useMemo(
    () => (selection ? imageSizeForSelection(selection) : undefined),
    [selection],
  );
  const selectionReady = points.length >= 3 && selectionTool === "navigate";
  const canImport = selectionReady && !selectionTooLarge && !busy;

  useEffect(() => {
    pointsRef.current = points;
  }, [points]);

  useEffect(() => {
    selectionToolRef.current = selectionTool;
    mapHostRef.current?.setAttribute("data-drawing", String(selectionTool === "polygon"));
  }, [selectionTool]);

  useEffect(() => {
    if (!open || !mapHost || mapRef.current) return;
    const host = mapHost;
    host.dataset.mapReady = "false";
    const map = L.map(host, {
      center: [DEFAULT_CENTER[1], DEFAULT_CENTER[0]],
      zoom: 15,
      zoomControl: true,
      attributionControl: true,
    });
    const tileLayers: Record<MapImageMode, L.TileLayer> = {
      map: L.tileLayer(MAP_SOURCES.map.tileUrl, {
        attribution: MAP_SOURCES.map.attribution,
        maxZoom: 19,
      }),
      satellite: L.tileLayer(MAP_SOURCES.satellite.tileUrl, {
        attribution: MAP_SOURCES.satellite.attribution,
        maxZoom: 19,
      }),
    };
    tileLayers.map.setOpacity(0).addTo(map);
    tileLayers.satellite.addTo(map);
    const selectionLayer = L.layerGroup().addTo(map);
    L.control.scale({ imperial: false, maxWidth: 120, position: "bottomright" }).addTo(map);
    map.doubleClickZoom.disable();
    map.on("click", (event) => {
      if (selectionToolRef.current !== "polygon") return;
      const current = pointsRef.current;
      const first = current[0];
      if (first && current.length >= 3) {
        const firstPixel = map.latLngToContainerPoint([first[1], first[0]]);
        const clickPixel = map.latLngToContainerPoint(event.latlng);
        if (firstPixel.distanceTo(clickPixel) <= 14) {
          setSelectionTool("navigate");
          setMapStatus("Polygon selected");
          return;
        }
      }
      const next: PolygonPoint = [event.latlng.lng, event.latlng.lat];
      setPoints((currentPoints) => [...currentPoints, next]);
      setError(undefined);
      setMapStatus("Drawing polygon");
    });
    const resizeObserver = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resizeObserver.observe(host);
    mapRef.current = map;
    tileLayersRef.current = tileLayers;
    selectionLayerRef.current = selectionLayer;
    host.dataset.mapReady = "true";
    setMapStatus("Map ready");
    window.setTimeout(() => map.invalidateSize({ pan: false }), 0);
    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      tileLayersRef.current = null;
      selectionLayerRef.current = null;
    };
  }, [open, mapHost]);

  useEffect(() => {
    const layer = selectionLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    const latLngs = points.map(([longitude, latitude]) => L.latLng(latitude, longitude));
    if (latLngs.length >= 3) {
      L.polygon(latLngs, {
        color: "#e8f8ff",
        weight: 3,
        fillColor: "#39b8f2",
        fillOpacity: 0.25,
      }).addTo(layer);
    } else if (latLngs.length >= 2) {
      L.polyline(latLngs, { color: "#e8f8ff", weight: 3 }).addTo(layer);
    }
    for (const point of latLngs) {
      L.circleMarker(point, {
        radius: 6,
        color: "#0877a8",
        weight: 3,
        fillColor: "#ffffff",
        fillOpacity: 1,
      }).addTo(layer);
    }
  }, [points]);

  useEffect(() => {
    const layers = tileLayersRef.current;
    if (!layers) return;
    layers.map.setOpacity(imageryMode === "map" ? 1 : 0);
    layers.satellite.setOpacity(imageryMode === "satellite" ? 1 : 0);
  }, [imageryMode]);

  const search = async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      setError("Enter a Norwegian place or address to search.");
      return;
    }
    setSearchBusy(true);
    setError(undefined);
    try {
      const found = await window.sketcher.terrain.search(trimmed);
      setResults(found);
      if (found.length === 0) setError(`No places found for “${trimmed}”.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSearchBusy(false);
    }
  };

  const choose = (result: PlaceSearchResult) => {
    mapRef.current?.flyTo([result.latitude, result.longitude], 17, { duration: 0.7 });
    setPoints([]);
    setSelectionTool("navigate");
    setResults([]);
    setMapStatus(`Showing ${result.name}`);
    setError(undefined);
  };

  const startPolygon = () => {
    setPoints([]);
    setSelectionTool("polygon");
    setMapStatus("Click map points to draw the area");
    setError(undefined);
  };

  const finishPolygon = () => {
    if (points.length < 3) {
      setError("Add at least three polygon points before finishing.");
      return;
    }
    setSelectionTool("navigate");
    setMapStatus("Polygon selected");
    setError(undefined);
  };

  const useVisibleBounds = () => {
    const map = mapRef.current;
    if (!map || mapHostRef.current?.dataset.mapReady !== "true") {
      setError("Wait for the map to finish loading.");
      return;
    }
    const bounds = map.getBounds();
    const next = boundsPolygon({
      west: bounds.getWest(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      north: bounds.getNorth(),
    });
    setPoints(next);
    setSelectionTool("navigate");
    const dimensions = polygonDimensionsMeters(next);
    setMapStatus("Visible map area selected");
    setError(
      dimensions.width > MAX_SELECTION_METERS || dimensions.height > MAX_SELECTION_METERS
        ? "The visible area is larger than 2 × 2 km. Zoom in and try again."
        : undefined,
    );
  };

  const clearSelection = () => {
    setPoints([]);
    setSelectionTool("navigate");
    setMapStatus("Map ready");
    setError(undefined);
  };

  const addSelectedMap = async () => {
    if (!canImport || !selection) {
      setError("Finish a map selection within 2 × 2 km before importing.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const bounds = polygonBounds(points);
      const imageSize = selectedImageSize ?? imageSizeForSelection(selection);
      const imageryBase64 = await window.sketcher.terrain.fetchImage(
        staticMapImageUrl(bounds, imageryMode, imageSize),
      );
      const id = crypto.randomUUID();
      const anchor = polygonCenter(points);
      const layer: TerrainLayer = {
        id,
        name: `${imageryMode === "satellite" ? "Satellite" : "Topographic map"} ${anchor[1].toFixed(4)}, ${anchor[0].toFixed(4)}`,
        provider: "custom",
        attribution: MAP_SOURCES[imageryMode].attribution,
        boundsWgs84: [bounds.west, bounds.south, bounds.east, bounds.north],
        clipPolygonWgs84: points,
        sourceEpsg: "EPSG:4326",
        anchorWgs84: anchor,
        absoluteAnchorElevation: 0,
        verticalOffset: 0,
        widthMm: Math.max(1, selection.width * 1000),
        heightMm: Math.max(1, selection.height * 1000),
        imageryArchivePath: `${id}-${imageryMode}.${imageryMode === "satellite" ? "jpg" : "png"}`,
        gridSize: [2, 2],
        elevationsMm: [0, 0, 0, 0],
        visible: true,
      };
      addTerrain(layer, undefined, imageryBase64);
      onOpenChange(false);
      window.setTimeout(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "f" }));
      }, 120);
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
              <Dialog.Title>Select a map area</Dialog.Title>
              <Dialog.Description>
                Search or navigate to a site, select the visible frame or draw a polygon, then
                import it as a cached surface.
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close map dialog">
              ×
            </Dialog.Close>
          </div>

          <div className="terrain-layout">
            <aside className="terrain-controls">
              <section className="map-step">
                <span className="map-step-number">1</span>
                <div>
                  <strong>Find the site</strong>
                  <p>Search for a Norwegian place or pan and zoom directly on the map.</p>
                </div>
              </section>
              <div className="search-row">
                <input
                  aria-label="Search Norwegian place or address"
                  placeholder="Search place or address..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void search();
                  }}
                />
                <button
                  className="button secondary"
                  disabled={searchBusy}
                  onClick={() => void search()}
                >
                  {searchBusy ? "Searching..." : "Search"}
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
                      <span>{result.municipality ?? "Norway"}</span>
                    </button>
                  ))}
                </div>
              )}

              <section className="map-step">
                <span className="map-step-number">2</span>
                <div>
                  <strong>Choose imagery</strong>
                  <p>The preview and imported image use the same source.</p>
                </div>
              </section>
              <fieldset className="map-style-switch">
                <legend className="sr-only">Map image style</legend>
                <button
                  className={imageryMode === "satellite" ? "active" : ""}
                  onClick={() => setImageryMode("satellite")}
                >
                  Satellite
                </button>
                <button
                  className={imageryMode === "map" ? "active" : ""}
                  onClick={() => setImageryMode("map")}
                >
                  Topographic
                </button>
              </fieldset>

              <section className="map-step">
                <span className="map-step-number">3</span>
                <div>
                  <strong>Select the area</strong>
                  <p>Capture the current view or click a precise polygon.</p>
                </div>
              </section>
              <div className="map-selection-actions">
                <button className="button secondary" onClick={useVisibleBounds}>
                  Use visible map area
                </button>
                <button
                  className={`button secondary ${selectionTool === "polygon" ? "active" : ""}`}
                  onClick={startPolygon}
                >
                  Draw polygon
                </button>
                {selectionTool === "polygon" && (
                  <button
                    className="button primary"
                    disabled={points.length < 3}
                    onClick={finishPolygon}
                  >
                    Finish polygon
                  </button>
                )}
                <button
                  className="button ghost"
                  disabled={points.length === 0}
                  onClick={() => setPoints((current) => current.slice(0, -1))}
                >
                  Undo point
                </button>
                <button
                  className="button ghost"
                  disabled={points.length === 0}
                  onClick={clearSelection}
                >
                  Clear
                </button>
              </div>

              <div className={`map-selection-summary ${selectionReady ? "ready" : ""}`}>
                <span className="status-dot" />
                <div>
                  <strong>{selectionReady ? "Area ready to import" : mapStatus}</strong>
                  <span>
                    {points.length} point{points.length === 1 ? "" : "s"}
                    {selection &&
                      ` · ${Math.round(selection.width)} × ${Math.round(selection.height)} m · ${Math.round(selection.area).toLocaleString()} m²${selectedImageSize ? ` · ${selectedImageSize.width} × ${selectedImageSize.height} px` : ""}`}
                  </span>
                </div>
              </div>
              {selectionTooLarge && (
                <div className="inline-error">Keep the selected area within 2 × 2 km.</div>
              )}
              {error && <div className="inline-error">{error}</div>}
              <button
                className="button primary wide map-import-button"
                disabled={!canImport}
                onClick={() => void addSelectedMap()}
              >
                {busy ? "Downloading map image..." : "Import selected map area"}
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
                The imported layer is a cached, flat planning surface at Z=0. Elevation and LiDAR
                are not included in this workflow.
              </p>
            </aside>

            <div className="map-workspace">
              <div
                className="map-frame"
                ref={captureMapHost}
                role="application"
                aria-label="Map area selector"
                data-map-ready="false"
                data-drawing="false"
              />
              <div className="map-instruction" aria-live="polite">
                {selectionTool === "polygon"
                  ? "Click corners on the map. Click the first point or Finish polygon when done."
                  : "Drag to pan, scroll to zoom, or capture the visible map area."}
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
