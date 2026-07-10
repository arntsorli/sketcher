import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import type { ProjectCard } from "../../../shared/ipc";
import { useEditorStore } from "../store";

interface Props {
  onSettings(): void;
}

export function HomePage({ onSettings }: Props) {
  const cards = useEditorStore((state) => state.cards);
  const version = useEditorStore((state) => state.version);
  const createProject = useEditorStore((state) => state.createProject);
  const openProject = useEditorStore((state) => state.openProject);
  const loadHome = useEditorStore((state) => state.loadHome);
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("Untitled");
  const [deleteCard, setDeleteCard] = useState<ProjectCard>();

  return (
    <div className="home-page">
      <header className="home-header">
        <div className="brand-lockup">
          <div className="brand-mark">S</div>
          <div>
            <strong>Sketcher</strong>
            <span>Architecture modeller</span>
          </div>
        </div>
        <button className="button ghost" onClick={onSettings}>
          Global settings
        </button>
      </header>
      <main className="home-main">
        <section className="hero-section">
          <span className="eyebrow">Local-first · millimetre precise</span>
          <h1>
            Shape the building.
            <br />
            Place it in the world.
          </h1>
          <p>
            Create parametric buildings in Builder, then compose a complete property in
            Architecture.
          </p>
          <div className="button-row">
            <button className="button primary large" onClick={() => setNewOpen(true)}>
              New project
            </button>
            <button className="button secondary large" onClick={() => void openProject()}>
              Open project
            </button>
          </div>
        </section>
        <section className="recent-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Your workspace</span>
              <h2>Recent projects</h2>
            </div>
            <span>
              {cards.length} local {cards.length === 1 ? "project" : "projects"}
            </span>
          </div>
          {cards.length === 0 ? (
            <div className="empty-state">
              <div className="empty-orbit" />
              <h3>No projects yet</h3>
              <p>Your first building starts with a line on the Z=0 grid.</p>
            </div>
          ) : (
            <div className="project-grid">
              {cards.map((card) => (
                <article className="project-card" key={card.filePath}>
                  <button
                    className="project-preview"
                    onClick={() => void openProject(card.filePath)}
                  >
                    {card.previewDataUrl ? (
                      <img src={card.previewDataUrl} alt="" />
                    ) : (
                      <div className="preview-placeholder">
                        <span>⌁</span>
                        <small>Preview created on save</small>
                      </div>
                    )}
                    {card.recoveryAvailable && <span className="recovery-badge">Recovery</span>}
                  </button>
                  <div className="project-meta">
                    <button onClick={() => void openProject(card.filePath)}>
                      <strong>{card.name || "Untitled"}</strong>
                      <span>{new Date(card.modifiedAt).toLocaleString()}</span>
                    </button>
                    <button
                      className="icon-button danger"
                      aria-label={`Delete ${card.name}`}
                      onClick={() => setDeleteCard(card)}
                    >
                      ×
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
      <footer className="home-footer">
        <span>Sketcher {version}</span>
        <span>Concept design only · MIT License</span>
      </footer>

      <Dialog.Root open={newOpen} onOpenChange={setNewOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content small-dialog">
            <Dialog.Title>New project</Dialog.Title>
            <Dialog.Description>
              Create a local .sketcher project in your library.
            </Dialog.Description>
            <label>
              Project name
              <input
                value={name}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void createProject(name).then(() => setNewOpen(false));
                }}
              />
            </label>
            <div className="dialog-footer">
              <Dialog.Close className="button secondary">Cancel</Dialog.Close>
              <button
                className="button primary"
                onClick={() => void createProject(name).then(() => setNewOpen(false))}
              >
                Create project
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={Boolean(deleteCard)}
        onOpenChange={(open) => !open && setDeleteCard(undefined)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content small-dialog">
            <span className="eyebrow danger-text">Move to Recycle Bin</span>
            <Dialog.Title>Delete “{deleteCard?.name}”?</Dialog.Title>
            <Dialog.Description>
              This moves the project and its recovery snapshot to the Windows Recycle Bin.
            </Dialog.Description>
            <code className="path-box">{deleteCard?.filePath}</code>
            <div className="dialog-footer">
              <Dialog.Close className="button secondary">Cancel</Dialog.Close>
              <button
                className="button danger-button"
                onClick={() => {
                  if (!deleteCard) return;
                  void window.sketcher.projects.trash(deleteCard.filePath).then(async () => {
                    setDeleteCard(undefined);
                    await loadHome();
                  });
                }}
              >
                Delete project
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
