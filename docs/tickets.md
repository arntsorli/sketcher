# Sketcher Delivery Tickets

This is the authoritative delivery ledger for the first complete Sketcher release. A ticket is **Done** only when implementation and its listed verification both pass. Update status and evidence in the same change that advances a ticket.

## Status overview

| ID | Workstream | Status | Depends on | Verification gate |
|---|---|---|---|---|
| SK-001 | Relocate and isolate repository | Done | — | Correct independent git root |
| SK-002 | Desktop scaffold and secure process boundary | Done | SK-001 | Typecheck, build, packaged Electron smoke |
| SK-003 | Project archive, atomic save, recovery, recent library | In progress | SK-002 | Persistence failure-path integration tests |
| SK-004 | Home screen and confirmed deletion | In progress | SK-003 | Scaling and keyboard interaction QA |
| SK-005 | Versioned domain schema and migrations | Done | SK-002 | Migration, integrity, and future-version tests |
| SK-006 | Undoable editor state and global settings | In progress | SK-005 | Command coalescing and failure-path tests |
| SK-007 | Three.js viewport, navigation, selection, transforms | In progress | SK-006 | Transform/rebuild and large-coordinate tests |
| SK-008 | Foundation drawing and dimensions | Done for v0.1.4 | SK-007 | Unit, smoke, and direct-input persistence E2E |
| SK-009 | Floors and wall modelling | In progress | SK-008 | Snap/alignment and dependency tests |
| SK-010 | Openings, stairs, and gable roof | In progress | SK-009 | Geometry golden tests |
| SK-011 | Geometry worker and Manifold integration | In progress | SK-010 | All-solid coverage, cancellation, golden tests |
| SK-012 | Building library and shared instances | In progress | SK-009 | Shared/unique propagation automation |
| SK-013 | Scene objects and GLB interchange | In progress | SK-007 | Textured GLB round-trip fixtures |
| SK-014 | Terrain provider framework and online Norway terrain | In progress | SK-007 | Live provider and cached offline-reopen smoke |
| SK-015 | GeoTIFF and optional orthophoto providers | In progress | SK-014 | GeoTIFF fixture and credential-path tests |
| SK-016 | Accessibility, performance, and failure hardening | In progress | SK-004–SK-015 | E2E, profiling, corrupt input suite |
| SK-017 | Documentation and operator guidance | In progress | All feature tickets | Workflow illustrations and user guide |
| SK-018 | Windows CI, packaging, and release automation | Done for tagged releases | SK-016 | Green public Actions and release runs |
| SK-019 | Public GitHub publication | Done | SK-018 | Public remote, clean main, green workflow |
| SK-020 | Configurable canvas background colour | Done | SK-006, SK-007 | Settings persistence, viewport application, and contrast check |
| SK-021 | Top-down Builder and assisted opening placement | Done for v0.1.3 | SK-008–SK-010 | Top-view, snapping, preview, clearance, and finalized-dimension smoke |
| SK-022 | Foundation robustness and E2E automation | In progress | SK-003, SK-008, SK-016 | Direct-input save/reopen E2E plus broader workflow coverage |
| SK-023 | Foundation legibility and grid snap | In progress | SK-008 | Visual and direct-input grid-snap smoke |
| SK-024 | Envelope alignment and roof closure | In progress | SK-009, SK-010 | Exterior-face, eave, and wall-to-roof geometry tests |
| SK-025 | Flat map-image layer MVP | In progress | SK-014 | Add/reopen map-image layer without elevation service |
| SK-026 | Expanded site-object library | In progress | SK-013 | Procedural asset placement and persistence smoke |
| SK-027 | Carport and garage openings | In progress | SK-010 | Opening preview, clearance, persistence, and wall-void tests |
| SK-028 | Redistributable asset-pack policy | Todo | SK-013, SK-026 | License review and import workflow documentation |
| SK-029 | Wall corner joinery | Todo | SK-009, SK-011 | Miter/trim geometry tests for straight and angled wall junctions |
| SK-030 | Builder floor-isolation visibility | Todo | SK-009, SK-010 | Multi-floor Builder visibility smoke |
| SK-031 | Architecture floor inspection | Todo | SK-007, SK-012 | Per-instance floor visibility and selection smoke |
| SK-032 | Delete selected scene items | Todo | SK-007, SK-013 | Keyboard deletion, confirmation, undo, and persistence tests |
| SK-033 | Primitives, polygon faces, and extrusion | In progress | SK-007, SK-013 | Persisted polygon/extrusion geometry and desktop modelling smoke |

## Ticket details

### SK-001 — Relocate and isolate repository

**Outcome:** Development occurs in an independent repository at `C:\Repos\sketcher`, never in the OneDrive workspace or the parent `C:\Repos` checkout.

**Completed work**

- Created and verified an independent Git repository on `main` at `C:\Repos\sketcher`.
- Confirmed `git rev-parse --show-toplevel` resolves to the target repository.
- Moved all project source out of the OneDrive workspace.

The old path may continue to contain `.codex`, `.agents`, or turn-diff metadata owned by the desktop host. Those are not Sketcher source and are intentionally not deleted while the active task uses them.

**Acceptance**

- Target git root is exactly `C:/Repos/sketcher`.
- Source contains no Sketcher application or documentation files.
- Target begins clean after the initial publication commit.

### SK-002 — Desktop scaffold and secure process boundary

**Outcome:** Electron, React, TypeScript, and Vite build a Windows-first app with no Node access in the renderer.

**Implemented**

- Sandboxed, context-isolated renderer with Node integration disabled.
- Narrow preload bridge and sender validation for all privileged IPC.
- CSP, navigation blocking, window-open denial, app identity, and Electron Builder config.
- Biome, TypeScript, Vitest, build, CI, installer, and portable scripts.

**Acceptance**

- `npm run typecheck`, `npm run check`, tests, and production build pass.
- Packaged application launches without Electron security warnings caused by app configuration.
- Renderer cannot access `require`, `process`, arbitrary filesystem paths, or raw IPC.

### SK-003 — Project archive, atomic save, recovery, and library

**Outcome:** `.sketcher` files are safe, shareable, offline project containers.

**Implemented**

- ZIP entries for model JSON, WebP preview, imported assets, and terrain cache.
- Zod validation on pack and unpack.
- Atomic temp/backup replacement preserving the previous valid save on failure.
- Configurable project library, recent index, Save As, 30-second recovery default, restore/discard, and Recycle Bin integration.
- Playwright E2E covers create, normal Save, Home reopen, and Builder re-entry for a real `.sketcher` project.

**Todo / hardening**

- Improve unsupported-future-version error presentation in the Home UI.
- Add corrupt ZIP, interrupted save, stale recent entry, and recovery precedence tests.
- Ensure external opened projects are removed from recent index after deletion.

**Acceptance**

- Create, save, reopen, recover, Save As, and delete survive application restart.
- Failed save never destroys the last valid project.
- Imported assets and terrain reopen with networking disabled.

### SK-004 — Home screen and confirmed deletion

**Outcome:** The start page clearly manages local projects.

**Implemented**

- New/Open actions, preview cards, names, timestamps, recovery badges, empty state, version, and settings access.
- Custom deletion dialog includes project name/path and explicit Recycle Bin wording.

**Todo / verification**

- Visual QA at 1080p, 1440p, 100%, 125%, and 150% Windows display scaling.
- Keyboard-only dialog and card navigation.
- Friendly UI for a corrupt project card instead of silently omitting it.

### SK-005 — Versioned domain schema and migrations

**Outcome:** Parametric project data remains renderer-independent and safely upgradeable.

**Implemented**

- Schemas for project settings, building definitions/instances, floors, walls, openings, stairs, roofs, assets, transforms, georeference, and terrain layers.
- Authoritative millimetre data and disposable render geometry.

**Verification completed**

- Version-zero documents migrate through the explicit registry to schema version one.
- Future versions are rejected before unpacked state can be modified.
- Definition, floor, wall, opening, asset, and terrain references receive integrity validation.
- Unit tests cover migration, rejection, and integrity failures.

### SK-006 — Undoable editor state and global settings

**Outcome:** Every model edit is reversible and application-wide settings live in one place.

**Implemented**

- Serializable snapshot command history with 100-step undo/redo.
- Dirty tracking, manual save, recovery scheduling, mode/tool/selection state, and keyboard shortcuts.
- Global project path, autosave, area, grid, snap, theme, graphics, canvas background colour, navigation, cache, provider token, version, and license UI.
- Secrets use Electron `safeStorage` and remain outside projects.

**Todo**

- Coalesce repeated numeric/property changes and continuous transforms into one history command.
- Apply theme, graphics quality, invert zoom, and global grid defaults live. Canvas background colour already applies live with contrasting grid colours.
- Add dirty-close failure handling rather than returning home if Save fails.

### SK-007 — Three.js viewport, navigation, selection, and transforms

**Outcome:** A stable Z-up 3D canvas supports site-scale editing.

**Implemented**

- Perspective camera, Z-up orbit controls, XY grid at Z=0, lighting, shadows, fog, resize handling, and metre-scaled rendering.
- Scene/domain rebuild adapter, ray picking, whole-building grouping, outline pass, transform gizmos, rotation snapping, focus shortcut, and export root.
- Keyboard transform modes: G translate, R rotate, S object scale, F focus.
- Configurable canvas background with automatic grid contrast for light and dark custom colours.

**Todo / hardening**

- Camera-relative floating origin for positions approaching the 2 km target.
- Prevent empty transform commands when no value changed.
- Add graphics-quality presets and GPU resource accounting.
- Verify hidden-edge outlining and transform controls across rebuilt scene objects.

### SK-008 — Foundation drawing and dimensions

**Outcome:** The acceptance foundation can be drawn intuitively and precisely.

**Implemented**

- Grid and construction-axis snapping, closure snapping, 5° Shift+wheel offset, provisional geometry, direct numeric input, validation, area, perimeter, and automatic transition to wall work.
- Builder uses a locked orthographic top view with no camera rotation; nearby vertices and edges take priority over axes and grid using an aggressive screen-scaled snap radius.
- Projected SVG dimension lines, end stops, aligned millimetre labels, and Builder-only display.
- Self-intersection, zero-length, too-few-points, and zero-area checks. Crossing and duplicate edges are rejected before entering the draft; Backspace and the visible Undo last point action recover individual vertices without discarding the polygon.
- Direct-input E2E creates a 5000×8000 mm foundation, removes/re-adds a point, saves, reopens, and verifies the 40.00 m² definition in Builder.

**Todo / hardening**

- Add depth/occlusion fading for dimension labels.
- Add explicit snap-target glyphs for edges and axis/grid intersections, not only the highlighted foundation closure target.

**Acceptance scenario**

- Direct input produces a 5000×8000 mm closed foundation.
- Area displays 40.00 m² and perimeter 26,000 mm.
- Shift+wheel changes the active axis exactly 5° per detent and does not zoom.

### SK-009 — Floors and wall modelling

**Outcome:** Buildings support reusable defaults and multiple editable stories.

**Implemented**

- Default external/internal thickness, floor height, slab thickness, active-floor panel, floor addition, and recalculated elevations.
- Wall drawing, automatic footprint classification, manual type/thickness/alignment overrides, per-floor wall lists, and generated wall solids.

**Todo / hardening**

- Snap walls to existing endpoints, corners, and edges with visible snap markers.
- Implement floor reorder and dependency-aware floor deletion dialog.
- Automatic exterior walls now align their outer face to the footprint boundary for either winding; add explicit visual tests for manual inside/centre/outside overrides.
- Recompute only auto-classified walls after footprint edits.

### SK-010 — Openings, stairs, and gable roof

**Outcome:** The complete building shell includes usable vertical circulation and openings.

**Implemented**

- Door/window placement on the nearest wall with defaults, sill constraints, property editing, overlap validation, and actual wall void geometry made from non-overlapping wall pieces.
- Straight-stair riser derivation, rendered steps, and stair clearance cut from the slab above.
- Thick gable roof panels with pitch, overhang, thickness, ridge rotation, and flip controls; panel rotation now rises from each eave to the ridge rather than forming an inverted gable.
- Door/window placement previews use a wide wall snap band, translucent opening box, validity colour, and left/right clearances to the nearest wall end or opening. Finalized openings keep those dimensions visible in Builder mode.

**Todo / hardening**

- Clip roof panels to arbitrary concave footprints; the current first-release generator follows oriented footprint bounds.
- Add explicit ridge edge selection in addition to 90° ridge rotation.
- Add one-click dependency confirmation when deleting floors, stairs, or openings.

### SK-011 — Geometry worker and Manifold integration

**Outcome:** Expensive solid generation is cancellable, watertight, and never blocks the UI.

**Implemented**

- Module worker initialization for `manifold-3d`, progress reporting, request cancellation, and explicit WASM object deletion.
- Indexed wall solids with real opening subtraction, bounds metadata, and renderer-side replacement.
- Deterministic segmented-wall fallback when WASM or a request fails.
- Development and packaged-runtime smoke checks verify worker readiness and generated wall geometry.

**Todo**

- Convert slabs, stair voids, and roofs to Manifold worker requests.
- Add golden bounds, volume, watertightness, cancellation, and memory-release tests.

### SK-012 — Building library and shared instances

**Outcome:** Definitions are reusable and instances preserve parametric sharing.

**Implemented**

- Project-local building library, new/edit actions, one-click placement, whole-group selection, definition editing, shared updates, and Make Unique cloning.

**Todo / hardening**

- Buildings now enter a translucent grid-snapped pointer preview and are placed by click; Escape cancels without mutating the scene.
- Generate definition thumbnails and expose rename/delete with dependency confirmation.
- Desktop E2E places two shared instances, runs Make Unique on the second, and confirms the cloned definition is visible before save/reopen. Add a definition-edit propagation/isolation assertion next.

### SK-013 — Scene objects and GLB interchange

**Outcome:** A site can contain normal objects and exchange common 3D content.

**Implemented**

- Procedural car, deciduous tree, conifer, person, and box assets.
- Content-hash deduplication, embedded GLB/glTF data, instance transforms, scene listing, picking, focus, and GLB scene export.

**Todo / hardening**

- Validate imported glTF external-resource references and provide a clear unsupported message.
- Export selected building as a separate option, retain millimetre metadata, and verify textures/materials.
- Built-in asset buttons now enter a translucent grid-snapped pointer preview and click-to-place flow; add asset rename/delete and GLB placement preview.
- Test GLB round-trip with compressed and textured fixtures.

### SK-014 — Terrain provider framework and online Norway terrain

**Outcome:** Norwegian public map/elevation data becomes an offline-capable scene layer.

**Implemented**

- Place search, coordinate entry, map click, AOI overlay, 250 m–2 km sizes, detail selection, estimated model data, and attribution.
- Kartverket WMTS capabilities discovery with public Topo fallback.
- Høydedata batch sampling up to 65×65 points, local centre normalization, map texture capture, embedded cache, and terrain mesh generation.
- Live smoke verification against Kartverket/Høydedata produced a normalized, map-textured terrain layer and retained it in the project archive model.

**Todo / hardening**

- Add request progress, cancellation, retry, per-provider timeout, and offline cached-service messaging.
- Reopen a cached terrain project with networking disabled; current smoke validates acquisition and archive embedding, not the offline restart path.
- Chunk and LOD terrain rather than a single mesh; enforce resident triangle/cache budgets.
- Use reprojection metadata and UTM local anchor rather than an EPSG:4258-only sampled grid.
- Add provider contract tests with recorded fixtures so CI does not depend on live services.

### SK-015 — GeoTIFF and optional orthophoto providers

**Outcome:** Detailed local elevation and credentialed imagery extend the public defaults.

**Implemented**

- Local GeoTIFF picker, downsampled first-band decoding, no-data handling, EPSG extraction, EUREF89/UTM transforms for zones 32/33/35, georeferenced bounds, centre normalization, embedded source, and offline render.
- Encrypted optional Norge i bilder token setting.

**Todo**

- Expand GeoTIFF support beyond the first elevation band and supported EUREF89/UTM/geographic CRS set.
- Move GeoTIFF decoding/mesh generation to a cancellable worker.
- Implement authenticated Norge i bilder capabilities/token-expiry flow and imagery selection.
- Add configurable HTTPS XYZ/WMS provider with attribution and credentials.
- Add GeoTIFF fixtures for projected DTM, geographic imagery, no-data, and large raster downsampling.

### SK-016 — Accessibility, performance, and failure hardening

**Outcome:** The complete workflow is safe and responsive on a representative Windows machine.

**Implemented baseline**

- Playwright Electron E2E now runs in Windows CI after the focused runtime smoke. It covers direct numeric foundation creation, point undo, Save, Home reopen, and Builder re-entry.

**Todo**

- Keyboard traversal and visible focus across home, tool rail, inspector, map, and all dialogs.
- Accessible names/status announcements for canvas tools and asynchronous operations.
- Corrupt project, invalid GLB, invalid GeoTIFF, expired token, offline service, worker crash, disk-full, and locked-file UI.
- Profile one property with several buildings, hundreds of objects, and a 2 km terrain layer.
- Enforce texture, triangle, project archive, and terrain cache limits with actionable warnings.

### SK-017 — Documentation and operator guidance

**Outcome:** A user can install, model, exchange, and understand the limitations without reading source code.

**Implemented**

- README, product specification, compact implementation order, and this detailed ticket ledger.

**Todo**

- Add illustrated capture-style guides for project entry, direct input, walls/openings, shared instances, GLB exchange, terrain sources, and scale verification.
- Document controls, shortcuts, `.sketcher` recovery, provider credentials, attribution, and offline behaviour.
- Document concept-design limitations prominently in app, README, and release notes.

### SK-018 — Windows CI, packaging, and release automation

**Outcome:** Every code-changing `main` commit is checked and produces a rolling latest Windows build; version tags retain downloadable historical snapshots.

**Implemented**

- Windows GitHub Actions for install, Biome, typecheck, unit tests, build, package, and dependency audit.
- Tagged release workflow for NSIS and portable x64 artifacts, checksums, and generated release notes.
- Application metadata and icon plus successful local NSIS, portable, and unpacked-runtime smoke runs.
- Code-changing pushes to `main` now clean `release/`, package fresh NSIS/portable artifacts, replace the rolling `latest` release assets and checksums, and mark that release as GitHub Latest. Markdown-only changes do not consume a packaging run.

**Verification completed**

- Public Windows CI and `v0.1.4` release workflows completed successfully.
- The release contains the NSIS setup executable, portable x64 executable, and SHA-256 checksum file.

**Remaining hardening**

- Perform a fresh-machine install/uninstall pass and document unsigned SmartScreen behaviour with screenshots.
- Add an explicit artifact-retention policy if nightly/history builds are introduced; the rolling latest release intentionally retains only its current files.
- Privacy review now runs in `npm run ci` and rejects tracked home paths, personal emails, private keys, and common credential tokens before publishing.

### SK-019 — Public GitHub publication

**Outcome:** `github.com/arntsorli/sketcher` is public, reproducible, and green.

**Completed**

- Reviewed and committed only the Sketcher source tree; generated builds, smoke state, captures, and dependencies remain ignored.
- Published the public `arntsorli/sketcher` repository with `main` as its default branch.
- Added description and architecture, CAD, Electron, Three.js, TypeScript, and Windows topics.
- Verified Windows CI and the public `v0.1.4` release workflow, release assets, and checksums.

### SK-020 — Configurable canvas background colour

**Outcome:** The 3D canvas remains comfortable to inspect in rooms, on bright displays, and with different model materials.

**Completed**

- Added a native colour picker to Global Settings for the canvas background.
- Persisted the six-digit hex colour in application settings, with a light neutral default.
- Applied the setting live to the Three.js background, fog, and renderer clear colour.
- Adjusted grid colours automatically to preserve contrast for both light and dark custom backgrounds.

**Acceptance**

- Changing and saving the colour updates the active canvas immediately and remains selected after restart.
- Grid lines remain visible against both a light and a dark user-selected colour.

### SK-021 — Top-down Builder and assisted opening placement

**Outcome:** Foundation, wall, door, and window creation stays precise and legible without fighting a perspective camera.

**Completed**

- Builder now uses a locked orthographic top-to-bottom view; panning and zoom remain available while camera rotation is disabled.
- Foundation and wall snapping now prioritizes nearby vertices, then edges, then construction axes, then grid, with a screen-scaled aggressive radius.
- Door/window tools preview the snapped opening with a transparent placement box, highlighted wall band, valid/invalid colour, and a generous 1200 mm snap zone.
- Preview and finalized openings show left/right clearances to the closest wall end or adjacent opening, plus the opening width in the dimension overlay.
- Unit tests cover placement, clearance, and overlap rejection; desktop smoke covers locked view, preview, commit, and final clearance dimensions.

**Follow-up**

- Add visible snap-target glyphs and configurable opening presets/clearance defaults.

### SK-022 — Foundation robustness and E2E automation

**Outcome:** The principal modelling workflow catches draft errors early and remains protected by real desktop workflows, not only isolated geometry tests.

**Implemented**

- Reject duplicate and crossing foundation segments before they are added to the draft.
- Make closure a precise snap to the highlighted first vertex; Enter also closes when the closure snap is active.
- Preserve placed vertices when Escape cancels a segment; Backspace and a tool-rail action remove only the last point.
- Add a separate Playwright E2E script and Windows CI job for direct-input foundation creation, undo, save, reopen, and Builder edit verification.

**Remaining coverage**

- The desktop E2E now also places two shared building instances, runs Make Unique on one, adds a hedge through a visible pointer preview, saves, reopens, and confirms the persisted scene counts.
- Add E2E journeys for multi-room walls, doors/windows, stairs, roof persistence, Make Unique propagation, asset GLB interchange, delete/recovery, terrain offline reopening, and corrupt-file/error handling.
- Add visual assertions for snap glyphs, dimension readability, screen scaling, and selected-object outlines.

### SK-023 — Foundation legibility and grid snap

**Outcome:** A foundation stays unmistakable against a light or dark canvas, and every blank-canvas click has an obvious, dependable grid target.

**In progress**

- Increased the Builder grid opacity and added a high-contrast translucent foundation fill, dark draft edge, and orange current snap glyph.
- Grid remains the fallback after explicit vertex, edge, and construction-axis targets; blank-canvas points snap to the configured grid.
- Unit coverage verifies grid rounding; visual/screen-scaling assertions remain open.

### SK-024 — Envelope alignment and roof closure

**Outcome:** The exterior face of an outer wall lies on the foundation boundary, and the roof fully encloses the final storey without daylight gaps.

**In progress**

- Corrected automatic external-wall alignment for both clockwise and counter-clockwise footprints so the wall solid grows toward the interior.
- Roof elevation now starts at the final wall top, and the default gable is a closed, triangulated footprint volume with roof-edge infill rather than separate bounded panels.
- Geometry unit tests cover both footprint windings and an L-shaped roof's enclosing bounds.
- Remaining: explicit ridge-edge selection, an exact offset algorithm for concave overhangs, and visual coverage for rotated foundations.

### SK-025 — Flat map-image layer MVP

**Outcome:** A selected Norwegian map area can be added as a cached, flat Z=0 image plane even when elevation/LiDAR services are unavailable.

**In progress**

- Rebuilt the workflow from the proven sibling SiteForge/Yard Planner pattern, adapted to Electron with a Leaflet raster selector so it does not compete with the Three.js viewport for WebGL. It provides native pan/zoom, map-native polygon clicks, explicit finish/undo/clear actions, and a one-click Use visible map area option.
- Search flies to live Geonorge place results. Satellite and topographic modes now use matching Esri preview and extraction sources instead of a fragile capabilities-derived preview paired with a different capture source.
- Capture requests retain the selected bounds' aspect ratio instead of stretching every selection into a square image. Invalid provider responses are rejected before they enter the project archive.
- Render the selected vertices and closed polygon directly on the map, report dimensions and area, and reject selections wider or taller than 2 km.
- Cache the image through the narrow Electron IPC allow-list, add it as a clipped Z=0 scene surface with source bounds and attribution, select it, and frame it automatically after import.
- Unit coverage verifies bounds selection, metre/area calculation, aspect-correct extraction, persisted polygon data, UV mapping, and clipped render geometry. The live Electron smoke searches, validates visible-bounds capture, draws and finishes a polygon, imports it, and confirms the scene layer.
- Remaining: offline-restart E2E, editable polygon drag handles, blend preview, and a dedicated attribution panel. Elevation, GeoTIFF, LiDAR-derived terrain, and high-resolution orthophoto remain follow-on work rather than prerequisites.

### SK-026 — Expanded site-object library

**Outcome:** Site composition includes practical, redistributable procedural garden and utility objects.

**In progress**

- Added scalable hedge and fence segments, a garbage shed, flag pole, and birch tree alongside the existing car, trees, person, and box.
- Definitions remain project-level built-ins and reuse the existing instanced-placement flow.
- Remaining: place/persist each new type in E2E and add material/LOD variants.

### SK-027 — Carport and garage openings

**Outcome:** A garage/carport opening uses the same clear placement preview and real wall void as doors and windows, at suitable vehicle dimensions.

**In progress**

- Added a Carport Builder tool with a 3,000×2,200 mm default plus 2,500×2,100 and 3,000×2,200 mm presets in Properties.
- It reuses the wide wall snapping, translucent preview, clearance dimensions, invalid-placement handling, property editing, and Boolean wall-opening path.
- Schema coverage persists the new opening type; add a dedicated desktop placement/persistence E2E next.

### SK-028 — Redistributable asset-pack policy

**Outcome:** Optional external trees, cars, and garden items can be sourced without accidentally redistributing incompatible models.

**Todo**

- Document a CC0-first asset policy, retain attribution/license metadata for any bundled non-CC0 item, and keep user-imported assets separate.
- Evaluate curated sources and only bundle models when their licence permits redistribution in the Windows package.

### SK-029 — Wall corner joinery

**Outcome:** Walls that meet at a shared endpoint form clean, intentional corners rather than overlapping or leaving gaps.

**Todo**

- Exterior wall pairs with one shared endpoint now derive matching inside/outside miter cuts from their actual directions and thicknesses, including non-orthogonal corners.
- Mitered walls use an extruded fallback profile so the visible join is clean while standard unjoined walls retain the Manifold path.
- T-junctions, multiple walls at one endpoint, internal-wall joins, and Manifold/export parity remain to be implemented.
- Preserve manual wall alignment/type overrides and provide a validation message for degenerate or unresolved junctions.
- Geometry tests cover 90° and angled exterior corners; add golden bounds/volume tests for acute, obtuse, T, and mixed-thickness cases.

### SK-030 — Builder floor-isolation visibility

**Outcome:** Editing a selected floor in Builder mode never leaves upper storeys or the roof obscuring the work plane.

**Todo**

- When a story floor is active, render its slab/walls/openings/stairs and every floor below it; upper storeys and the roof are hidden.
- When the roof is active, render the full building for roof inspection.
- Keep hidden floors authoritative in the model and restore normal visibility when returning to Architecture mode.
- Geometry tests verify floor 1, floor 2, and roof visibility; add the equivalent multi-storey Builder desktop smoke.

### SK-031 — Architecture floor inspection

**Outcome:** A placed building can be inspected floor-by-floor in the site without opening Builder mode or affecting other instances.

**Todo**

- Add per-selected-building visibility controls in the Architecture Inspector: show all, isolate a floor, hide floors above a selected floor, and restore all.
- Keep the setting session-only by default so an inspection view does not change the shared building definition or other placements.
- Ensure picking, outlines, focus, transforms, export visibility, and scene rebuilds respect the chosen inspection visibility.
- Add smoke coverage for selecting a placed multi-storey building, isolating a floor, and restoring the full building.

### SK-032 — Delete selected scene items

**Outcome:** Selected scene objects can be removed safely and predictably with the keyboard.

**Todo**

- Support Delete and Backspace for selected building instances, asset instances, and terrain layers in Architecture mode.
- Require confirmation for destructive deletion, naming the selected item and explaining that a building definition is retained while only its placement is removed.
- Route deletion through the command history so Undo/Redo restores/removes the same instance, and clear selection after a successful deletion.
- Add a visible Delete action in the Inspector for discoverability and accessible keyboard-equivalent behaviour.
- Test delete/cancel/undo/save/reopen for buildings, assets, and terrain layers.

### SK-033 - Primitives, polygon faces, and extrusion

**Outcome:** Architecture mode supports simple massing geometry without importing an external model.

**In progress**

- Added project-library primitives: Cube, Plane, Sphere, Cylinder, and Cone. They use the standard placement preview, grid placement, selection, transforms, undo/redo, and persistence paths.
- Added the Polygon Face tool. Click a valid closed outline on the XY grid, then create a saved scene face; Backspace removes a point, Enter completes the face, and Escape cancels the draft.
- A selected generated face exposes an Extrusion height in millimetres. Zero remains a face; a positive value creates a solid that extrudes along +Z.
- Polygon profiles are stored relative to their scene instance, so translating, rotating, and scaling behaves like other scene objects. Unit coverage verifies persistence and solid bounds; the desktop smoke creates and extrudes a face, then places a Cube.
- Remaining: face-vertex editing, holes/multiple loops, arbitrary face planes, bevel/taper, extrusion manipulator, material controls, and mesh Boolean operations.

## Release acceptance checklist

- [x] Packaged Windows application launches and reports the package version.
- [ ] Fresh-machine install/uninstall and full Home create/open/save/recover/Save As/delete journey pass.
- [x] Geometry tests confirm a 5000×8000 mm foundation reports 40.00 m² and 26,000 mm perimeter; direct-input creation is smoke tested.
- [ ] External/internal walls, a door, a window, second floor, straight stair opening, and gable roof persist after restart.
- [ ] Two shared building instances update together; Make Unique detaches one.
- [ ] Procedural and imported objects select, focus, transform, persist, and export.
- [ ] Online terrain normalizes centre elevation to Z=0 and embeds its cached map; offline restart verification remains open.
- [ ] GeoTIFF terrain imports with correct orientation, scale, and no-data handling.
- [x] Local CI, dependency audit, build, NSIS, portable packaging, and unpacked-runtime smoke pass.
- [x] Public `main` is clean, synchronized, and green.

## Latest verification evidence

The following evidence is refreshed before each publication. Any failed command reopens the affected ticket.

| Check | Current evidence |
|---|---|
| Formatting, lint, typecheck, unit tests, renderer/main build | `npm run ci` passes |
| Dependency security | `npm audit --audit-level=high` reports zero vulnerabilities |
| Desktop runtime | Home, editor, Builder direct input, sandbox boundary, and Manifold worker smoke pass |
| Terrain runtime | Live Kartverket/Høydedata terrain smoke pass with a map-textured normalized mesh |
| Windows distributions | NSIS setup, portable x64, and unpacked app build successfully; unpacked app smoke passes |
| Public delivery | `d878057` passed verify plus rolling package/publish CI; the GitHub `latest` release now contains fresh NSIS, portable x64, and SHA-256 assets, while `v0.1.4` remains the historical tagged release |
