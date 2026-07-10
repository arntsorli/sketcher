import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import type { GlobalSettings } from "../../../shared/model";
import { useEditorStore } from "../store";

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
}

export function SettingsDialog({ open, onOpenChange }: Props) {
  const settings = useEditorStore((state) => state.settings);
  const version = useEditorStore((state) => state.version);
  const updateSettings = useEditorStore((state) => state.updateSettings);
  const [draft, setDraft] = useState<GlobalSettings | undefined>(settings);
  const [nibToken, setNibToken] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraft(settings);
    void window.sketcher.secrets
      .get("norge-i-bilder-token")
      .then((token) => setNibToken(token ?? ""));
  }, [open, settings]);

  if (!draft) return null;
  const patch = <K extends keyof GlobalSettings>(key: K, value: GlobalSettings[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  const save = async () => {
    await updateSettings(draft);
    if (nibToken.trim()) await window.sketcher.secrets.set("norge-i-bilder-token", nibToken.trim());
    else await window.sketcher.secrets.delete("norge-i-bilder-token");
    setMessage("Settings saved");
    window.setTimeout(() => onOpenChange(false), 350);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content settings-dialog">
          <div className="dialog-heading">
            <div>
              <span className="eyebrow">Sketcher</span>
              <Dialog.Title>Global settings</Dialog.Title>
              <Dialog.Description>
                Application-wide defaults. Building dimensions stay with each building.
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close settings">
              ×
            </Dialog.Close>
          </div>

          <div className="settings-grid">
            <section>
              <h3>Projects</h3>
              <label>
                Project library
                <input
                  value={draft.projectLibraryPath}
                  onChange={(event) => patch("projectLibraryPath", event.target.value)}
                />
              </label>
              <label>
                Recovery interval (seconds)
                <input
                  type="number"
                  min={10}
                  max={600}
                  value={draft.autosaveSeconds}
                  onChange={(event) => patch("autosaveSeconds", Number(event.target.value))}
                />
              </label>
            </section>
            <section>
              <h3>Modelling</h3>
              <label>
                Length units
                <input value="Millimetres (mm)" disabled />
              </label>
              <label>
                Area display
                <select
                  value={draft.areaFormat}
                  onChange={(event) => patch("areaFormat", event.target.value as "m2" | "mm2")}
                >
                  <option value="m2">Square metres (m²)</option>
                  <option value="mm2">Square millimetres (mm²)</option>
                </select>
              </label>
              <div className="field-row">
                <label>
                  Grid (mm)
                  <input
                    type="number"
                    min={1}
                    value={draft.gridSpacing}
                    onChange={(event) => patch("gridSpacing", Number(event.target.value))}
                  />
                </label>
                <label>
                  Major grid (mm)
                  <input
                    type="number"
                    min={10}
                    value={draft.majorGridSpacing}
                    onChange={(event) => patch("majorGridSpacing", Number(event.target.value))}
                  />
                </label>
              </div>
              <label>
                Snap tolerance (screen pixels)
                <input
                  type="number"
                  min={2}
                  value={draft.snapTolerance}
                  onChange={(event) => patch("snapTolerance", Number(event.target.value))}
                />
              </label>
            </section>
            <section>
              <h3>Display & navigation</h3>
              <div className="field-row">
                <label>
                  Theme
                  <select
                    value={draft.theme}
                    onChange={(event) =>
                      patch("theme", event.target.value as GlobalSettings["theme"])
                    }
                  >
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                    <option value="system">System</option>
                  </select>
                </label>
                <label>
                  Graphics
                  <select
                    value={draft.graphicsQuality}
                    onChange={(event) =>
                      patch(
                        "graphicsQuality",
                        event.target.value as GlobalSettings["graphicsQuality"],
                      )
                    }
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>
              </div>
              <label>
                Canvas background colour
                <input
                  type="color"
                  value={draft.backgroundColor}
                  onChange={(event) => patch("backgroundColor", event.target.value)}
                />
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={draft.invertZoom}
                  onChange={(event) => patch("invertZoom", event.target.checked)}
                />
                Invert zoom direction
              </label>
            </section>
            <section>
              <h3>Terrain providers</h3>
              <label>
                Norge i bilder access token
                <input
                  type="password"
                  value={nibToken}
                  placeholder="Optional GeoID-backed token"
                  onChange={(event) => setNibToken(event.target.value)}
                />
              </label>
              <label>
                Terrain cache (MB)
                <input
                  type="number"
                  min={128}
                  value={draft.terrainCacheMb}
                  onChange={(event) => patch("terrainCacheMb", Number(event.target.value))}
                />
              </label>
              <p className="supporting-text">
                Provider secrets are encrypted by Windows and never written to project files.
              </p>
            </section>
          </div>
          <div className="dialog-footer">
            <span className="supporting-text">
              Sketcher {version} · MIT License · Concept design only
            </span>
            <div className="button-row">
              <Dialog.Close className="button secondary">Cancel</Dialog.Close>
              <button className="button primary" onClick={() => void save()}>
                {message || "Save settings"}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
