# Asset Library Policy

Sketcher includes a small, offline starter library so a project remains portable with no third-party downloads. Cars, people, and the three tree types use lightweight authored Kenney GLBs; procedural equivalents remain as instant placement previews and loading fallbacks. Hedge and fence segments, the garbage shed, flag pole, and generic primitives remain procedural. Repeatable hedge and fence modules can be placed, rotated, and duplicated to form continuous runs.

All bundled GLBs are CC0 and have file-level provenance in `src/renderer/src/assets/models/README.md`. Standard glTF assets are Y-up; the renderer normalizes them into Sketcher's Z-up scene and applies a documented real-world display size without modifying the source files.

## External model packs

Imported assets remain user-owned project content. Sketcher stores an imported GLB/glTF once in the project archive and creates lightweight instances from it. Do not bundle an external model into the installed application unless its licence explicitly permits redistribution.

Prefer CC0 assets when extending the curated starter pack:

- [Poly Haven](https://polyhaven.com/license) publishes its models, textures, and HDRIs under CC0 and explicitly permits redistribution.
- [Quaternius](https://quaternius.com/faq.html) publishes CC0 packs, including glTF-compatible packs.
- [Kenney](https://kenney.nl/support) assets are CC0, though many are intentionally low-poly/stylised.

Before adding a model, record its source URL, creator, individual asset licence, original scale, triangle count, texture size, and any required attribution in the asset manifest. Avoid relying on a general marketplace filter alone: individual Sketchfab or marketplace downloads can use different licences.

Keep bundled additions selective. A model should improve a frequently visible object, stay small enough for offline distribution, and be reviewed for licence, scale, triangle count, texture size, and visual fit. Large photogrammetry assets—such as multi-million-triangle trees—belong in optional project imports rather than the installed starter library.
