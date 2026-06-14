# fakeborn

Fakes **born from** a validator. Pass `fakeborn` a validation schema you already
wrote (Zod, Valibot) and get back a value that satisfies it — no second,
hand-maintained description of your data that silently drifts from the schema.

The contract: **whatever `fake(schema)` returns parses cleanly through that same
schema's own validator.**

> **Status:** tracer slice. The full pipeline is wired end-to-end and proven on
> the simplest schema — a Zod `string`. Later slices widen it to numbers,
> booleans, objects, arrays, unions, …, and add Valibot. See the
> [PRD](https://github.com/lakardion/fakeborn/issues/1).

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

## Develop

```shell
bun install
bun test        # round-trip tests: generated fakes parse through their schema
bun run typecheck
bun run build   # ESM + .d.ts into dist/
```

## License

ISC
