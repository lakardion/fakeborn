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
 * Turn a validation schema into a fake value that satisfies it.
 *
 * Pipeline: detect validator (or use the forced `adapter`) → adapter walks the
 * schema into IR → generator walks the IR with the default faker map → value.
 * The runtime guarantee — the fake parses through the schema's own validator —
 * is the tested contract; the return type is inferred on a best-effort basis.
 *
 * With `count`, returns an array of that many independently-generated fakes;
 * without it, a single fake. A `seed` is applied once up front, so `seed` +
 * `count` is reproducible yet still varies element to element.
 */
export function fake<TSchema>(
  schema: TSchema,
  options: FakeOptions & { count: number },
): Infer<TSchema>[];
export function fake<TSchema>(schema: TSchema, options?: FakeOptions): Infer<TSchema>;
export function fake<TSchema>(
  schema: TSchema,
  options: FakeOptions = {},
): Infer<TSchema> | Infer<TSchema>[] {
  const { count, seed, adapter } = options;
  if (seed !== undefined) seedFaker(seed);
  const adapterName = adapter ?? detectAdapter(schema);
  const toIR = adapters[adapterName];
  const ir = toIR(schema);
  // The runtime→static boundary. `generate` produces a value the type system
  // cannot statically tie back to `Infer<TSchema>` (the value is driven by the
  // IR walked at runtime, not by the type), so these assertions bridge the
  // dynamic value(s) to the best-effort inferred type. It is the same boundary
  // Zod crosses when `.parse()` returns its inferred output. The runtime
  // guarantee — the fake parses through the schema — is the *tested* contract;
  // these casts carry no safety the round-trip tests don't already defend.
  if (count === undefined) {
    return generate(ir) as Infer<TSchema>;
  }
  return Array.from({ length: count }, () => generate(ir)) as Infer<TSchema>[];
}
