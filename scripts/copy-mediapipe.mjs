// Copies the MediaPipe runtime (JS loader, WASM, model files) out of
// node_modules into public/, so the app serves it itself instead of depending
// on the jsdelivr CDN. A blocked or unreachable CDN otherwise means no hand
// tracking at all, with nothing on screen to say why.
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const PACKAGES = ["hands", "drawing_utils"];
const SKIP = new Set(["package.json", "README.md", "index.d.ts"]);

for (const pkg of PACKAGES) {
  const src = join("node_modules", "@mediapipe", pkg);
  const dest = join("public", "mediapipe", pkg);
  if (!existsSync(src)) {
    console.error(`[copy-mediapipe] missing ${src} - run bun install`);
    process.exit(1);
  }
  mkdirSync(dest, { recursive: true });
  for (const file of readdirSync(src)) {
    if (!SKIP.has(file)) cpSync(join(src, file), join(dest, file));
  }
}
console.log("[copy-mediapipe] MediaPipe assets copied to public/mediapipe");
