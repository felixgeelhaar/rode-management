#!/usr/bin/env node
/**
 * Generate Stream Deck artwork (preferred) or fall back to tiny placeholders.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(root, "scripts/generate-icons.py");

const generated = spawnSync("python3", [script], {
  cwd: root,
  encoding: "utf8",
});

if (generated.status === 0) {
  process.stdout.write(generated.stdout || "");
  if (generated.stderr) process.stderr.write(generated.stderr);
  process.exit(0);
}

console.warn(
  "Icon generator unavailable; writing minimal placeholders.",
  generated.stderr || generated.error || "",
);

const pluginRoot = join(root, "com.felixgeelhaar.rode-control.sdPlugin");
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5X2ZQAAAAASUVORK5CYII=",
  "base64",
);

const targets = [
  "imgs/category-icon.png",
  "imgs/plugin-icon.png",
  "imgs/actions/mic-gain/icon.png",
  "imgs/actions/mic-gain/key.png",
  "imgs/actions/mic-monitor/icon.png",
  "imgs/actions/mic-monitor/key.png",
  "imgs/actions/channel-level/icon.png",
  "imgs/actions/channel-level/key.png",
  "imgs/actions/mute-toggle/icon.png",
  "imgs/actions/mute-toggle/key.png",
  "imgs/actions/listen-toggle/icon.png",
  "imgs/actions/listen-toggle/key.png",
  "imgs/actions/hpf-toggle/icon.png",
  "imgs/actions/hpf-toggle/key.png",
  "imgs/actions/compressor-toggle/icon.png",
  "imgs/actions/compressor-toggle/key.png",
  "imgs/actions/pad-trigger/icon.png",
  "imgs/actions/pad-trigger/key.png",
  "imgs/actions/record-toggle/icon.png",
  "imgs/actions/record-toggle/key.png",
  "imgs/actions/apply-workflow/icon.png",
  "imgs/actions/apply-workflow/key.png",
  "imgs/actions/capture-workflow/icon.png",
  "imgs/actions/capture-workflow/key.png",
];

for (const relative of targets) {
  const absolute = join(pluginRoot, relative);
  if (existsSync(absolute)) continue;
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, PNG);
}

console.log(`Ensured ${targets.length} placeholder PNG paths`);
