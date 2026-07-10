import { useEffect, useState } from "react";
import { EditorShell } from "./components/EditorShell";
import { HomePage } from "./components/HomePage";
import { SettingsDialog } from "./components/SettingsDialog";
import { useEditorStore } from "./store";

export default function App() {
  const screen = useEditorStore((state) => state.screen);
  const loadHome = useEditorStore((state) => state.loadHome);
  const settings = useEditorStore((state) => state.settings);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    void loadHome();
  }, [loadHome]);

  useEffect(() => {
    if (!settings) return;
    const resolved =
      settings.theme === "system"
        ? window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark"
        : settings.theme;
    document.documentElement.dataset.theme = resolved;
  }, [settings]);

  return (
    <>
      {screen === "home" ? (
        <HomePage onSettings={() => setSettingsOpen(true)} />
      ) : (
        <EditorShell onSettings={() => setSettingsOpen(true)} />
      )}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
