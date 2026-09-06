import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = join(root, "com.felixgeelhaar.rode-control.sdPlugin");

/** Minimal valid 1x1 PNG (dark gray) used as placeholder artwork. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5X2ZQAAAAASUVORK5CYII=",
  "base64",
);

const targets = [
  "imgs/category-icon.png",
  "imgs/plugin-icon.png",
  "imgs/actions/mic-gain/icon.png",
  "imgs/actions/mic-gain/key.png",
  "imgs/actions/channel-level/icon.png",
  "imgs/actions/channel-level/key.png",
];

for (const relative of targets) {
  const absolute = join(pluginRoot, relative);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, PNG);
}

console.log(`Wrote ${targets.length} placeholder PNGs`);
