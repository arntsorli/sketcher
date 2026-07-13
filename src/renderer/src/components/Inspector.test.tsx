import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBuilding, createProject } from "../../../shared/model";
import { useEditorStore } from "../store";
import { Inspector } from "./Inspector";

describe("carport opening properties", () => {
  beforeEach(() => {
    const project = createProject("Carport test");
    const building = createBuilding("Garage", [
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 5000 },
      { x: 0, y: 5000 },
    ]);
    const floor = building.floors[0];
    if (!floor) throw new Error("Expected a ground floor.");
    building.walls.push({
      id: "garage-wall",
      floorId: floor.id,
      start: { x: 0, y: 0 },
      end: { x: 6000, y: 0 },
      type: "external",
      typeSource: "auto",
      thickness: 250,
      alignment: "inside",
    });
    building.openings.push({
      id: "carport-opening",
      floorId: floor.id,
      wallId: "garage-wall",
      kind: "carport",
      width: 3000,
      height: 2200,
      offset: 1500,
      sillHeight: 0,
    });
    project.buildingDefinitions.push(building);
    useEditorStore.setState({
      project,
      mode: "builder",
      activeBuildingId: building.id,
      activeFloorId: floor.id,
      selection: { type: "opening", id: "carport-opening" },
      past: [],
      future: [],
    });
  });

  afterEach(cleanup);

  it("offers one default preset and editable clear dimensions", () => {
    render(<Inspector />);
    const preset = screen.getByLabelText("Preset");
    expect(within(preset).getAllByRole("option")).toHaveLength(1);

    fireEvent.blur(screen.getByLabelText("Clear width (mm)"), {
      target: { value: "3600" },
    });
    fireEvent.blur(screen.getByLabelText("Clear height (mm)"), {
      target: { value: "2400" },
    });

    const opening = useEditorStore
      .getState()
      .project?.buildingDefinitions[0]?.openings.find((item) => item.id === "carport-opening");
    expect(opening).toMatchObject({ width: 3600, height: 2400 });
  });
});
