import { isZodSchema } from "../detect";
import type { IRNode } from "../ir";

/**
 * Zod adapter: walk a Zod schema's `_def` tree into the library-agnostic IR.
 * This is the only code that knows Zod's internals; everything downstream sees
 * IR alone.
 *
 * The top-level `_def.typeName` read is shared with detection via the
 * `isZodSchema` type predicate, so reading it needs no cast. Deeper `_def`
 * fields (a literal's `value`, an enum's `values`) are read off the same
 * narrowed `_def` with `in`-narrowing — still no cast — as each construct lands.
 *
 * Scalars handled: ZodString, ZodNumber, ZodBoolean, ZodDate, ZodBigInt,
 * ZodLiteral, ZodEnum. Plain (unconstrained) values only — length/bound/format
 * honoring is a later slice. Unsupported constructs throw a descriptive error
 * rather than producing a silently invalid fake.
 */
export function zodToIR(schema: unknown): IRNode {
  const def = isZodSchema(schema) ? schema._def : undefined;
  switch (def?.typeName) {
    case "ZodString":
      return { kind: "string" };
    case "ZodNumber":
      return { kind: "number" };
    case "ZodBoolean":
      return { kind: "boolean" };
    case "ZodDate":
      return { kind: "date" };
    case "ZodBigInt":
      return { kind: "bigint" };
    case "ZodLiteral":
      // The literal's value lives on `_def.value`.
      if (def && "value" in def) {
        return { kind: "literal", value: def.value };
      }
      break;
    case "ZodEnum":
      // The allowed members live on `_def.values`.
      if (def && "values" in def && Array.isArray(def.values)) {
        return { kind: "enum", values: def.values };
      }
      break;
  }
  throw new Error(
    `fakeborn: unsupported Zod schema "${def?.typeName ?? "unknown"}". ` +
      "v1 currently supports z.string(), z.number(), z.boolean(), z.date(), " +
      "z.bigint(), z.literal(), and z.enum(); more constructs are coming.",
  );
}
