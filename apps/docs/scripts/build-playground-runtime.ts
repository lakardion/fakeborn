/**
 * Build the playground's iframe runtime bundles.
 *
 * The playground executes user code in a sandboxed <iframe> whose import map
 * points bare specifiers ("zod", "valibot", "fakeborn") at pre-bundled,
 * pre-minified ESM files — the Valibot playground pattern. Those files are
 * what this script emits into `public/playground-runtime/`, so Astro copies
 * them verbatim and the iframe fetches them as plain static assets.
 *
 * Runs as part of `bun run dev` / `bun run build` in this workspace.
 */
import { gzipSync } from "node:zlib";

const OUTDIR = "public/playground-runtime";
const ENTRIES = [
  "src/playground/runtime/zod.ts",
  "src/playground/runtime/valibot.ts",
  "src/playground/runtime/fakeborn.ts",
];

const result = await Bun.build({
  entrypoints: ENTRIES,
  outdir: OUTDIR,
  target: "browser",
  format: "esm",
  minify: true,
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  throw new Error("Playground runtime build failed");
}

for (const output of result.outputs) {
  const bytes = await Bun.file(output.path).arrayBuffer();
  const gz = gzipSync(Buffer.from(bytes)).byteLength;
  const name = output.path.split("/").pop();
  console.log(
    `playground-runtime/${name}: ${(bytes.byteLength / 1024).toFixed(0)} KB min / ${(gz / 1024).toFixed(0)} KB gz`,
  );
}
