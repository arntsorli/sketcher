# Sketcher Product Specification

## Product goal

Sketcher lets a Windows user create dimensionally dependable concept buildings in millimetres, reuse them as grouped instances, arrange a property with normal site objects, and align the scene to Norwegian map and elevation data without requiring an account for normal local work.

## Primary journeys

### Project entry

The home screen creates or opens local `.sketcher` files and presents recent files as named preview cards. Deletion always requires confirmation and moves the source file to the Windows Recycle Bin. Manual Save/Save As writes atomically; a newer recovery snapshot is offered after a crash without replacing the last manual save.

### Builder

Builder isolates one shared building definition in a locked top view. A new definition begins on the XY grid at Z=0. The Foundation tool snaps to grid, axes, geometry, and closure; direct numeric input is in millimetres. Walls lock to the nearest right-angle construction axis, and only Ctrl+wheel rotates that axis offset in 5° increments. Closing a valid polygon creates the first floor.

Each building carries reusable defaults for outer/inner wall thickness, floor height, and slab thickness. Floor-specific properties can override these defaults. Outer Wall and Inner Wall are separate drawing tools: the chosen element directly controls type, default thickness, and alignment, with no footprint-based classification. A selected wall can be explicitly converted to the other element. Doors, windows, and the single carport preset create actual wall voids and expose custom dimensions. A straight stair derives its riser count from floor height. One automatic pitched roof is the final floor and prevents adding stories above it: its primary ridge follows the longest footprint direction and normal orthogonal extensions receive smaller merged cross-roofs.

Dimension lines and HTML labels are visible only in Builder and remain readable in screen space.

### Architecture

Architecture is the default mode. It shows the complete scene and treats a placed building as one selectable group. Building instances share a definition until Make Unique is used. Buildings translate and rotate without scaling. Site objects translate, rotate, and uniformly scale. Scene entries support selection and camera focus; selected objects use visible and hidden-edge outlines. A bottom-centred viewport toolbar keeps transforms, object/terrain placement, massing, copy/paste, and clipping controls on the canvas while the side panels retain libraries and properties. Ctrl+C/Ctrl+V duplicates selected building and asset instances through the undoable command history.

A non-destructive clipping plane supports X/Y/Z normals, direction flip, a compact status popover, and an in-scene axis handle for its millimetre position without changing authoritative geometry.

The bundled object library combines lightweight CC0 models for the most visible trees, cars, and people with procedural utility objects and fallback previews. Imported GLB/glTF assets are content-addressed, embedded once per project, and normalized from glTF's Y-up convention into the application's Z-up scene. A selected building or the visible scene can be exported as GLB.

### Terrain

The terrain overlay searches Norwegian places, previews matching Esri satellite or topographic imagery, and selects up to a 2×2 km visible rectangle or polygon. The extraction preserves aspect ratio, supports up to a 4096-pixel maximum dimension and targets up to 8 pixels per metre, then clips the cached image to the chosen polygon on a flat Z=0 surface. Satellite capture uses high-quality JPEG with smaller-pixel retry attempts for transient provider errors; topo remains lossless PNG. The selected source, WGS84 bounds, attribution, image, and local dimensions are embedded for offline reopening.

Local GeoTIFF import supports higher-resolution LiDAR-derived DTM data. Credential-backed orthophoto providers are not part of the current app.

## Boundaries

Sketcher targets properties and small sites. It does not claim structural, code, permit, BIM, or construction-document authority. Cloud accounts, collaboration, IFC/DXF, raw LAZ editing, photorealistic rendering, multiple stair systems, dormers, hips, valleys outside the automatic extension workflow, and freely authored roof systems are outside the first complete release.
