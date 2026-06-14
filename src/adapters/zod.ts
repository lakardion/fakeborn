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
 * Scalars: ZodString, ZodNumber, ZodBoolean, ZodDate, ZodBigInt, ZodLiteral,
 * ZodEnum. Composites: ZodObject, ZodArray, ZodTuple, ZodUnion, ZodOptional,
 * ZodNullable — these recurse back through `zodToIR` on their child schemas, so
 * nesting works to arbitrary depth. Plain (unconstrained) values only —
 * length/bound/format honoring is a later slice. Unsupported constructs throw a
 * descriptive error rather than producing a silently invalid fake.
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
    case "ZodObject":
      // `_def.shape` is a thunk returning the `{ key: schema }` map; each value
      // is itself a schema, walked recursively.
      if (def && "shape" in def && typeof def.shape === "function") {
        const shape: unknown = def.shape();
        if (typeof shape === "object" && shape !== null) {
          const entries: Record<string, IRNode> = {};
          for (const [key, child] of Object.entries(shape)) {
            entries[key] = zodToIR(child);
          }
          return { kind: "object", entries };
        }
      }
      break;
    case "ZodArray":
      // `_def.type` is the element schema.
      if (def && "type" in def) {
        return { kind: "array", element: zodToIR(def.type) };
      }
      break;
    case "ZodTuple":
      // `_def.items` is the positional element schemas.
      if (def && "items" in def && Array.isArray(def.items)) {
        return { kind: "tuple", elements: def.items.map((item) => zodToIR(item)) };
      }
      break;
    case "ZodUnion":
      // `_def.options` is the member schemas.
      if (def && "options" in def && Array.isArray(def.options)) {
        return { kind: "union", options: def.options.map((option) => zodToIR(option)) };
      }
      break;
    case "ZodOptional":
      // Both wrappers carry their wrapped schema on `_def.innerType`.
      if (def && "innerType" in def) {
        return { kind: "optional", inner: zodToIR(def.innerType) };
      }
      break;
    case "ZodNullable":
      if (def && "innerType" in def) {
        return { kind: "nullable", inner: zodToIR(def.innerType) };
      }
      break;
  }
  throw new Error(
    `fakeborn: unsupported Zod schema "${def?.typeName ?? "unknown"}". ` +
      "Supported so far: string, number, boolean, date, bigint, literal, enum, " +
      "object, array, tuple, union, optional, nullable. More constructs are coming.",
  );
}
