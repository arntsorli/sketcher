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
| SK-010 | Openings, stairs, and automatic pitched roof | In progress | SK-009 | Geometry golden tests |
| SK-011 | Solid geometry worker | Deferred | SK-010 | Add only after profiling proves it necessary |
| SK-012 | Building library and shared instances | In progress | SK-009 | Shared/unique propagation automation |
| SK-013 | Scene objects and GLB interchange | In progress | SK-007 | Textured GLB round-trip fixtures |
| SK-014 | Public Norway map imagery | Done for v0.1.4 | SK-007 | Live provider and cached offline-reopen smoke |
| SK-015 | GeoTIFF terrain | In progress | SK-014 | GeoTIFF fixture tests |
| SK-016 | Accessibility, performance, and failure hardening | In progress | SK-004–SK-015 | E2E, profiling, corrupt input suite |
| SK-017 | Documentation and operator guidance | In progress | All feature tickets | Workflow illustrations and user guide |
| SK-018 | Windows CI, packaging, and release automation | Done for tagged releases | SK-016 | Green public Actions and release runs |
| SK-019 | Public GitHub publication | Done | SK-018 | Public remote, clean main, green workflow |
| SK-020 | Configurable canvas background colour | Done | SK-006, SK-007 | Settings persistence, viewport application, and contrast check |
| SK-021 | Top-down Builder and assisted opening placement | Done for v0.1.3 | SK-008–SK-010 | Top-view, snapping, preview, clearance, and finalized-dimension smoke |
| SK-022 | Foundation robustness and E2E automation | In progress | SK-003, SK-008, SK-016 | Direct-input save/reopen E2E plus broader workflow coverage |
| SK-023 | Foundation legibility and grid snap | In progress | SK-008 | Visual and direct-input grid-snap smoke |
| SK-024 | Envelope alignment and roof closure | Done for v0.1.4 | SK-009, SK-010 | Exterior-face, eave, and wall-to-roof geometry tests |
| SK-025 | Flat map-image layer MVP | Done for v0.1.4 | SK-014 | Add map-image layer without elevation service |
| SK-026 | Expanded site-object library | In progress | SK-013 | Procedural asset placement and persistence smoke |
| SK-027 | Carport and garage openings | Done for v0.1.4 | SK-010 | Preset/override and shared wall-void tests |
| SK-028 | Redistributable asset-pack policy | Todo | SK-013, SK-026 | License review and import workflow documentation |
| SK-029 | Wall corner joinery | Todo | SK-009, SK-011 | Miter/trim geometry tests for straight and angled wall junctions |
| SK-030 | Builder floor-isolation visibility | Todo | SK-009, SK-010 | Multi-floor Builder visibility smoke |
| SK-031 | Architecture floor inspection | Done for v0.1.4 | SK-007, SK-012 | Per-instance floor visibility and selection smoke |
| SK-032 | Delete selected scene items | Todo | SK-007, SK-013 | Keyboard deletion, confirmation, undo, and persistence tests |
| SK-033 | Primitives, polygon faces, and extrusion | In progress | SK-007, SK-013 | Persisted polygon/extrusion geometry and desktop modelling smoke |
| SK-034 | Viewport tools, scene clipboard, clipping, and wall angles | Done for v0.1.4 | SK-007, SK-009, SK-013 | Clipboard undo, clipping-plane unit tests, and desktop modelling smoke |
| SK-035 | Reliable high-resolution satellite capture | Done for v0.1.4 | SK-025 | JPEG capture retry unit and live-provider smoke |
| SK-036 | Footprint-aware automatic pitched roof | Done for v0.1.4 | SK-010, SK-024 | L-shape, rotated, and irregular-footprint geometry tests |
| SK-037 | Builder feedback and compact section controls | Done for v0.1.4 | SK-021, SK-027, SK-034 | Immediate-angle, contrast, carport, and clipping-handle smoke/tests |
| SK-038 | Explicit outer and inner wall elements | Done for v0.1.4 | SK-009, SK-034 | Store regression and two-tool desktop smoke |

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
- Global project path, autosave, area, grid, snap, theme, canvas background colour, version, and license UI.

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

- Grid and construction-axis snapping, closure snapping, 5° Ctrl+wheel offset, provisional geometry, direct numeric input, validation, area, perimeter, and transition to the Outer Wall tool.
- Builder uses a locked orthographic top view with no camera rotation; nearby vertices and edges take priority over axes and grid using an aggressive screen-scaled snap radius.
- Projected SVG dimension lines, end stops, aligned millimetre labels, Builder-only display, and direct editing by double-clicking footprint, wall, or opening dimensions.
- Self-intersection, zero-length, too-few-points, and zero-area checks. Crossing and duplicate edges are rejected before entering the draft; Backspace and the visible Undo last point action recover individual vertices without discarding the polygon.
- Direct-input E2E creates a 5000×8000 mm foundation, removes/re-adds a point, saves, reopens, and verifies the 40.00 m² definition in Builder.

**Todo / hardening**

- Add depth/occlusion fading for dimension labels.
- Add explicit snap-target glyphs for edges and axis/grid intersections, not only the highlighted foundation closure target.

**Acceptance scenario**

- Direct input produces a 5000×8000 mm closed foundation.
- Area displays 40.00 m² and perimeter 26,000 mm.
- Ctrl+wheel changes the active axis exactly 5° per detent and does not zoom.

### SK-009 — Floors and wall modelling

**Outcome:** Buildings support reusable defaults and multiple editable stories.

**Implemented**

- Default outer/inner thickness, floor height, slab thickness, active-floor panel, floor addition, and recalculated elevations.
- Separate Outer Wall and Inner Wall drawing tools, explicit element conversion, per-type thickness/alignment defaults, per-floor wall lists, and generated wall solids.
- Selected inner walls expose centred move and rotate handles that update their endpoints while preserving length.

**Todo / hardening**

- Snap walls to existing endpoints, corners, and edges with visible snap markers.
- Implement floor reorder and dependency-aware floor deletion dialog.
- Outer walls align their outer face to the footprint boundary for either winding when drawn along it; add explicit visual tests for inside/centre/outside overrides.

### SK-010 — Openings, stairs, and automatic pitched roof

**Outcome:** The complete building shell includes usable vertical circulation and openings.

**Implemented**

- Door/window placement on the nearest wall with defaults, sill constraints, property editing, overlap validation, and actual wall void geometry made from non-overlapping wall pieces.
- Straight-stair riser derivation, rendered steps, and stair clearance cut from the slab above.
- A newly placed stair is selected immediately and exposes move and rotate handles plus exact position and rotation fields.
- One automatic, normal pitched-roof system with editable pitch, overhang, and thickness. Its primary ridge follows the longest footprint direction, while orthogonal protrusions receive smaller cross-roof modules merged into the primary surface.
- The roof is a closed solid whose underside begins at the final wall top, preventing the final-storey wall from showing through it.
- Door/window placement previews use a wide wall snap band, translucent opening box, validity colour, and left/right clearances to the nearest wall end or opening. Finalized openings keep those dimensions visible in Builder mode.

**Todo / hardening**

- Improve valley/eave topology for deeply nested concave plans and non-orthogonal protrusions; irregular footprints currently receive a stable single longest-direction roof fallback.
- Add watertight volume goldens if solid-model export becomes a product requirement.
- Add one-click dependency confirmation when deleting floors, stairs, or openings.

### SK-011 — Solid geometry worker (deferred)

**Decision**

- Current walls and openings render directly from small box pieces, including mitered corners. This is fast enough for the current property-scale workflow and avoids a second asynchronous geometry path.
- The previous generic worker protocol and Manifold/WASM replacement pass were removed because they duplicated already-visible geometry without enabling a user-facing operation.

**Activation criteria**

- Add a worker only after profiling shows UI stalls or a required Boolean solid operation cannot be expressed by the direct geometry path.
- Scope any future worker to that demonstrated operation rather than introducing a generic request framework up front.

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

### SK-014 — Public Norway map imagery

**Outcome:** Norwegian public map imagery becomes an offline-capable flat scene layer.

**Implemented**

- Norwegian place search and Leaflet previews for satellite and topographic imagery.
- Visible-frame or polygon selection up to 2×2 km, adaptive image capture, attribution, and an embedded flat map surface.
- Live smoke coverage for search, selection, capture, and cached scene placement.

**Todo / hardening**

- Add clearer request progress, cancellation, and offline provider messaging.
- Reopen a cached terrain project with networking disabled; current smoke validates acquisition and archive embedding, not the offline restart path.
- Add an online elevation source only when a concrete workflow needs it; local GeoTIFF covers the current elevation workflow.

### SK-015 — GeoTIFF terrain

**Outcome:** Detailed local elevation extends the flat public map imagery.

**Implemented**

- Local GeoTIFF picker, downsampled first-band decoding, no-data handling, EPSG extraction, EUREF89/UTM transforms for zones 32/33/35, georeferenced bounds, centre normalization, embedded source, and offline render.

**Todo**

- Expand GeoTIFF support beyond the first elevation band and supported EUREF89/UTM/geographic CRS set.
- Profile larger GeoTIFF imports before deciding whether decoding needs a worker.
- Evaluate authenticated orthophoto only when a supported provider and concrete import workflow are selected; do not add credential infrastructure in advance.
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
- Document controls, shortcuts, `.sketcher` recovery, attribution, and offline behaviour.
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

**Done for v0.1.4**

- Increased the Builder grid opacity and added a high-contrast translucent foundation fill, dark draft edge, and orange current snap glyph.
- Grid remains the fallback after explicit vertex, edge, and construction-axis targets; blank-canvas points snap to the configured grid.
- Unit coverage verifies grid rounding; visual/screen-scaling assertions remain open.

### SK-024 — Envelope alignment and roof closure

**Outcome:** The exterior face of an outer wall lies on the foundation boundary, and the roof fully encloses the final storey without daylight gaps.

**In progress**

- Corrected outer-wall alignment for both clockwise and counter-clockwise footprints so an inside-aligned wall solid grows toward the interior.
- Roof elevation starts at the final wall top. The closed roof volume includes fascia/gable infill and no longer leaves daylight between the final storey and roof. Top faces are clipped along exact ridge, valley, and module-intersection lines so every triangle belongs to one planar roof section rather than approximating transitions with a dense mesh.
- The generator derives its main axis from the longest footprint edge, decomposes orthogonal concave plans into a primary roof and smaller merged cross-roofs, and uses a stable longest-direction fallback for irregular angled plans.
- A line-intersection offset preserves the specified overhang around the real footprint instead of expanding a global bounding box.
- Geometry unit tests cover both footprint windings, exact coplanarity for rectangular and L-shaped roofs, rotated L plans, irregular angled footprints, finite vertices, eave elevation, and enclosing bounds. The desktop smoke captures the roof in Architecture mode.
- Follow-on hardening is limited to nested/non-orthogonal roof intersections and worker-backed watertight volume goldens.

### SK-025 — Flat map-image layer MVP

**Outcome:** A selected Norwegian map area can be added as a cached, flat Z=0 image plane even when elevation/LiDAR services are unavailable.

**Done for v0.1.4**

- Rebuilt the workflow from the proven sibling SiteForge/Yard Planner pattern, adapted to Electron with a Leaflet raster selector so it does not compete with the Three.js viewport for WebGL. It provides native pan/zoom, map-native polygon clicks, explicit finish/undo/clear actions, and a one-click Use visible map area option.
- Search flies to live Geonorge place results. Satellite and topographic modes now use matching Esri preview and extraction sources instead of a fragile capabilities-derived preview paired with a different capture source.
- Capture requests retain the selected bounds' aspect ratio instead of stretching every selection into a square image. Invalid provider responses are rejected before they enter the project archive.
- Render the selected vertices and closed polygon directly on the map, report dimensions and area, and reject selections wider or taller than 2 km.
- Cache the image through the narrow Electron IPC allow-list, add it as a clipped Z=0 scene surface with source bounds and attribution, select it, and frame it automatically after import.
- Unit coverage verifies bounds selection, metre/area calculation, aspect-correct extraction, persisted polygon data, UV mapping, and clipped render geometry. The live Electron smoke searches, validates visible-bounds capture, draws and finishes a polygon, imports it, and confirms the scene layer.
- Satellite extraction uses high-quality JPEG rather than multi-megabyte PNG. Transient HTTP 5xx, 408, and 429 responses retry the same selected extent at 4096, 3072, then 2048 maximum pixels; topographic extraction remains lossless PNG.
- Remaining: offline-restart E2E, editable polygon drag handles, blend preview, and a dedicated attribution panel. Elevation, GeoTIFF, and LiDAR-derived terrain remain follow-on work rather than prerequisites.

### SK-026 — Expanded site-object library

**Outcome:** Site composition includes practical, redistributable procedural garden and utility objects.

**Done for v0.1.4**

- Added scalable hedge and fence segments, a garbage shed, flag pole, and birch tree alongside the existing car, trees, person, and box.
- Definitions remain project-level built-ins and reuse the existing instanced-placement flow.
- Remaining: place/persist each new type in E2E and add material/LOD variants.

### SK-027 — Carport and garage openings

**Outcome:** A garage/carport opening uses the same clear placement preview and real wall void as doors and windows, at suitable vehicle dimensions.

**In progress**

- Added a Carport Builder tool with one intentionally simple 3,000×2,200 mm preset. Selecting the placed opening exposes editable clear width and clear height overrides.
- It reuses the wide wall snapping, translucent preview, clearance dimensions, invalid-placement handling, property editing, and Boolean wall-opening path.
- Component coverage verifies the single preset and custom 3,600×2,400 mm override; schema coverage persists the opening type. Add a dedicated save/reopen desktop journey during broader persistence hardening.

### SK-028 — Redistributable asset-pack policy

**Outcome:** Optional external trees, cars, and garden items can be sourced without accidentally redistributing incompatible models.

**Todo**

- Document a CC0-first asset policy, retain attribution/license metadata for any bundled non-CC0 item, and keep user-imported assets separate.
- Evaluate curated sources and only bundle models when their licence permits redistribution in the Windows package.

### SK-029 — Wall corner joinery

**Outcome:** Walls that meet at a shared endpoint form clean, intentional corners rather than overlapping or leaving gaps.

**Todo**

- Outer-wall pairs with one shared endpoint now derive matching inside/outside miter cuts from their actual directions and thicknesses, including non-orthogonal corners.
- Mitered and standard walls use the same direct box/profile geometry path.
- T-junctions, multiple walls at one endpoint, and inner-wall joins remain to be implemented.
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

**Implemented**

- The selected building's Architecture Inspector lists every story and roof as an independent visibility checkbox.
- Hidden levels are stored on the building instance, leaving the shared definition and other placements unchanged.
- Scene rebuilds, picking, outlines, focus, and visible-scene export operate on the resulting visible hierarchy.
- Geometry tests cover per-instance story and roof hiding; desktop smoke toggles the selected building's roof off and on.

**Todo / hardening**

- Add convenience actions for Show all, isolate one floor, and hide all floors above a chosen level if larger projects make individual toggles cumbersome.

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

### SK-034 - Viewport tools, scene clipboard, clipping, and wall angles

**Outcome:** Common 3D operations stay close to the canvas, scene objects can be duplicated quickly, buildings can be inspected with a conventional clipping plane, and wall segments are orthogonal unless the user explicitly applies an angle offset.

**Done for v0.1.4**

- Added a bottom-centred viewport toolbar for selection, transforms, polygon massing, building creation, object placement/import, terrain import, clipboard actions, Builder tools, roof creation, and clipping. The left panel now concentrates on the project-local building library instead of repeating direct modelling actions.
- Added Ctrl+C/Ctrl+V and visible Copy/Paste actions for building and asset instances. Pasted instances retain their shared definition and transform, receive a unique ID/name and cascading 500 mm XY offset, are selected immediately, and participate in Undo/Redo.
- Added a non-destructive global clipping plane with X/Y/Z handle axes, direction flip, enable/disable, and reset. Its compact popover reports the live millimetre offset; an in-scene transform handle moves the plane along the selected axis.
- Wall creation resets to the orthogonal X/Y construction axes whenever the Wall tool is selected. Only Ctrl+wheel changes the construction-axis offset in the configured 5 degree increments; normal scrolling remains camera navigation.
- Satellite/map captures now use the provider's supported 4096 pixel maximum dimension and target up to 8 pixels per metre. The selection summary reports the exact capture dimensions before download. Source imagery resolution still limits real ground detail, and licensed Norwegian orthophoto remains a separate provider ticket.
- Unit coverage verifies repeated undoable clipboard pastes, clipping-plane placement/direction, orthogonal and offset construction axes, and adaptive high-resolution captures. The desktop smoke exercises the toolbar, Ctrl+wheel angle adjustment, Ctrl+C/Ctrl+V, and clipping enable/reset.
- Remaining: persist optional clipping presets in project/session preferences and add keyboard discovery/help.

### SK-035 - Reliable high-resolution satellite capture

**Outcome:** Satellite map import does not fail merely because its image payload is much heavier than the equivalent topographic capture.

**Done for v0.1.4**

- Request satellite exports as JPEG at quality 92 while retaining matching source bounds, aspect ratio, attribution, and polygon clipping.
- Retry retryable provider failures at 75% and 50% of the requested pixel dimensions without changing the geographic selection.
- Validate every response as an image before caching it, retain topo as PNG32, and surface one actionable failure only after the retry sequence is exhausted.
- Unit coverage locks the retry dimensions and satellite/topographic formats; the live provider smoke exercises the actual satellite path.

### SK-036 - Footprint-aware automatic pitched roof

**Outcome:** The single supported roof type produces a conventional roughly 30° house roof automatically, including smaller roofs over normal extensions.

**Done for v0.1.4**

- The longest footprint edge determines the primary ridge direction; pitch defaults to 30° and remains editable with overhang and thickness.
- Orthogonal concave footprints are decomposed into occupied rectangular runs. The largest run becomes the main roof and protruding runs become smaller cross-roof modules.
- Overlapping modules merge through a shared height field, producing continuous valleys instead of intersecting loose roof meshes.
- Irregular angled footprints fall back to one safe longest-direction module instead of producing invalid vertices.
- Geometry regression tests cover L-shapes, rotated extensions, irregular footprints, roof elevation, bounds, and finite mesh data; desktop smoke provides a perspective artifact.

### SK-037 - Builder feedback and compact section controls

**Outcome:** Construction intent is immediately visible while drawing, and section inspection consumes minimal toolbar space.

**Done for v0.1.4**

- Foundation, wall, snap, opening, and dimension helper colours adapt to the configured background; light canvases use a darker blue/green palette with stronger contrast.
- Foundation and both wall tools show a cursor-adjacent `Right angle · 0°` or `Axis offset · N°` label. Wall labels also identify the active Outer or Inner element. Ctrl+wheel updates both the label and provisional snapped segment immediately, without waiting for pointer movement.
- Clipping uses a small in-scene axis handle and a compact popover containing only enable, axis, flip, reset, and the live offset readout.
- Carport openings expose one default preset plus direct width/height overrides, keeping the normal workflow simple without preventing custom openings.
- Unit/component coverage verifies clipping-handle conversion and carport overrides; the desktop smoke verifies immediate angle feedback and section-handle presence.

### SK-038 - Explicit outer and inner wall elements

**Outcome:** Wall intent is chosen before drawing and never depends on an imperfect foundation-edge classification heuristic.

**Done for v0.1.4**

- Replaced the generic Wall tool with distinct Outer Wall and Inner Wall actions in both Builder tool surfaces.
- Closing a foundation selects Outer Wall by default. Outer walls use the building's outer thickness and inside alignment; inner walls use the inner thickness and centre alignment.
- Removed endpoint-on-footprint classification and the obsolete automatic/manual source flag from the authoritative wall schema and Inspector.
- Existing projects keep their persisted wall type, thickness, and alignment. Legacy `typeSource` fields are accepted and stripped during normal schema parsing.
- The selected-wall Inspector provides an explicit Wall element selector for intentional conversion between Outer and Inner, updating defaults predictably.
- Store regression coverage proves an Inner Wall remains inner even when drawn exactly on the footprint and an Outer Wall remains outer away from it. Desktop smoke draws both elements and verifies their active canvas state.

## Release acceptance checklist

- [x] Packaged Windows application launches and reports the package version.
- [ ] Fresh-machine install/uninstall and full Home create/open/save/recover/Save As/delete journey pass.
- [x] Geometry tests confirm a 5000×8000 mm foundation reports 40.00 m² and 26,000 mm perimeter; direct-input creation is smoke tested.
- [ ] Outer/inner walls, a door, a window, second floor, straight stair opening, and automatic roof persist after restart.
- [ ] Two shared building instances update together; Make Unique detaches one.
- [ ] Procedural and imported objects select, focus, transform, persist, and export.
- [ ] A selected live map polygon imports as a cached Z=0 surface; offline restart verification remains open.
- [ ] GeoTIFF terrain imports with correct orientation, scale, and no-data handling.
- [x] Local CI, dependency audit, build, NSIS, portable packaging, and unpacked-runtime smoke pass.
- [x] Public `main` is clean, synchronized, and green.

## Latest verification evidence

The following evidence is refreshed before each publication. Any failed command reopens the affected ticket.

| Check | Current evidence |
|---|---|
| Formatting, lint, typecheck, unit tests, renderer/main build | `npm run ci` passes |
| Dependency security | `npm audit --audit-level=high` reports zero vulnerabilities |
| Desktop runtime | Home, editor, Builder direct input/wall angle, wall openings, viewport tools, object copy/paste, clipping, and sandbox boundary smoke pass |
| Terrain runtime | Live search, satellite preview, polygon selection, 4096-pixel adaptive capture, and cached Z=0 map-surface smoke pass |
| Windows distributions | NSIS setup, portable x64, and unpacked app build successfully; unpacked app smoke passes |
| Public delivery | Each green code push moves the rolling `latest` release and replaces its NSIS, portable x64, and SHA-256 assets; `v0.1.4` remains the historical tagged release |
