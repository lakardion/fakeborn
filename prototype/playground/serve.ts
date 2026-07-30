// PROTOTYPE — throwaway code answering fakeborn#26 ("what should the playground look and behave like?").
// Three UI variants on one page, switchable via ?variant=A|B|C or the floating bottom bar.
// Run with: bun run prototype

const root = import.meta.dir;

const app = await Bun.build({
  entrypoints: [`${root}/app.ts`],
  outdir: `${root}/dist`,
  target: "browser",
  minify: false,
  sourcemap: "inline",
});
if (!app.success) {
  console.error(app.logs);
  process.exit(1);
}

// Pre-bundled runtimes for the sandboxed iframe's import map (research: fakeborn#23).
const runtime = await Bun.build({
  entrypoints: [
    `${root}/runtime/zod.ts`,
    `${root}/runtime/valibot.ts`,
    `${root}/runtime/fakeborn.ts`,
  ],
  outdir: `${root}/dist/runtime`,
  target: "browser",
  minify: true,
  naming: "[name].js",
});
if (!runtime.success) {
  console.error(runtime.logs);
  process.exit(1);
}

Bun.serve({
  port: 4321,
  async fetch(req) {
    const path = new URL(req.url).pathname;
    const file = Bun.file(root + (path === "/" ? "/index.html" : path));
    return (await file.exists())
      ? new Response(file)
      : new Response("not found", { status: 404 });
  },
});

console.log("PROTOTYPE playground → http://localhost:4321  (variants: ?variant=A | B | C)");
