import type { IRNode } from "./ir";
import { defaultFakerMap, type FakerMap, type GeneratorContext } from "./faker-map";

/**
 * Walk an IR node into a concrete value using a faker map. Recursive by design:
 * composite nodes fake their children through `ctx.generate`, so the generator
 * stays library-agnostic and depends only on the IR and the map shape.
 *
 * Throws a descriptive error when the map has no entry for a node kind, rather
 * than returning a silently invalid fake.
 */
export function generate(node: IRNode, fakerMap: FakerMap = defaultFakerMap): unknown {
  const ctx: GeneratorContext = {
    generate: (child) => generate(child, fakerMap),
  };
  const gen = fakerMap[node.kind];
  if (!gen) {
    throw new Error(`fakeborn: no faker mapping for IR node kind "${node.kind}".`);
  }
  // `gen` is the entry for *this* node's kind, but the compiler types
  // `fakerMap[node.kind]` as the union of every per-kind generator, whose
  // shared parameter type reduces to `never` — the correlated-union limitation
  // (microsoft/TypeScript#30581, #47109). The missing-entry case above stays
  // fully type-checked; this assertion only bridges that one contravariant gap
  // (`node`'s runtime kind matches `gen`) and never escapes this function.
  return (gen as (node: IRNode, ctx: GeneratorContext) => unknown)(node, ctx);
}
