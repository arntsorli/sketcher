# Asset Library Policy

Sketcher includes procedural site assets so a project remains portable with no third-party downloads: hedge and fence segments, a garbage shed, flag pole, trees, a car, person, and a generic box. Hedge and fence segments are intentionally sized as repeatable modules; place, rotate, and duplicate them to form continuous runs.

## External model packs

Imported assets remain user-owned project content. Sketcher stores an imported GLB/glTF once in the project archive and creates lightweight instances from it. Do not bundle an external model into the installed application unless its licence explicitly permits redistribution.

Prefer CC0 assets for a future curated starter pack:

- [Poly Haven](https://polyhaven.com/license) publishes its models, textures, and HDRIs under CC0 and explicitly permits redistribution.
- [Quaternius](https://quaternius.com/faq.html) publishes CC0 packs, including glTF-compatible packs.
- [Kenney](https://kenney.nl/support) assets are CC0, though many are intentionally low-poly/stylised.

Before adding a model, record its source URL, creator, individual asset licence, original scale, triangle count, texture size, and any required attribution in the asset manifest. Avoid relying on a general marketplace filter alone: individual Sketchfab or marketplace downloads can use different licences.

For the first Windows release, prefer the built-in procedural objects and the existing GLB/glTF importer. Curated downloadable packs should be reviewed, converted to GLB, decimated where necessary, and added only after a licence and performance check.
