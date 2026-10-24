// Self-hosts the MediaPipe hand-tracking runtime so gesture mode never waits on
// a third-party CDN (and keeps working offline once cached).
//   - wasm runtime: copied from node_modules/@mediapipe/tasks-vision/wasm.
//     Only the ES-module build is shipped: the tracker runs in a module worker
//     (FilesetResolver.forVisionTasks(.., true)), where SIMD is assumed, so the
//     classic and no-SIMD variants would be ~26 MB of dead weight.
//   - model:        hand_landmarker.task (Apache-2.0, Google), downloaded once
// Output lives in public/mediapipe/ (gitignored). Runs via predev / prebuild.
import { copyFile, mkdir, rm, stat, writeFile, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "mediapipe");
const wasmSrc = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const wasmDest = join(outDir, "wasm");
const modelPath = join(outDir, "hand_landmarker.task");
const MODEL_URL =
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const MIN_MODEL_BYTES = 1_000_000;
const WASM_FILES = [
    "vision_wasm_module_internal.js",
    "vision_wasm_module_internal.wasm",
];

async function main() {
    if (!existsSync(wasmSrc)) {
        throw new Error(
            "@mediapipe/tasks-vision is not installed. Run `npm install` first."
        );
    }
    await mkdir(outDir, { recursive: true });
    // Always refresh wasm so it can never drift from the installed package
    // version, and wipe first so stale variants from older runs disappear.
    await rm(wasmDest, { recursive: true, force: true });
    await mkdir(wasmDest, { recursive: true });
    for (const name of WASM_FILES) {
        await copyFile(join(wasmSrc, name), join(wasmDest, name));
    }

    if (existsSync(modelPath) && (await stat(modelPath)).size >= MIN_MODEL_BYTES) {
        return;
    }
    console.log("[setup-mediapipe] downloading hand_landmarker.task ...");
    const res = await fetch(MODEL_URL);
    if (!res.ok) {
        throw new Error(`Model download failed: HTTP ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < MIN_MODEL_BYTES) {
        throw new Error(`Model download looks truncated (${buf.length} bytes)`);
    }
    // Write to a temp file then rename so an interrupted run never leaves a corrupt model.
    const tmp = `${modelPath}.part`;
    await writeFile(tmp, buf);
    await rename(tmp, modelPath);
    console.log(`[setup-mediapipe] model saved (${(buf.length / 1e6).toFixed(1)} MB)`);
}

main().catch((err) => {
    console.error("[setup-mediapipe]", err.message);
    process.exit(1);
});
