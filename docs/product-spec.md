# Sketcher Product Specification

## Product goal

Sketcher lets a Windows user create dimensionally dependable concept buildings in millimetres, reuse them as grouped instances, arrange a property with normal site objects, and align the scene to Norwegian map and elevation data without requiring an account for normal local work.

## Primary journeys

### Project entry

The home screen creates or opens local `.sketcher` files and presents recent files as named preview cards. Deletion always requires confirmation and moves the source file to the Windows Recycle Bin. Manual Save/Save As writes atomically; a newer recovery snapshot is offered after a crash without replacing the last manual save.

### Builder

Builder isolates one shared building definition. A new definition begins on the XY grid at Z=0. The Foundation tool snaps to grid, axes, geometry, and closure; direct numeric input is in millimetres. Shift+wheel rotates construction axes by 5°. Closing a valid polygon creates the first floor.

Each building carries reusable defaults for exterior/interior wall thickness, floor height, and slab thickness. Floor-specific properties can override these defaults. Wall classification is automatic when a wall follows the outer footprint and can be overridden manually. Doors and windows create actual wall voids. A straight stair derives its riser count from floor height. A gable roof is the final floor and prevents adding stories above it.

Dimension lines and HTML labels are visible only in Builder and remain readable in screen space.

### Architecture

Architecture is the default mode. It shows the complete scene and treats a placed building as one selectable group. Building instances share a definition until Make Unique is used. Buildings translate and rotate without scaling. Site objects translate, rotate, and uniformly scale. Scene entries support selection and camera focus; selected objects use visible and hidden-edge outlines.

The bundled object library is procedurally generated and redistributable. Imported GLB/glTF assets are content-addressed and embedded once per project. A selected building or the visible scene can be exported as GLB.

### Terrain

The terrain overlay searches Norwegian places, previews the current Kartverket topographic WMTS, and selects up to a 2×2 km square. Online elevation sampling uses Kartverket Høydedata. The elevation at the area centre becomes local Z=0 while its absolute elevation remains metadata. The map snapshot and elevation grid are cached in the project for offline reopening.

Local GeoTIFF import supports higher-resolution LiDAR-derived DTM data. High-resolution Norge i bilder orthophoto remains credential-dependent; credentials are encrypted by Windows and never stored in projects.

## Boundaries

Sketcher targets properties and small sites. It does not claim structural, code, permit, BIM, or construction-document authority. Cloud accounts, collaboration, IFC/DXF, raw LAZ editing, photorealistic rendering, multiple stair systems, and complex roof intersections are outside the first complete release.
