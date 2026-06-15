import { isZodSchema } from "../detect";
import type { IRNode } from "../ir";

/**
 * A Zod check object exposes a string `kind` plus kind-specific fields. The
 * index signature lets us read those extra fields (`value`, `inclusive`, …) as
 * `unknown` and narrow them, rather than casting.
 */
type ZodCheck = { kind: string; [key: string]: unknown };

function isZodCheck(check: unknown): check is ZodCheck {
  return (
    typeof check === "object" && check !== null && "kind" in check && typeof check.kind === "string"
  );
}

/** Read a numeric field (e.g. `value`) off a narrowed check, or `undefined`. */
function numField(check: ZodCheck, field: string): number | undefined {
  const value = check[field];
  return typeof value === "number" ? value : undefined;
}

/** A schema's `_def.checks`, or an empty list when it carries none. */
function checksOf(def: { typeName: string }): readonly unknown[] {
  return "checks" in def && Array.isArray(def.checks) ? def.checks : [];
}

type StringConstraints = Omit<Extract<IRNode, { kind: "string" }>, "kind">;

/** Map Zod string checks onto the IR string constraint fields. */
function stringConstraints(checks: readonly unknown[]): StringConstraints {
  const out: StringConstraints = {};
  for (const check of checks) {
    if (!isZodCheck(check)) continue;
    switch (check.kind) {
      case "email":
      case "url":
      case "uuid":
        out.format = check.kind;
        break;
      case "datetime":
        out.format = "date-iso";
        break;
      case "min":
        out.minLength = numField(check, "value");
        break;
      case "max":
        out.maxLength = numField(check, "value");
        break;
      case "length":
        out.length = numField(check, "value");
        break;
    }
  }
  return out;
}

/** A small offset to turn an exclusive float bound into an inclusive one. */
const FLOAT_EXCLUSIVE_STEP = 1e-6;

type Bound = { value: number; inclusive: boolean };

/**
 * Map Zod number checks onto the IR number constraint fields. Zod expresses
 * `.positive()`/`.negative()`/`.gt()`/`.lt()` as exclusive min/max checks and
 * `.int()` as a kind; we collect the tightest bound on each side and normalize
 * it to an inclusive value the generator can use directly (±1 for integers, a
 * tiny step for floats).
 */
function numberConstraints(
  checks: readonly unknown[],
): Omit<Extract<IRNode, { kind: "number" }>, "kind"> {
  let int = false;
  let min: Bound | undefined;
  let max: Bound | undefined;
  for (const check of checks) {
    if (!isZodCheck(check)) continue;
    if (check.kind === "int") {
      int = true;
      continue;
    }
    if (check.kind !== "min" && check.kind !== "max") continue;
    const value = numField(check, "value");
    if (value === undefined) continue;
    const inc = check.inclusive;
    const inclusive = typeof inc === "boolean" ? inc : true;
    if (check.kind === "min") {
      if (!min || value > min.value) min = { value, inclusive };
    } else if (!max || value < max.value) {
      max = { value, inclusive };
    }
  }
  const out: Omit<Extract<IRNode, { kind: "number" }>, "kind"> = {};
  if (int) out.int = true;
  if (min) {
    out.min = min.inclusive
      ? int
        ? Math.ceil(min.value)
        : min.value
      : int
        ? Math.floor(min.value) + 1
        : min.value + FLOAT_EXCLUSIVE_STEP;
  }
  if (max) {
    out.max = max.inclusive
      ? int
        ? Math.floor(max.value)
        : max.value
      : int
        ? Math.ceil(max.value) - 1
        : max.value - FLOAT_EXCLUSIVE_STEP;
  }
  return out;
}

/** A Zod length entry is `{ value } | null`; pull the numeric value out. */
function lengthValue(entry: unknown): number | undefined {
  return typeof entry === "object" &&
    entry !== null &&
    "value" in entry &&
    typeof entry.value === "number"
    ? entry.value
    : undefined;
}

/**
 * Read the exact/min/max array length off a ZodArray `_def`. `.length(n)` lands
 * as `exactLength` and pins both sides, so the generator (which only knows
 * min/max) honors it.
 */
function arrayLength(def: { typeName: string }): { minLength?: number; maxLength?: number } {
  const exact = "exactLength" in def ? lengthValue(def.exactLength) : undefined;
  if (exact !== undefined) return { minLength: exact, maxLength: exact };
  const out: { minLength?: number; maxLength?: number } = {};
  const min = "minLength" in def ? lengthValue(def.minLength) : undefined;
  const max = "maxLength" in def ? lengthValue(def.maxLength) : undefined;
  if (min !== undefined) out.minLength = min;
  if (max !== undefined) out.maxLength = max;
  return out;
}

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
 * nesting works to arbitrary depth. String/number/array constraints (lengths,
 * formats, int/bounds) are read off `_def.checks` and surfaced on the IR.
 * Unsupported constructs throw a descriptive error rather than producing a
 * silently invalid fake.
 */
export function zodToIR(schema: unknown): IRNode {
  const def = isZodSchema(schema) ? schema._def : undefined;
  switch (def?.typeName) {
    case "ZodString":
      if (def) return { kind: "string", ...stringConstraints(checksOf(def)) };
      break;
    case "ZodNumber":
      if (def) return { kind: "number", ...numberConstraints(checksOf(def)) };
      break;
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
      // `_def.type` is the element schema; min/max/exact length live alongside.
      if (def && "type" in def) {
        return { kind: "array", element: zodToIR(def.type), ...arrayLength(def) };
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
