import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
  if (version !== "0.1.0") throw new Error(`Unexpected app version: ${version}`);
  await window.screenshot({ path: path.join(artifacts, "home.png") });

  await window.getByRole("button", { name: "New project" }).click();
  await window.getByLabel("Project name").fill("Smoke Test Project");
  await window.getByRole("button", { name: "Create project" }).click();
  await window.waitForSelector(".editor-shell", { state: "visible" });
  await window.waitForSelector(".scene-host canvas", { state: "visible" });
  await window.waitForTimeout(1200);
  await window.screenshot({ path: path.join(artifacts, "editor.png") });

  await window.getByRole("button", { name: "New building" }).click();
  await window.getByText("Draw the foundation").waitFor({ state: "visible" });
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

  await window.keyboard.press("Escape");
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

  if (process.env.SKETCHER_LIVE_TERRAIN === "1") {
    await window.getByRole("button", { name: "Architecture" }).click();
    await window.getByRole("button", { name: "Add terrain layer" }).click();
    await window.getByPlaceholder("Search Norwegian place…").fill("Oslo");
    await window.getByRole("button", { name: "Search" }).click();
    const firstPlace = window.locator(".search-results button").first();
    await firstPlace.waitFor({ state: "visible", timeout: 15_000 });
    await firstPlace.click();
    await window.getByLabel("Terrain detail").selectOption("17");
    await window.getByRole("button", { name: "Add map + elevation" }).click();
    await window.locator(".terrain-dialog").waitFor({ state: "hidden", timeout: 60_000 });
    await window
      .getByText(/Kartverket/)
      .first()
      .waitFor({ state: "visible" });
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
