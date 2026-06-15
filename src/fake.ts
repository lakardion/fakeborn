import { zodToIR } from "./adapters/zod";
import { detectAdapter, type AdapterName } from "./detect";
import { seedFaker } from "./faker-map";
import { generate } from "./generator";
import type { IRNode } from "./ir";

/**
 * Best-effort return-type inference. Zod (v3) schemas carry their output type
 * on the phantom `_output` property (this is exactly what `z.infer` reads). We
 * infer structurally so fakeborn never type-depends on a specific validator
 * version. Falls back to `unknown` for schemas we can't read.
 */
export type Infer<TSchema> = TSchema extends { _output: infer O } ? O : unknown;

/**
 * Options for `fake()`.
 *
 * - `count` — produce an array of N fakes instead of a single value.
 * - `seed` — seed faker once before generating, for reproducible output. Equal
 *   seeds yield equal results (including across the whole `count` batch).
 * - `adapter` — force a specific adapter, bypassing auto-detection. The escape
 *   hatch for ambiguous schemas detection can't decide.
 */
export type FakeOptions = {
  count?: number;
  seed?: number;
  adapter?: AdapterName;
};

/** Adapter registry: validator name → (schema → IR) walker. */
const adapters: Record<AdapterName, (schema: unknown) => IRNode> = {
  zod: zodToIR,
};

/**
 * `fake()`'s return type. The *presence* of a `count` key on the options type —
 * not its runtime value — selects the branch: `count` given → an array of fakes,
 * otherwise a single fake. So `fake(s)` and `fake(s, { seed })` infer a single
 * value, while `fake(s, { count: n })` infers an array, from one signature with
 * no overloads.
 */
export type FakeResult<TSchema, TOptions extends FakeOptions> = TOptions extends {
  count: number;
}
  ? Infer<TSchema>[]
  : Infer<TSchema>;

/**
 * Turn a validation schema into a fake value that satisfies it.
 *
 * Pipeline: detect validator (or use the forced `adapter`) → adapter walks the
 * schema into IR → generator walks the IR with the default faker map → value.
 * The runtime guarantee — the fake parses through the schema's own validator —
 * is the tested contract; the return type is inferred on a best-effort basis.
 *
 * With `count`, returns an array of that many independently-generated fakes;
 * without it, a single fake (see `FakeResult`). A `seed` is applied once up
 * front, so `seed` + `count` is reproducible yet still varies element to
 * element. `TOptions` is a `const` type parameter so the literal options at the
 * call site (`{ count: 3 }`) drive the conditional return type.
 */
export function fake<TSchema, const TOptions extends FakeOptions = {}>(
  schema: TSchema,
  options?: TOptions,
): FakeResult<TSchema, TOptions> {
  const { count, seed, adapter } = options ?? {};
  if (seed !== undefined) seedFaker(seed);
  const adapterName = adapter ?? detectAdapter(schema);
  const ir = adapters[adapterName](schema);
  // The runtime→static boundary. `generate` produces a value the type system
  // cannot tie back to `FakeResult` — the shape is driven by the IR walked at
  // runtime and by whether `count` was passed, not by the type — so this single
  // assertion bridges the dynamic result to the inferred return type. It is the
  // same boundary Zod crosses when `.parse()` returns its inferred output; the
  // runtime guarantee (the fake parses through the schema) is the *tested*
  // contract, and this cast carries no safety the round-trip tests don't defend.
  const result: unknown =
    count === undefined ? generate(ir) : Array.from({ length: count }, () => generate(ir));
  return result as FakeResult<TSchema, TOptions>;
}
