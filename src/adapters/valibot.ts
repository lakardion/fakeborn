import { isValibotSchema } from "../detect";
import type { IRNode } from "../ir";

/**
 * A Valibot pipe action exposes a string `type` (`"min_length"`, `"email"`, …)
 * plus action-specific fields. The index signature lets us read those extra
 * fields (`requirement`) as `unknown` and narrow them, rather than casting.
 *
 * Only `kind: "validation"` items carry constraints; the first pipe entry is the
 * base schema (`kind: "schema"`) and transformations (`kind: "transformation"`)
 * don't constrain, so the guard filters on `kind`.
 */
type ValibotAction = { kind: string; type: string; [key: string]: unknown };

function isValibotAction(item: unknown): item is ValibotAction {
  return (
    typeof item === "object" &&
    item !== null &&
    "kind" in item &&
    item.kind === "validation" &&
    "type" in item &&
    typeof item.type === "string"
  );
}

/** Read the numeric `requirement` off a narrowed action, or `undefined`. */
function requirement(action: ValibotAction): number | undefined {
  const value = action.requirement;
  return typeof value === "number" ? value : undefined;
}

/**
 * A schema's `pipe` actions, or an empty list. `v.pipe(base, ...actions)` keeps
 * the base `type` on the schema and appends a `pipe` array (whose first entry is
 * the base schema, rest the actions); an un-piped schema carries no `pipe`.
 */
function pipeOf(schema: { type: string }): readonly unknown[] {
  return "pipe" in schema && Array.isArray(schema.pipe) ? schema.pipe : [];
}

type StringConstraints = Omit<Extract<IRNode, { kind: "string" }>, "kind">;

/** Map Valibot string pipe actions onto the IR string constraint fields. */
function stringConstraints(pipe: readonly unknown[]): StringConstraints {
  const out: StringConstraints = {};
  for (const action of pipe) {
    if (!isValibotAction(action)) continue;
    switch (action.type) {
      case "email":
      case "url":
      case "uuid":
        out.format = action.type;
        break;
      case "iso_timestamp":
      case "iso_date_time":
        out.format = "date-iso";
        break;
      case "min_length":
        out.minLength = requirement(action);
        break;
      case "max_length":
        out.maxLength = requirement(action);
        break;
      case "length":
        out.length = requirement(action);
        break;
    }
  }
  return out;
}

/**
 * Map Valibot number pipe actions onto the IR number fields. Valibot's
 * `min_value`/`max_value` are inclusive, so they map straight onto the IR bounds
 * — no exclusive normalization like the Zod adapter needs; `integer` sets int.
 */
function numberConstraints(
  pipe: readonly unknown[],
): Omit<Extract<IRNode, { kind: "number" }>, "kind"> {
  const out: Omit<Extract<IRNode, { kind: "number" }>, "kind"> = {};
  for (const action of pipe) {
    if (!isValibotAction(action)) continue;
    switch (action.type) {
      case "integer":
        out.int = true;
        break;
      case "min_value": {
        const value = requirement(action);
        if (value !== undefined) out.min = value;
        break;
      }
      case "max_value": {
        const value = requirement(action);
        if (value !== undefined) out.max = value;
        break;
      }
    }
  }
  return out;
}

/**
 * Read array min/max/exact length off the pipe. `v.length(n)` pins both sides,
 * so the generator (which only knows min/max) honors an exact length too.
 */
function arrayLength(pipe: readonly unknown[]): { minLength?: number; maxLength?: number } {
  const out: { minLength?: number; maxLength?: number } = {};
  for (const action of pipe) {
    if (!isValibotAction(action)) continue;
    switch (action.type) {
      case "min_length":
        out.minLength = requirement(action);
        break;
      case "max_length":
        out.maxLength = requirement(action);
        break;
      case "length": {
        const value = requirement(action);
        out.minLength = value;
        out.maxLength = value;
        break;
      }
    }
  }
  return out;
}

/**
 * Valibot adapter: walk a Valibot (v1) schema into the library-agnostic IR. This
 * is the only code that knows Valibot's internals; everything downstream sees IR
 * alone.
 *
 * The `kind: "schema"` + string `type` read is shared with detection via the
 * `isValibotSchema` type predicate, so reading `type` needs no cast. Deeper
 * fields (a literal's `value`, an enum's `options`, an object's `entries`, an
 * array's `item`, a tuple's `items`, a wrapper's `wrapped`) are read off the
 * same narrowed schema with `in`-narrowing — still no cast — as each construct
 * lands.
 *
 * Scalars: string, number, boolean, date, bigint, literal, picklist/enum.
 * Composites: object, array, tuple, union, optional, nullable — these recurse
 * back through `valibotToIR`, so nesting works to arbitrary depth. String/number
 * /array constraints (lengths, formats, int/bounds) are read off the schema's
 * `pipe` actions and surfaced on the IR. Unsupported constructs throw a
 * descriptive error rather than producing a silently invalid fake.
 */
export function valibotToIR(schema: unknown): IRNode {
  if (isValibotSchema(schema)) {
    switch (schema.type) {
      case "string":
        return { kind: "string", ...stringConstraints(pipeOf(schema)) };
      case "number":
        return { kind: "number", ...numberConstraints(pipeOf(schema)) };
      case "boolean":
        return { kind: "boolean" };
      case "date":
        return { kind: "date" };
      case "bigint":
        return { kind: "bigint" };
      case "literal":
        // The literal's value lives on `schema.literal`.
        if ("literal" in schema) return { kind: "literal", value: schema.literal };
        break;
      case "picklist":
      case "enum":
        // The allowed members are the flat `options` array (both the picklist
        // and the native-enum schema expose it).
        if ("options" in schema && Array.isArray(schema.options)) {
          return { kind: "enum", values: schema.options };
        }
        break;
      case "object": {
        // `entries` is the `{ key: schema }` map directly — no thunk to call,
        // unlike Zod's `_def.shape()`.
        const entries = "entries" in schema ? schema.entries : undefined;
        if (typeof entries === "object" && entries !== null) {
          const out: Record<string, IRNode> = {};
          for (const [key, child] of Object.entries(entries)) {
            out[key] = valibotToIR(child);
          }
          return { kind: "object", entries: out };
        }
        break;
      }
      case "array":
        // `item` is the element schema; min/max/exact length live on the pipe.
        if ("item" in schema) {
          return {
            kind: "array",
            element: valibotToIR(schema.item),
            ...arrayLength(pipeOf(schema)),
          };
        }
        break;
      case "tuple":
        // `items` is the positional element schemas.
        if ("items" in schema && Array.isArray(schema.items)) {
          return { kind: "tuple", elements: schema.items.map((item) => valibotToIR(item)) };
        }
        break;
      case "union":
        // `options` is the member schemas.
        if ("options" in schema && Array.isArray(schema.options)) {
          return { kind: "union", options: schema.options.map((option) => valibotToIR(option)) };
        }
        break;
      case "optional":
        // Both wrappers carry their wrapped schema on `schema.wrapped`.
        if ("wrapped" in schema) return { kind: "optional", inner: valibotToIR(schema.wrapped) };
        break;
      case "nullable":
        if ("wrapped" in schema) return { kind: "nullable", inner: valibotToIR(schema.wrapped) };
        break;
    }
    throw new Error(
      `fakeborn: unsupported Valibot schema "${schema.type}". ` +
        "Supported so far: string, number, boolean, date, bigint, literal, picklist, " +
        "enum, object, array, tuple, union, optional, nullable. More constructs are coming.",
    );
  }
  throw new Error("fakeborn: expected a Valibot schema (an object with kind: 'schema').");
}
