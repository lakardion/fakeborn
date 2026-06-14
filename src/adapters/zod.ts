import { isZodSchema } from "../detect";
import type { IRNode } from "../ir";

/**
 * Zod adapter: walk a Zod schema's `_def` tree into the library-agnostic IR.
 * This is the only code that knows Zod's internals; everything downstream sees
 * IR alone.
 *
 * The top-level `_def.typeName` read is shared with detection via the
 * `isZodSchema` type predicate, so reading it needs no cast. Deeper `_def`
 * fields (checks, shape, …) get their own narrowing as later slices add them.
 *
 * v1 tracer: only `ZodString` is handled. Unsupported constructs throw a
 * descriptive error rather than producing a silently invalid fake.
 */
export function zodToIR(schema: unknown): IRNode {
  const typeName = isZodSchema(schema) ? schema._def.typeName : undefined;
  switch (typeName) {
    case "ZodString":
      return { kind: "string" };
    default:
      throw new Error(
        `fakeborn: unsupported Zod schema "${typeName ?? "unknown"}". ` +
          "v1 currently supports z.string(); more constructs are coming.",
      );
  }
}
