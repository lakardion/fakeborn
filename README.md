# fakeborn

Fakes **born from** a validator. Pass `fakeborn` a validation schema you already
wrote (Zod, Valibot) and get back a value that satisfies it — no second,
hand-maintained description of your data that silently drifts from the schema.

The contract: **whatever `fake(schema)` returns parses cleanly through that same
schema's own validator.**

> **Status:** v1. Both adapters are in — **Zod** (v3) and **Valibot** (v1) —
> covering scalars, composites (object, array, tuple, union, optional, nullable),
> and the introspectable constraints (string lengths/formats, number int/bounds,
> array lengths). See the [PRD](https://github.com/lakardion/fakeborn/issues/1)
> and [Limitations](#limitations).

## Install

```shell
bun add fakeborn        # or: npm install fakeborn / pnpm add fakeborn
```

`fakeborn` depends only on [`@faker-js/faker`](https://fakerjs.dev) at runtime —
it introspects validators *structurally* and never imports them, so it isn't
locked to a specific Zod/Valibot version.

## Usage

```ts
import { z } from "zod";
import { fake } from "fakeborn";

const value = fake(z.string());
//    ^? string
z.string().parse(value); // ✓ always passes
```

Valibot works the same way — the adapter is auto-detected, no config:

```ts
import * as v from "valibot";
import { fake } from "fakeborn";

const User = v.object({ id: v.pipe(v.string(), v.uuid()), age: v.pipe(v.number(), v.integer()) });

const user = fake(User);
//    ^? { id: string; age: number }
v.parse(User, user); // ✓ always passes
```

### Options

`fake(schema, options?)` accepts `{ count, seed, adapter }`:

```ts
fake(schema, { count: 10 }); // → an array of 10 satisfying fakes
fake(schema, { seed: 123 }); // → deterministic: equal seeds, equal output
fake(schema, { adapter: "zod" }); // → force the adapter, skip auto-detection
```

- **`count`** — return an array of N fakes instead of a single value.
- **`seed`** — seed faker once up front for reproducible output; `seed` + `count`
  stays reproducible while still varying element to element.
- **`adapter`** — force a specific adapter, the escape hatch for the rare schema
  auto-detection can't place.

## How it works

A three-stage pipeline with a library-agnostic IR as the central seam:

```
validator schema ──[adapter]──▶ IR (normalized node tree) ──[generator + faker map]──▶ fake value
```

- **detection** — recognizes which validator a schema came from, structurally.
- **adapter** — the only code that knows a specific validator's internals; walks
  a schema into the IR.
- **IR** — a library-agnostic node tree carrying normalized constraints.
- **generator + faker map** — walks the IR, mapping each node kind to a faker
  generator. The faker map is an isolated, replaceable unit.

## Limitations

`fakeborn` honors only what a schema *structurally exposes*. v1 deliberately does
**not** handle:

- **Custom predicates** — Zod `.refine()` / Valibot `v.check()`: opaque functions,
  not introspectable.
- **Regex / pattern strings** — `.regex()` / `v.regex()`: would need a
  regex-to-string generator.
- **Recursive, lazy, or async schemas** — `z.lazy`, Valibot async.
- **Exclusive numeric bounds** — Zod's exclusive `.gt()`/`.lt()` are normalized to
  inclusive; Valibot's `v.gtValue`/`v.ltValue` are not yet honored.
- **Less-common containers** — `record`, `map`, `set`, `intersect`, `variant`,
  etc. (an unsupported construct throws a descriptive error, never a silently
  invalid fake).
- **Zod v4 internals** — v1 targets Zod v3.

Type inference (`fake(schema)` returning `z.infer` / `InferOutput`) is best-effort;
the tested guarantee is the **runtime** contract — the fake parses through its
schema.

## Develop

```shell
bun install
bun test        # round-trip tests: generated fakes parse through their schema
bun run typecheck
bun run build   # ESM + .d.ts into dist/
```

## License

ISC
