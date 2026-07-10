import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pngToIco from "png-to-ico";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(path.join(root, "build", "icon.svg"));
const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = await Promise.all(
  sizes.map((size) => sharp(source).resize(size, size).png().toBuffer()),
);
await writeFile(path.join(root, "build", "icon.png"), images.at(-1));
await writeFile(path.join(root, "build", "icon.ico"), await pngToIco(images));
console.log("Generated build/icon.png and build/icon.ico");
