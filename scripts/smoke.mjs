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
    [0.42, 0.62],
    [0.6, 0.62],
    [0.6, 0.47],
    [0.42, 0.47],
  ];
  for (const [x, y] of points) {
    await canvas.click({ position: { x: bounds.width * x, y: bounds.height * y } });
  }
  await window.getByRole("button", { name: "Close foundation" }).click();
  await window.getByText("Building properties").waitFor({ state: "visible" });
  await window.getByRole("button", { name: /Wall/ }).click();
  await canvas.click({ position: { x: bounds.width * 0.46, y: bounds.height * 0.57 } });
  await canvas.click({ position: { x: bounds.width * 0.56, y: bounds.height * 0.57 } });
  await window
    .locator('.scene-host[data-geometry-worker="ready"]')
    .waitFor({ state: "visible", timeout: 15_000 });
  if (rendererMessages.some((message) => message.includes("Manifold wall generation failed"))) {
    throw new Error("Manifold worker fell back during the smoke journey.");
  }
  await window.getByRole("button", { name: /Door/ }).click();
  await window.mouse.move(bounds.x + bounds.width * 0.51, bounds.y + bounds.height * 0.57);
  await window
    .locator('.scene-host[data-opening-preview="valid"]')
    .waitFor({ state: "visible", timeout: 10_000 });
  await window.getByText(/^Door 900 mm$/).waitFor({ state: "visible" });
  await window.getByText(/^L \d+ mm$/).waitFor({ state: "visible" });
  await canvas.click({ position: { x: bounds.width * 0.51, y: bounds.height * 0.57 } });
  await window
    .locator('.scene-host[data-opening-preview="invalid"]')
    .waitFor({ state: "visible", timeout: 10_000 });
  await window.getByText(/^R \d+ mm$/).waitFor({ state: "visible" });
  await window.getByRole("button", { name: "+ Gable roof" }).click();
  await window.getByText("Gable properties").waitFor({ state: "visible" });
  await window.screenshot({ path: path.join(artifacts, "gable-roof.png") });

  if (process.env.SKETCHER_LIVE_TERRAIN === "1") {
    await window.getByRole("button", { name: "Architecture" }).click();
    await window.getByRole("button", { name: "Add terrain layer" }).click();
    await window.getByPlaceholder("Search Norwegian place...").fill("Oslo");
    await window.getByRole("button", { name: "Search" }).click();
    const firstPlace = window.locator(".search-results button").first();
    await firstPlace.waitFor({ state: "visible", timeout: 15_000 });
    await firstPlace.click();
    const map = window.locator('.map-frame[data-map-ready="true"]');
    const mapBounds = await map.boundingBox();
    if (!mapBounds) throw new Error("Map selector has no visible bounds.");
    for (const [x, y] of [
      [0.42, 0.58],
      [0.58, 0.58],
      [0.52, 0.42],
    ]) {
      await map.click({ position: { x: mapBounds.width * x, y: mapBounds.height * y } });
    }
    await window.getByText(/^3 points selected/).waitFor({ state: "visible" });
    await window.getByRole("button", { name: "Import selected map area" }).click();
    await window.locator(".terrain-dialog").waitFor({ state: "hidden", timeout: 60_000 });
    await window.getByText(/^(Map|Satellite) area /).waitFor({ state: "visible" });
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
