import type { IRNode } from "../ir";

/** Minimal structural view of the Zod internals we read — no zod import. */
type ZodDef = { typeName?: string };
type ZodSchemaLike = { _def?: ZodDef };

/**
 * Zod adapter: walk a Zod schema's `_def` tree into the library-agnostic IR.
 * This is the only code that knows Zod's internals; everything downstream sees
 * IR alone.
 *
 * v1 tracer: only `ZodString` is handled. Unsupported constructs throw a
 * descriptive error rather than producing a silently invalid fake.
 */
export function zodToIR(schema: unknown): IRNode {
  const typeName = (schema as ZodSchemaLike)?._def?.typeName;
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
