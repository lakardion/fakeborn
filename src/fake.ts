import { zodToIR } from "./adapters/zod";
import { detectAdapter, type AdapterName } from "./detect";
import { generate } from "./generator";
import type { IRNode } from "./ir";

/**
 * Best-effort return-type inference. Zod (v3) schemas carry their output type
 * on the phantom `_output` property (this is exactly what `z.infer` reads). We
 * infer structurally so fakeborn never type-depends on a specific validator
 * version. Falls back to `unknown` for schemas we can't read.
 */
export type Infer<TSchema> = TSchema extends { _output: infer O } ? O : unknown;

/** Adapter registry: validator name → (schema → IR) walker. */
const adapters: Record<AdapterName, (schema: unknown) => IRNode> = {
  zod: zodToIR,
};

/**
 * Turn a validation schema into a fake value that satisfies it.
 *
 * Pipeline: detect validator → adapter walks the schema into IR → generator
 * walks the IR with the default faker map → value. The runtime guarantee — the
 * fake parses through the schema's own validator — is the tested contract; the
 * return type is inferred on a best-effort basis.
 */
export function fake<TSchema>(schema: TSchema): Infer<TSchema> {
  const adapterName = detectAdapter(schema);
  const toIR = adapters[adapterName];
  const ir = toIR(schema);
  return generate(ir) as Infer<TSchema>;
}
