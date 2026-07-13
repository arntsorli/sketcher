import { z } from "zod";

export const vec2Schema = z.object({ x: z.number().finite(), y: z.number().finite() });
export const vec3Schema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});

export const buildingDefaultsSchema = z.object({
  externalWallThickness: z.number().positive().default(250),
  internalWallThickness: z.number().positive().default(100),
  floorHeight: z.number().positive().default(2700),
  slabThickness: z.number().nonnegative().default(200),
});

export const floorSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["story", "roof"]),
  elevation: z.number().nonnegative(),
  height: z.number().positive(),
  slabThickness: z.number().nonnegative(),
});

export const wallSchema = z.object({
  id: z.string(),
  floorId: z.string(),
  start: vec2Schema,
  end: vec2Schema,
  type: z.enum(["external", "internal"]),
  thickness: z.number().positive(),
  alignment: z.enum(["inside", "center", "outside"]),
});

export const openingSchema = z.object({
  id: z.string(),
  floorId: z.string(),
  wallId: z.string(),
  kind: z.enum(["door", "window", "carport"]),
  width: z.number().positive(),
  height: z.number().positive(),
  offset: z.number().nonnegative(),
  sillHeight: z.number().nonnegative(),
});

export const stairSchema = z.object({
  id: z.string(),
  floorId: z.string(),
  position: vec2Schema,
  rotationZ: z.number(),
  width: z.number().positive(),
  treadDepth: z.number().positive(),
  riserCount: z.number().int().positive(),
});

export const roofSchema = z.object({
  floorId: z.string(),
  pitchDegrees: z.number().min(1).max(80),
  overhang: z.number().nonnegative(),
  thickness: z.number().positive(),
  ridgeRotationDegrees: z.number(),
  flipped: z.boolean(),
});

export const buildingDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  footprint: z.array(vec2Schema).min(3),
  defaults: buildingDefaultsSchema,
  floors: z.array(floorSchema).min(1),
  walls: z.array(wallSchema),
  openings: z.array(openingSchema),
  stairs: z.array(stairSchema),
  roof: roofSchema.optional(),
});

export const transformSchema = z.object({
  position: vec3Schema,
  rotationZ: z.number(),
  scale: z.number().positive(),
});

export const buildingInstanceSchema = z.object({
  id: z.string(),
  definitionId: z.string(),
  name: z.string(),
  transform: transformSchema,
  visible: z.boolean(),
});

export const assetDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  source: z.enum(["builtin", "imported", "generated"]),
  kind: z.enum([
    "car",
    "deciduous-tree",
    "conifer",
    "birch-tree",
    "hedge-segment",
    "fence-segment",
    "garbage-shed",
    "flag-pole",
    "person",
    "box",
    "plane",
    "sphere",
    "cylinder",
    "cone",
    "polygon-face",
    "glb",
  ]),
  archivePath: z.string().optional(),
  contentHash: z.string().optional(),
  polygon: z
    .object({
      points: z.array(vec2Schema).min(3),
      extrusionHeight: z.number().nonnegative(),
    })
    .optional(),
});

export const assetInstanceSchema = z.object({
  id: z.string(),
  definitionId: z.string(),
  name: z.string(),
  transform: transformSchema,
  visible: z.boolean(),
});

export const terrainLayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.enum(["kartverket", "norge-i-bilder", "local-geotiff", "custom"]),
  attribution: z.string(),
  boundsWgs84: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  clipPolygonWgs84: z
    .array(z.tuple([z.number(), z.number()]))
    .min(3)
    .optional(),
  sourceEpsg: z.string(),
  anchorWgs84: z.tuple([z.number(), z.number()]),
  absoluteAnchorElevation: z.number(),
  verticalOffset: z.number(),
  widthMm: z.number().positive(),
  heightMm: z.number().positive(),
  elevationArchivePath: z.string().optional(),
  imageryArchivePath: z.string().optional(),
  gridSize: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  elevationsMm: z.array(z.number()).optional(),
  visible: z.boolean(),
});

export const projectSettingsSchema = z.object({
  areaFormat: z.enum(["m2", "mm2"]),
  gridSpacing: z.number().positive(),
  majorGridSpacing: z.number().positive(),
  snapTolerance: z.number().positive(),
  angleIncrement: z.number().positive(),
});

export const projectDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string(),
    name: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    units: z.literal("mm"),
    settings: projectSettingsSchema,
    georeference: z
      .object({
        anchorWgs84: z.tuple([z.number(), z.number()]),
        epsg: z.string(),
      })
      .optional(),
    buildingDefinitions: z.array(buildingDefinitionSchema),
    assetDefinitions: z.array(assetDefinitionSchema),
    scene: z.object({
      buildingInstances: z.array(buildingInstanceSchema),
      assetInstances: z.array(assetInstanceSchema),
      terrainLayers: z.array(terrainLayerSchema),
    }),
  })
  .superRefine((project, context) => {
    const buildingIds = new Set(project.buildingDefinitions.map((item) => item.id));
    const assetIds = new Set(project.assetDefinitions.map((item) => item.id));
    for (const instance of project.scene.buildingInstances) {
      if (!buildingIds.has(instance.definitionId)) {
        context.addIssue({
          code: "custom",
          path: ["scene", "buildingInstances"],
          message: `Building instance ${instance.id} references a missing definition.`,
        });
      }
    }
    for (const instance of project.scene.assetInstances) {
      if (!assetIds.has(instance.definitionId)) {
        context.addIssue({
          code: "custom",
          path: ["scene", "assetInstances"],
          message: `Asset instance ${instance.id} references a missing definition.`,
        });
      }
    }
    for (const building of project.buildingDefinitions) {
      const floorIds = new Set(building.floors.map((item) => item.id));
      const wallIds = new Set(building.walls.map((item) => item.id));
      for (const wall of building.walls) {
        if (!floorIds.has(wall.floorId)) {
          context.addIssue({
            code: "custom",
            message: `Wall ${wall.id} references a missing floor.`,
          });
        }
      }
      for (const opening of building.openings) {
        if (!floorIds.has(opening.floorId) || !wallIds.has(opening.wallId)) {
          context.addIssue({
            code: "custom",
            message: `Opening ${opening.id} references a missing floor or wall.`,
          });
        }
      }
    }
  });

export const globalSettingsSchema = z.object({
  projectLibraryPath: z.string(),
  autosaveSeconds: z.number().int().min(10).max(600),
  theme: z.enum(["dark", "light", "system"]),
  areaFormat: z.enum(["m2", "mm2"]),
  gridSpacing: z.number().positive(),
  majorGridSpacing: z.number().positive(),
  snapTolerance: z.number().positive(),
  graphicsQuality: z.enum(["low", "medium", "high"]),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit hex colour."),
  invertZoom: z.boolean(),
  terrainCacheMb: z.number().int().positive(),
});

export type Vec2 = z.infer<typeof vec2Schema>;
export type Vec3 = z.infer<typeof vec3Schema>;
export type BuildingDefaults = z.infer<typeof buildingDefaultsSchema>;
export type Floor = z.infer<typeof floorSchema>;
export type Wall = z.infer<typeof wallSchema>;
export type Opening = z.infer<typeof openingSchema>;
export type Stair = z.infer<typeof stairSchema>;
export type Roof = z.infer<typeof roofSchema>;
export type BuildingDefinition = z.infer<typeof buildingDefinitionSchema>;
export type BuildingInstance = z.infer<typeof buildingInstanceSchema>;
export type AssetDefinition = z.infer<typeof assetDefinitionSchema>;
export type AssetInstance = z.infer<typeof assetInstanceSchema>;
export type TerrainLayer = z.infer<typeof terrainLayerSchema>;
export type ProjectDocument = z.infer<typeof projectDocumentSchema>;
export type GlobalSettings = z.infer<typeof globalSettingsSchema>;

export const CURRENT_SCHEMA_VERSION = 1;

export function parseProjectDocument(value: unknown): ProjectDocument {
  if (!value || typeof value !== "object") throw new Error("Project model must be an object.");
  const input = structuredClone(value) as Record<string, unknown>;
  const version = typeof input.schemaVersion === "number" ? input.schemaVersion : 0;
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `This project uses schema version ${version}. This Sketcher version supports up to ${CURRENT_SCHEMA_VERSION}.`,
    );
  }
  if (version === 0) {
    input.schemaVersion = 1;
    input.units ??= "mm";
    input.settings ??= {
      areaFormat: "m2",
      gridSpacing: 100,
      majorGridSpacing: 1000,
      snapTolerance: 12,
      angleIncrement: 5,
    };
    input.buildingDefinitions ??= [];
    input.assetDefinitions ??= builtinAssets.map((asset) => ({ ...asset }));
    input.scene ??= { buildingInstances: [], assetInstances: [], terrainLayers: [] };
  }
  return projectDocumentSchema.parse(input);
}

export const builtinAssets: AssetDefinition[] = [
  { id: "builtin-car", name: "Car", source: "builtin", kind: "car" },
  {
    id: "builtin-deciduous-tree",
    name: "Deciduous tree",
    source: "builtin",
    kind: "deciduous-tree",
  },
  { id: "builtin-conifer", name: "Conifer", source: "builtin", kind: "conifer" },
  { id: "builtin-birch-tree", name: "Birch tree", source: "builtin", kind: "birch-tree" },
  { id: "builtin-hedge", name: "Hedge segment", source: "builtin", kind: "hedge-segment" },
  { id: "builtin-fence", name: "Fence segment", source: "builtin", kind: "fence-segment" },
  { id: "builtin-garbage-shed", name: "Garbage shed", source: "builtin", kind: "garbage-shed" },
  { id: "builtin-flag-pole", name: "Flag pole", source: "builtin", kind: "flag-pole" },
  { id: "builtin-person", name: "Person", source: "builtin", kind: "person" },
  { id: "builtin-box", name: "Cube", source: "builtin", kind: "box" },
  { id: "builtin-plane", name: "Plane", source: "builtin", kind: "plane" },
  { id: "builtin-sphere", name: "Sphere", source: "builtin", kind: "sphere" },
  { id: "builtin-cylinder", name: "Cylinder", source: "builtin", kind: "cylinder" },
  { id: "builtin-cone", name: "Cone", source: "builtin", kind: "cone" },
];

export function createProject(name = "Untitled"): ProjectDocument {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    units: "mm",
    settings: {
      areaFormat: "m2",
      gridSpacing: 100,
      majorGridSpacing: 1000,
      snapTolerance: 12,
      angleIncrement: 5,
    },
    buildingDefinitions: [],
    assetDefinitions: builtinAssets.map((asset) => ({ ...asset })),
    scene: {
      buildingInstances: [],
      assetInstances: [],
      terrainLayers: [],
    },
  };
}

export function createBuilding(name: string, footprint: Vec2[]): BuildingDefinition {
  const floorId = crypto.randomUUID();
  return {
    id: crypto.randomUUID(),
    name,
    footprint,
    defaults: {
      externalWallThickness: 250,
      internalWallThickness: 100,
      floorHeight: 2700,
      slabThickness: 200,
    },
    floors: [
      {
        id: floorId,
        name: "Ground floor",
        type: "story",
        elevation: 0,
        height: 2700,
        slabThickness: 200,
      },
    ],
    walls: [],
    openings: [],
    stairs: [],
  };
}
