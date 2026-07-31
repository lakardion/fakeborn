// Playground runtime entry — bundled to public/playground-runtime/fakeborn.js
// by scripts/build-playground-runtime.ts. The sandboxed iframe's import map
// points the bare specifier "fakeborn" at that bundle.
//
// Built from the package SOURCE, not the published dist: the node build
// externalizes @faker-js/faker, but the browser bundle must be one
// self-contained file (faker's English locale included). Building from source
// also keeps the playground in lockstep with HEAD — no dist build-order
// coupling.
export * from "../../../../../packages/fakeborn/src/index";
