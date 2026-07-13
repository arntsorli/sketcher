import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ignoredFiles = new Set(["package-lock.json", "scripts/privacy-check.mjs"]);
const checks = [
  ["Windows or macOS home path", /(?:[A-Z]:\\Users\\|\\OneDrive\\|\/Users\/)/i],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["access token", /(?:ghp_|github_pat_|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{16,})/],
  ["personal email", /\b[A-Z0-9._%+-]+@(?!users\.noreply\.github\.com\b)[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
];

const files = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
  .split(/\r?\n/)
  .filter((file) => file && !ignoredFiles.has(file) && existsSync(path.join(root, file)));
const findings = [];

for (const file of files) {
  const content = await readFile(path.join(root, file), "utf8");
  for (const [label, pattern] of checks) {
    if (pattern.test(content)) findings.push(`${file}: ${label}`);
  }
}

if (findings.length > 0) {
  console.error("Privacy check failed. Remove the matching data before publishing:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`Privacy check passed for ${files.length} tracked files.`);
