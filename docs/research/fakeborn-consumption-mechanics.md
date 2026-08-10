# Consumption mechanics: how tn-models-fp would consume a local fakeborn build

Research for issue #43 (part of wayfinder map #41). All verification done against
branch `research/fakeborn-consumption-mechanics` (worktree at
`/tmp/fakeborn-research-consumption`, since removed) and a throwaway branch
`spike/fakeborn-consumption` in the tn-models-fp repo
(`/Users/lakardion/repos/tn-models-fp`, commit `a03004d`, local only, never pushed).

## TL;DR

`pnpm add <path-to-packages/fakeborn>` in tn-models-fp Just Works. pnpm converts it
to a `link:` dependency, vitest 0.27 resolves and runs it, fakeborn's own
faker v9 nests cleanly next to tn-models-fp's faker v7, and fakeborn's structural
zod adapter introspects zod 3.23.8 schemas without importing zod. Smoke tests pass;
the full existing tn-models-fp suite (162 tests) still passes with the link in place.

## (a) Recommended linking setup

```bash
# 1. Build fakeborn once (Bun workspaces monorepo)
git clone git@github.com:lakardion/fakeborn.git   # or use existing checkout
cd fakeborn
bun install
bun run build        # -> packages/fakeborn/dist/{index.js,index.d.ts,...}

# 2. Link into tn-models-fp
cd /path/to/tn-models-fp
pnpm add /path/to/fakeborn/packages/fakeborn
#    pnpm records:  "fakeborn": "link:/path/to/fakeborn/packages/fakeborn"
#    and creates node_modules/fakeborn -> symlink to the source dir

# 3. Use in a test
#    import { fake } from "fakeborn"
#    fake(z.string().email())
```

**Evidence**

- `pnpm add /tmp/fakeborn-research-consumption/packages/fakeborn` output:
  `+ fakeborn 1.0.0 <- ../../../../tmp/fakeborn-research-consumption/packages/fakeborn`;
  `package.json` gained `"fakeborn": "link:/tmp/fakeborn-research-consumption/packages/fakeborn"`;
  `node_modules/fakeborn` is a symlink to the source dir (tn-models-fp `package.json:31`,
  `ls -la node_modules/fakeborn` on branch `spike/fakeborn-consumption`).
- fakeborn build script: `packages/fakeborn/package.json` →
  `"build": "bun build ./src/index.ts --outdir ./dist --target node --external @faker-js/faker && bun run build:types"`.

**Why `link:` over the alternatives**

- `pnpm add <path>` (auto-`link:`): live symlink. Rebuilds of fakeborn are picked up
  immediately — ideal for playground iteration. The linked package's own
  dependencies (faker v9) resolve from the fakeborn repo's own `node_modules`, which
  exists because step 1 ran `bun install`
  (`node -e "…require.resolve…"` → `/tmp/fakeborn-research-consumption/node_modules/.bun/@faker-js+faker@9.9.0/…`).
- `file:` protocol: pnpm 10 **hardlinks** the package into the virtual store
  (verified in a scratch project `/tmp/pnpm-file-test`: same inode
  `190745495` for store copy and source `dist/index.js`). Content edits show through,
  but any rebuild that *replaces* files (new inodes) leaves the store stale →
  requires `pnpm install` again. Also installs faker 9.9.0 into the store properly.
  Fine for a frozen snapshot; worse for iteration.
- `pnpm link --global` + `pnpm link --global fakeborn`: unnecessary ceremony; the
  direct path form above is one command and records the intent in `package.json`.
- pnpm `overrides`: not applicable — nothing to override; fakeborn is a new
  dev-only dependency.

## (b) Compatibility matrix

| Axis | tn-models-fp | fakeborn | Compatible? | Evidence |
|---|---|---|---|---|
| Package manager | pnpm 10.30.3 (`packageManager` in `package.json`) | Bun workspaces (root `package.json` `"workspaces"`) | Yes — each side keeps its own tool; only the built `packages/fakeborn` dir crosses over | builds + install commands above |
| Test runner | vitest 0.27.3 + vite 4 (`pnpm-lock.yaml` `vitest@0.27.3`; `package.json` devDeps) | ESM-only dist | Yes | `pnpm vitest run src/fakeborn-smoke.test.ts` → 5 passed, `RUN v0.27.3` |
| Module format | tests are ESM under vitest; tsconfig `"module": "CommonJS"` (tsc lint only) | `"type": "module"`, exports map has **only** an `import` condition; `dist/index.js` ends in `export { … }` and does `import { faker } from "@faker-js/faker"` | Yes for vitest/ESM; **no `require()` path** (see landmines) | `packages/fakeborn/package.json` exports; `tail dist/index.js`; `tsc --noEmit` exit 0 in tn-models-fp |
| Type declarations | tsc (node10-style resolution via top-level `types`) | `"types": "./dist/index.d.ts"` top-level **and** under `exports["."].types` | Yes | `packages/fakeborn/package.json`; `npx tsc --noEmit` exit 0 with the smoke test importing `fakeborn` |
| faker | `@faker-js/faker` **7.6.0** (devDep `^7.6.0`); tests use removed-in-v8 APIs (`faker.name.firstName()` at e.g. `src/collection-manager/collection-manager.test.ts:30`) | `@faker-js/faker` **9.9.0** installed (`^9.0.0` runtime dep, marked `--external` at build) | Yes — two majors coexist as **separate module instances**; no shared singleton | `node -e` version probes: consumer 7.6.0 / fakeborn-side 9.9.0; smoke test asserting `faker.name.firstName()` still works passed alongside fakeborn tests |
| zod | 3.23.8 (`node_modules/zod/package.json`), peer range `>=3.23.8` | zod is a **devDep only** (`^3.23.0`); runtime never imports zod | Yes | `packages/fakeborn/package.json`; `src/detect.ts` comment "Never imports Zod at runtime"; smoke tests introspect consumer's own zod 3.23.8 schemas (`z.string()._def.typeName === "ZodString"`, checks `[{"kind":"email"}]` — verified via `node -e`) |

## (c) Landmines

1. **fakeborn is ESM-only.** `exports["."]` has `types` + `import` only — no
   `require` condition (`packages/fakeborn/package.json`). Fine for vitest and any
   ESM/bundler consumer; a CJS `require("fakeborn")` (e.g. a plain Node CJS script
   or Jest-with-CJS setup) fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`. Not a problem
   for tn-models-fp's vitest setup, but worth knowing if the playground later adds
   CJS tooling.
2. **faker instance isolation cuts both ways.** fakeborn imports its own faker v9
   (`packages/fakeborn/src/faker-map.ts:1`), so `faker.seed()` from tn-models-fp's
   v7 instance does **not** seed fakeborn — reproducibility must go through
   `fake(schema, { seed })` (`packages/fakeborn/src/fake.ts` `FakeOptions.seed`).
   There is no way to inject the consumer's faker instance (and injecting a v7
   faker would break fakeborn — it calls v9-only APIs like `faker.string.uuid()`,
   `faker.number.int()` in `faker-map.ts`).
3. **Do not bump tn-models-fp's own faker to v9** as a "cleanup": its tests use
   v7-only APIs (`faker.name.firstName()` etc., removed in v8). Coexistence works;
   unification is a separate migration.
4. **`link:` requires the fakeborn repo to stay built and installed.** The symlink
   resolves fakeborn's faker v9 from the fakeborn repo's own `node_modules`. If you
   `rm -rf node_modules` or move the fakeborn checkout, tn-models-fp breaks at
   import time. `file:` snapshots instead (but goes stale on rebuild — hardlink
   semantics, verified via inode check in `/tmp/pnpm-file-test`).
5. **Unsupported zod constructs throw.** The adapter supports string, number,
   boolean, date, bigint, literal, enum, object, array, tuple, union, optional,
   nullable (`packages/fakeborn/src/adapters/zod.ts` `zodToIR` switch +
   final `throw new UnsupportedSchemaError`). tn-models-fp schemas using e.g.
   `z.record()`, `z.map()`, discriminated unions, effects/refinements
   (`.transform()`, `.refine()`) will throw at `fake()` time, not silently
   misbehave — scope playground schemas accordingly.

## (d) Smoke-test evidence

Scratch test `src/fakeborn-smoke.test.ts` on tn-models-fp branch
`spike/fakeborn-consumption` (commit `a03004d`) — five tests: plain string,
email round-trip through `z.string().email()`, nested object with
`uuid`/`int().min().max()`/`array().min().max()`/`optional()`, seed
reproducibility (`fake(s, {seed:42})` deep-equals itself), and a coexistence probe
calling the consumer's own faker v7 `faker.name.firstName()`.

Commands and results:

```
$ pnpm vitest run src/fakeborn-smoke.test.ts
 RUN  v0.27.3 /Users/lakardion/repos/tn-models-fp
 ✓ src/fakeborn-smoke.test.ts  (5 tests) 6ms
 Test Files  1 passed (1)   Tests  5 passed (5)

$ pnpm vitest run          # full existing suite, with fakeborn linked
 Test Files  14 passed (14)  Tests  162 passed (162)

$ npx tsc --noEmit         # tn-models-fp lint, smoke test included
 exit 0
```

Version probes:

```
$ node -e "…require('./node_modules/@faker-js/faker/package.json').version"          # in tn-models-fp
7.6.0
$ node -e "…/tmp/fakeborn-research-consumption/packages/fakeborn/node_modules/@faker-js/faker/package.json…"
9.9.0
$ grep '"version"' node_modules/zod/package.json                                    # in tn-models-fp
3.23.8
```

## Artifacts left behind

- tn-models-fp branch `spike/fakeborn-consumption` (local only, commit `a03004d`):
  the `link:` dependency entry, updated lockfile, and the smoke test. Useful as
  runnable evidence; safe to delete after the playground work lands.
- Scratch project `/tmp/pnpm-file-test` used to verify `file:` protocol semantics.
