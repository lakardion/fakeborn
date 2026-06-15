/** Validator libraries fakeborn can adapt. */
export type AdapterName = "zod" | "valibot";

/** The minimal structural shape a Zod (v3) schema exposes: `_def.typeName`. */
export type ZodSchemaLike = { _def: { typeName: string } };

/** The minimal structural shape a Valibot (v1) schema exposes: `kind` + `type`. */
export type ValibotSchemaLike = { kind: "schema"; type: string };

/**
 * Structural Zod detection. Never imports Zod at runtime — only inspects the
 * shape of the schema. Zod (v3) schemas expose `_def` with a string `typeName`
 * (`"ZodString"`, `"ZodObject"`, …).
 *
 * Returns a type predicate so callers narrow without casting. Each step is a
 * real runtime check — `in`-operator narrowing (TS ≥ 4.9) reads the properties
 * off `unknown` as `unknown`, so there is no assertion that the compiler isn't
 * also verifying at runtime.
 */
export function isZodSchema(schema: unknown): schema is ZodSchemaLike {
  if (typeof schema !== "object" || schema === null || !("_def" in schema)) {
    return false;
  }
  const def = schema._def;
  if (typeof def !== "object" || def === null || !("typeName" in def)) {
    return false;
  }
  return typeof def.typeName === "string";
}

/**
 * Structural Valibot detection. Never imports Valibot at runtime — only inspects
 * the shape of the schema. Valibot (v1) schemas expose `kind === "schema"` and a
 * string `type` (`"string"`, `"object"`, …); pipe *actions* use `kind` values
 * like `"validation"`, so anchoring on `kind === "schema"` matches schemas only.
 *
 * Returns a type predicate so callers narrow without casting, the same way
 * `isZodSchema` does — each step is a real runtime check via `in`-narrowing.
 */
export function isValibotSchema(schema: unknown): schema is ValibotSchemaLike {
  if (typeof schema !== "object" || schema === null || !("kind" in schema)) {
    return false;
  }
  if (schema.kind !== "schema" || !("type" in schema)) {
    return false;
  }
  return typeof schema.type === "string";
}

/**
 * Detect which adapter to use for a schema, by structural inspection only.
 * Runs in order — Zod, then Valibot (their shapes are mutually exclusive) — and
 * throws a descriptive error when no supported validator is recognized.
 */
export function detectAdapter(schema: unknown): AdapterName {
  if (isZodSchema(schema)) return "zod";
  if (isValibotSchema(schema)) return "valibot";
  throw new Error(
    "fakeborn: could not detect a supported validator for the given schema. " +
      "v1 supports Zod and Valibot schemas.",
  );
}
