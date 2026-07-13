import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageMetadata = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const expectedVersion = packageMetadata.version;
const artifacts = path.join(root, "artifacts");
const smokeDirectory = path.join(root, ".smoke");
await mkdir(artifacts, { recursive: true });
await mkdir(smokeDirectory, { recursive: true });

const executablePath = process.env.SKETCHER_EXECUTABLE;
const electronApp = await electron.launch({
  ...(executablePath ? { executablePath } : {}),
  args: executablePath ? [] : [path.join(root, "out", "main", "index.js")],
  cwd: root,
  env: {
    ...process.env,
    SKETCHER_SMOKE_DIR: smokeDirectory,
    ELECTRON_ENABLE_LOGGING: "true",
    ELECTRON_ENABLE_SECURITY_WARNINGS: "true",
  },
});

try {
  const window = await electronApp.firstWindow();
  const rendererMessages = [];
  window.on("console", (message) => {
    rendererMessages.push(message.text());
    console.log(`[renderer:${message.type()}] ${message.text()}`);
  });
  window.on("pageerror", (error) => console.error(`[renderer:error] ${error.message}`));
  await window.waitForSelector(".home-page", { state: "visible" });
  await window.waitForTimeout(500);
  const version = await window.evaluate(() => window.sketcher.app.version());
  if (version !== expectedVersion) {
    throw new Error(`Unexpected app version: ${version}; expected ${expectedVersion}`);
  }
  await window.screenshot({ path: path.join(artifacts, "home.png") });

  await window.getByRole("button", { name: "New project" }).click();
  await window.getByLabel("Project name").fill("Smoke Test Project");
  await window.getByRole("button", { name: "Create project" }).click();
  await window.waitForSelector(".editor-shell", { state: "visible" });
  await window.waitForSelector(".scene-host canvas", { state: "visible" });
  await window.waitForTimeout(1200);
  await window.screenshot({ path: path.join(artifacts, "editor.png") });

  await window.getByRole("button", { name: "Settings" }).click();
  const backgroundInput = window.getByLabel("Canvas background colour");
  await backgroundInput.fill("#e7f1f8");
  await window.getByRole("button", { name: "Save settings" }).click();
  await window.locator(".settings-dialog").waitFor({ state: "hidden" });
  const savedBackground = await window.evaluate(async () => {
    const settings = await window.sketcher.settings.get();
    return settings.backgroundColor;
  });
  if (savedBackground !== "#e7f1f8") {
    throw new Error(`Canvas background setting was not persisted: ${savedBackground}`);
  }

  await window.getByRole("button", { name: "New building" }).click();
  await window.getByText("Draw the foundation").waitFor({ state: "visible" });
  await window.locator('.scene-host[data-view="top-locked"]').waitFor({ state: "visible" });
  await window.getByText("Locked top view").waitFor({ state: "visible" });
  const canvas = window.locator(".scene-host canvas");
  const modellingToolbar = window.getByRole("toolbar", { name: "3D modelling tools" });
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("3D canvas has no visible bounds.");
  await canvas.click({ position: { x: bounds.width * 0.46, y: bounds.height * 0.58 } });
  await window.mouse.move(bounds.x + bounds.width * 0.62, bounds.y + bounds.height * 0.58);
  const directInput = window.getByLabel("Direct length in millimetres");
  await directInput.waitFor({ state: "visible" });
  await directInput.fill("5000");
  await directInput.press("Enter");
  await window.getByText("2 points").waitFor({ state: "visible" });
  await window.screenshot({ path: path.join(artifacts, "builder.png") });

  await window.getByRole("button", { name: "Undo last point" }).click();
  await window.getByRole("button", { name: "Undo last point" }).click();
  await window.getByText("0 points").waitFor({ state: "visible" });
  const points = [
    [0.4, 0.65],
    [0.62, 0.65],
    [0.62, 0.55],
    [0.5, 0.55],
    [0.5, 0.42],
    [0.4, 0.42],
  ];
  for (const [x, y] of points) {
    await canvas.click({ position: { x: bounds.width * x, y: bounds.height * y } });
  }
  await window.getByRole("button", { name: "Close foundation" }).click();
  await window.getByText("Building properties").waitFor({ state: "visible" });
  await modellingToolbar.getByRole("button", { name: "Outer wall", exact: true }).click();
  await window.locator('.scene-host[data-wall-element="outer"]').waitFor({ state: "visible" });
  await window.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.55);
  await window.keyboard.down("Control");
  await window.mouse.wheel(0, 100);
  await window.keyboard.up("Control");
  await window.locator('.scene-host[data-axis-angle="5"]').waitFor({ state: "visible" });
  await window.getByText("Outer wall · Axis offset · 5°").waitFor({ state: "visible" });
  await window.screenshot({ path: path.join(artifacts, "wall-angle-offset.png") });
  await window.keyboard.down("Control");
  await window.mouse.wheel(0, -100);
  await window.keyboard.up("Control");
  await window.locator('.scene-host[data-axis-angle="0"]').waitFor({ state: "visible" });
  await canvas.click({ position: { x: bounds.width * 0.44, y: bounds.height * 0.64 } });
  await canvas.click({ position: { x: bounds.width * 0.58, y: bounds.height * 0.64 } });
  await window
    .locator('.scene-host[data-geometry-worker="ready"]')
    .waitFor({ state: "visible", timeout: 15_000 });
  if (rendererMessages.some((message) => message.includes("Manifold wall generation failed"))) {
    throw new Error("Manifold worker fell back during the smoke journey.");
  }
  await modellingToolbar.getByRole("button", { name: "Inner wall", exact: true }).click();
  await window.locator('.scene-host[data-wall-element="inner"]').waitFor({ state: "visible" });
  await canvas.click({ position: { x: bounds.width * 0.49, y: bounds.height * 0.6 } });
  await canvas.click({ position: { x: bounds.width * 0.49, y: bounds.height * 0.56 } });
  await window.getByText("Walls · 2").waitFor({ state: "visible" });
  await window.getByRole("button", { name: /Door/ }).click();
  await window.mouse.move(bounds.x + bounds.width * 0.51, bounds.y + bounds.height * 0.64);
  await window
    .locator('.scene-host[data-opening-preview="valid"]')
    .waitFor({ state: "visible", timeout: 10_000 });
  await window.getByText(/^Door 900 mm$/).waitFor({ state: "visible" });
  await window.getByText(/^L \d+ mm$/).waitFor({ state: "visible" });
  await canvas.click({ position: { x: bounds.width * 0.51, y: bounds.height * 0.64 } });
  await window
    .locator('.scene-host[data-opening-preview="invalid"]')
    .waitFor({ state: "visible", timeout: 10_000 });
  await window.getByText(/^R \d+ mm$/).waitFor({ state: "visible" });
  await window.getByRole("button", { name: "Add roof", exact: true }).click();
  await window.getByText("Automatic roof", { exact: true }).last().waitFor({ state: "visible" });
  await window.screenshot({ path: path.join(artifacts, "gable-roof.png") });

  await window.getByRole("button", { name: "Architecture" }).click();
  await window.getByRole("button", { name: "Building 1" }).first().click();
  await canvas.click({ position: { x: bounds.width * 0.34, y: bounds.height * 0.55 } });
  await window.getByText("1 buildings · 0 objects").waitFor({ state: "visible" });
  await window.keyboard.press("f");
  await window.waitForTimeout(250);
  await canvas.click({ position: { x: bounds.width * 0.82, y: bounds.height * 0.25 } });
  await window.screenshot({ path: path.join(artifacts, "automatic-roof-perspective.png") });
  await window.getByRole("button", { name: "Polygon face" }).click();
  for (const [x, y] of [
    [0.44, 0.64],
    [0.56, 0.64],
    [0.5, 0.52],
  ]) {
    await canvas.click({ position: { x: bounds.width * x, y: bounds.height * y } });
  }
  await window.getByRole("button", { name: "Create face" }).click();
  await window.getByText("Polygon face 1", { exact: true }).last().waitFor({ state: "visible" });
  const extrusion = window.getByLabel("Extrusion height (mm)");
  await extrusion.fill("2500");
  await extrusion.press("Tab");
  await window.getByRole("button", { name: "Add object" }).click();
  await window.getByRole("button", { name: "Cube", exact: true }).click();
  await canvas.click({ position: { x: bounds.width * 0.62, y: bounds.height * 0.55 } });
  await window.getByText("Cube", { exact: true }).last().waitFor({ state: "visible" });
  await window.keyboard.press("Control+c");
  await window.keyboard.press("Control+v");
  await window.getByText("Cube copy", { exact: true }).last().waitFor({ state: "visible" });
  await window.getByRole("button", { name: "Clipping plane" }).click();
  await window.getByLabel("Enabled").check();
  await window.locator('.scene-host[data-clipping-enabled="true"]').waitFor({ state: "visible" });
  await window.getByRole("button", { name: "Y", exact: true }).click();
  await window
    .locator('.scene-host[data-clipping-enabled="true"][data-clipping-axis="y"]')
    .waitFor({ state: "visible" });
  await window.getByText(/drag the in-scene handle/).waitFor({ state: "visible" });
  await window.screenshot({ path: path.join(artifacts, "clipping-plane.png") });
  await window.getByRole("button", { name: "Reset" }).click();
  await window.locator('.scene-host[data-clipping-enabled="false"]').waitFor({ state: "visible" });
  await window.getByRole("button", { name: "Close clipping controls" }).click();
  await window.screenshot({ path: path.join(artifacts, "primitives-and-extrusion.png") });

  if (process.env.SKETCHER_LIVE_TERRAIN === "1") {
    await window.getByRole("button", { name: "Add terrain layer" }).click();
    await window.getByPlaceholder("Search place or address...").fill("Oslo");
    await window.getByRole("button", { name: "Search" }).click();
    const firstPlace = window.locator(".search-results button").first();
    await firstPlace.waitFor({ state: "visible", timeout: 15_000 });
    await firstPlace.click();
    const map = window.locator(".map-frame");
    await map.waitFor({ state: "visible", timeout: 20_000 });
    await window.waitForTimeout(1500);
    await window.screenshot({ path: path.join(artifacts, "map-dialog.png") });
    await window
      .locator('.map-frame[data-map-ready="true"]')
      .waitFor({ state: "visible", timeout: 20_000 });
    await window.waitForTimeout(900);
    await window.getByRole("button", { name: "Use visible map area" }).click();
    await window.getByText("Area ready to import").waitFor({ state: "visible" });
    await window.getByRole("button", { name: "Clear", exact: true }).click();
    await window.getByRole("button", { name: "Draw polygon" }).click();
    const mapBounds = await map.boundingBox();
    if (!mapBounds) throw new Error("Map selector has no visible bounds.");
    for (const [x, y] of [
      [0.42, 0.58],
      [0.58, 0.58],
      [0.52, 0.42],
    ]) {
      await map.click({ position: { x: mapBounds.width * x, y: mapBounds.height * y } });
    }
    await window.getByText(/^3 points/).waitFor({ state: "visible" });
    await window.getByRole("button", { name: "Finish polygon" }).click();
    await window.getByText("Area ready to import").waitFor({ state: "visible" });
    await window.getByRole("button", { name: "Import selected map area" }).click();
    await Promise.race([
      window.locator(".terrain-dialog").waitFor({ state: "hidden", timeout: 60_000 }),
      window
        .locator(".terrain-dialog .inline-error")
        .waitFor({ state: "visible", timeout: 60_000 }),
    ]);
    const importError = window.locator(".terrain-dialog .inline-error");
    if (await importError.isVisible()) {
      throw new Error(`Map import failed: ${await importError.textContent()}`);
    }
    await window
      .getByText(/^Satellite \d/)
      .first()
      .waitFor({ state: "visible" });
    await window.waitForTimeout(2_000);
    await canvas.click({ position: { x: bounds.width * 0.86, y: bounds.height * 0.82 } });
    await window.screenshot({ path: path.join(artifacts, "terrain.png") });
  }

  const rendererHasNode = await window.evaluate(
    () => typeof globalThis.process !== "undefined" || typeof globalThis.require !== "undefined",
  );
  if (rendererHasNode) throw new Error("Node globals leaked into the renderer.");
  console.log(
    `Smoke passed: version ${version}, secure renderer, home/editor/builder rendered, direct input and Manifold wall committed.`,
  );
} finally {
  await electronApp.close();
}
