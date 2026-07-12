# Sketcher

Sketcher is a local-first Windows desktop application for millimetre-accurate architectural concept design. It separates parametric building work in **Builder** mode from property and site composition in **Architecture** mode.

> Sketcher is a concept-design tool. It does not provide structural analysis, code-compliance checks, permit drawings, or construction-ready BIM output.

## Download

Download the Windows installer or portable x64 build from the [latest GitHub release](https://github.com/arntsorli/sketcher/releases/latest). The first releases are unsigned, so Windows SmartScreen may ask for confirmation.

## Current capabilities

- Local `.sketcher` project archives with previews, embedded assets, atomic saves, crash recovery, and Recycle Bin deletion.
- Z-up Three.js scene with grid, orbit camera, selection outlines, transform gizmos, a bottom viewport toolbar, clipping plane, object copy/paste, and undo/redo commands.
- Foundation polygons with grid/axis snapping, direct millimetre input, area, and dimension overlays; walls default to right angles and Ctrl+wheel applies 5° construction-axis offsets.
- Parametric floors, external/internal walls, real door/window voids, straight stairs, and a final gable roof.
- Shared building definitions, reusable building instances, Make Unique, procedural site objects, GLB/glTF import, and GLB export.
- Norwegian place search, polygon/visible-area capture from matching satellite or topographic previews, cached flat map surfaces up to 4096 pixels, and local GeoTIFF terrain import.
- Global settings and encrypted optional provider credentials.

## Development

Requirements: Windows, Node.js 22 or newer, and npm.

```powershell
npm install
npm run dev
```

Validation and packaging:

```powershell
npm run ci
npm run package
```

Detailed delivery status and remaining work are tracked in [docs/tickets.md](docs/tickets.md). Product boundaries and workflows are in [docs/product-spec.md](docs/product-spec.md).
The CC0-first policy for future bundled models and the current external-asset workflow are in [docs/asset-library.md](docs/asset-library.md).

## Project files

Projects use the `.sketcher` extension. Each file is a ZIP container with:

- `model.json` — schema-versioned parametric project data.
- `preview.webp` — home-screen preview.
- `assets/` — imported GLB/glTF content.
- `terrain/` — cached terrain source and imagery content.

The default library is `%USERPROFILE%\Documents\Sketcher Projects` and can be changed in Global Settings.

## License

[MIT](LICENSE)
