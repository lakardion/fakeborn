/** Validator libraries fakeborn can adapt. v1 tracer ships Zod only. */
export type AdapterName = "zod";

/** The minimal structural shape a Zod (v3) schema exposes: `_def.typeName`. */
export type ZodSchemaLike = { _def: { typeName: string } };

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
 * Detect which adapter to use for a schema, by structural inspection only.
 * Throws a descriptive error when no supported validator is recognized.
 */
export function detectAdapter(schema: unknown): AdapterName {
  if (isZodSchema(schema)) return "zod";
  throw new Error(
    "fakeborn: could not detect a supported validator for the given schema. " +
      "v1 currently supports Zod schemas (Valibot is coming).",
  );
}
