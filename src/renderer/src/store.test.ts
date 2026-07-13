import { beforeEach, describe, expect, it } from "vitest";
import { createBuilding, createProject } from "../../shared/model";
import { useEditorStore } from "./store";

describe("scene clipboard", () => {
  beforeEach(() => {
    const project = createProject("Clipboard test");
    project.scene.assetInstances.push({
      id: "asset-instance",
      definitionId: "builtin-box",
      name: "Cube",
      transform: {
        position: { x: 1000, y: 2000, z: 0 },
        rotationZ: 0.5,
        scale: 1.25,
      },
      visible: true,
    });
    useEditorStore.setState({
      project,
      selection: { type: "asset", id: "asset-instance" },
      clipboard: undefined,
      dirty: false,
      past: [],
      future: [],
    });
  });

  it("copies and pastes selected objects as undoable independent instances", () => {
    useEditorStore.getState().copySelection();
    useEditorStore.getState().pasteClipboard();

    const state = useEditorStore.getState();
    const pasted = state.project?.scene.assetInstances[1];
    expect(pasted).toMatchObject({
      definitionId: "builtin-box",
      name: "Cube copy",
      transform: {
        position: { x: 1500, y: 2500, z: 0 },
        rotationZ: 0.5,
        scale: 1.25,
      },
    });
    expect(pasted?.id).not.toBe("asset-instance");
    expect(state.selection).toEqual({ type: "asset", id: pasted?.id });
    expect(state.past).toHaveLength(1);

    state.undo();
    expect(useEditorStore.getState().project?.scene.assetInstances).toHaveLength(1);
  });

  it("cascades repeated pastes so duplicates do not overlap", () => {
    useEditorStore.getState().copySelection();
    useEditorStore.getState().pasteClipboard();
    useEditorStore.getState().pasteClipboard();

    const instances = useEditorStore.getState().project?.scene.assetInstances ?? [];
    expect(instances[2]).toMatchObject({
      name: "Cube copy 2",
      transform: { position: { x: 2000, y: 3000, z: 0 } },
    });
  });

  it("duplicates a building placement without cloning its shared definition", () => {
    const project = useEditorStore.getState().project;
    if (!project) throw new Error("Expected the clipboard test project.");
    const building = createBuilding("House", [
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 8000 },
      { x: 0, y: 8000 },
    ]);
    project.buildingDefinitions.push(building);
    project.scene.buildingInstances.push({
      id: "building-instance",
      definitionId: building.id,
      name: "House",
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotationZ: 0,
        scale: 1,
      },
      visible: true,
    });
    useEditorStore.setState({
      project,
      selection: { type: "building", id: "building-instance" },
      clipboard: undefined,
      past: [],
      future: [],
    });

    useEditorStore.getState().copySelection();
    useEditorStore.getState().pasteClipboard();

    const state = useEditorStore.getState();
    expect(state.project?.buildingDefinitions).toHaveLength(1);
    expect(state.project?.scene.buildingInstances[1]).toMatchObject({
      name: "House copy",
      definitionId: building.id,
      transform: { position: { x: 500, y: 500, z: 0 } },
    });
  });

  it("creates the explicitly selected wall element without footprint classification", () => {
    const project = createProject("Explicit walls");
    const building = createBuilding("House", [
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 4000 },
      { x: 0, y: 4000 },
    ]);
    const floor = building.floors[0];
    if (!floor) throw new Error("Expected a ground floor.");
    project.buildingDefinitions.push(building);
    useEditorStore.setState({
      project,
      activeBuildingId: building.id,
      activeFloorId: floor.id,
      tool: "internal-wall",
      draft: { points: [], axisAngle: 0, numericInput: "" },
      dirty: false,
      past: [],
      future: [],
    });

    useEditorStore.getState().addWallSegment({ x: 0, y: 0 }, { x: 5000, y: 0 });
    useEditorStore.getState().setTool("external-wall");
    useEditorStore.getState().addWallSegment({ x: 1000, y: 1000 }, { x: 4000, y: 1000 });

    expect(useEditorStore.getState().project?.buildingDefinitions[0]?.walls).toMatchObject([
      { type: "internal", thickness: 100, alignment: "center" },
      { type: "external", thickness: 250, alignment: "inside" },
    ]);
  });
});
