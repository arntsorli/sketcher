import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageMetadata = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const workspace = path.join(root, ".e2e");
const artifacts = path.join(root, "artifacts");
await mkdir(workspace, { recursive: true });
await mkdir(artifacts, { recursive: true });

const executablePath = process.env.SKETCHER_EXECUTABLE;
const app = await electron.launch({
  ...(executablePath ? { executablePath } : {}),
  args: executablePath ? [] : [path.join(root, "out", "main", "index.js")],
  cwd: root,
  env: { ...process.env, SKETCHER_SMOKE_DIR: workspace },
});

try {
  const page = await app.firstWindow();
  await page.locator(".home-page").waitFor({ state: "visible" });
  const version = await page.evaluate(() => window.sketcher.app.version());
  if (version !== packageMetadata.version) throw new Error(`Unexpected app version: ${version}`);

  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Project name").fill("Foundation E2E");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.locator(".editor-shell").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "New building" }).click();
  await page.locator('.scene-host[data-view="top-locked"]').waitFor({ state: "visible" });

  const canvas = page.locator(".scene-host canvas");
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("3D canvas has no visible bounds.");
  const moveAndCommit = async (x, y, length) => {
    await page.mouse.move(bounds.x + bounds.width * x, bounds.y + bounds.height * y);
    const input = page.getByLabel("Direct length in millimetres");
    await input.waitFor({ state: "visible" });
    await input.fill(String(length));
    await input.press("Enter");
  };

  await canvas.click({ position: { x: bounds.width * 0.36, y: bounds.height * 0.62 } });
  await moveAndCommit(0.66, 0.62, 5000);
  await page.getByText("2 points").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Undo last point" }).click();
  await page.getByText("1 points").waitFor({ state: "visible" });
  await moveAndCommit(0.66, 0.62, 5000);
  await moveAndCommit(0.66, 0.2, 8000);
  await moveAndCommit(0.36, 0.2, 5000);
  await page.getByText("4 points").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Close foundation" }).click();
  await page.getByText("Building properties").waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(artifacts, "e2e-foundation.png") });

  await page.getByRole("button", { name: "Save" }).click();
  await page.getByText("Saved").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Back to home" }).click();
  await page.locator(".home-page").waitFor({ state: "visible" });
  await page.getByText("Foundation E2E", { exact: true }).first().click();
  await page.locator(".editor-shell").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Edit" }).click();
  await page
    .getByText(/40\.00/)
    .first()
    .waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Architecture" }).click();
  await page.getByRole("button", { name: "Building 1" }).first().click();
  await page.mouse.move(bounds.x + bounds.width * 0.42, bounds.y + bounds.height * 0.52);
  await page
    .locator('.scene-host[data-placement-preview="place-building"]')
    .waitFor({ state: "visible" });
  await canvas.click({ position: { x: bounds.width * 0.42, y: bounds.height * 0.52 } });
  await page.getByText("1 buildings · 0 objects").waitFor({ state: "visible" });

  await page.getByRole("button", { name: "Building 1" }).first().click();
  await page.mouse.move(bounds.x + bounds.width * 0.62, bounds.y + bounds.height * 0.5);
  await page
    .locator('.scene-host[data-placement-preview="place-building"]')
    .waitFor({ state: "visible" });
  await canvas.click({ position: { x: bounds.width * 0.62, y: bounds.height * 0.5 } });
  await page.getByRole("button", { name: "Make unique" }).click();
  await page.getByText("Building 1 copy", { exact: true }).first().waitFor({ state: "visible" });
  await page.getByText("2 buildings · 0 objects").waitFor({ state: "visible" });

  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await page.getByText("3 buildings · 0 objects").waitFor({ state: "visible" });

  await page.getByRole("button", { name: "Add object" }).click();
  await page.getByRole("button", { name: "Hedge segment", exact: true }).click();
  await page.mouse.move(bounds.x + bounds.width * 0.52, bounds.y + bounds.height * 0.67);
  await page
    .locator('.scene-host[data-placement-preview="place-asset"]')
    .waitFor({ state: "visible" });
  await canvas.click({ position: { x: bounds.width * 0.52, y: bounds.height * 0.67 } });
  await page.getByText("3 buildings · 1 objects").waitFor({ state: "visible" });

  await page.getByRole("button", { name: "Save" }).click();
  await page.getByText("Saved").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Back to home" }).click();
  await page.locator(".home-page").waitFor({ state: "visible" });
  await page.getByText("Foundation E2E", { exact: true }).first().click();
  await page.getByText("3 buildings · 1 objects").waitFor({ state: "visible" });

  const rendererHasNode = await page.evaluate(
    () => typeof globalThis.process !== "undefined" || typeof globalThis.require !== "undefined",
  );
  if (rendererHasNode) throw new Error("Node globals leaked into the renderer.");
  console.log(
    "E2E passed: direct foundation, Builder edit, shared placement, Make Unique, building copy/paste, hedge preview, save, and reopen.",
  );
} finally {
  await app.close();
}
