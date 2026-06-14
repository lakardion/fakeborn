/** Validator libraries fakeborn can adapt. v1 tracer ships Zod only. */
export type AdapterName = "zod";

/**
 * Structural Zod detection. Never imports Zod at runtime — only inspects the
 * shape of the schema. Zod (v3) schemas expose `_def` with a string `typeName`
 * (`"ZodString"`, `"ZodObject"`, …).
 */
export function isZodSchema(schema: unknown): boolean {
  if (typeof schema !== "object" || schema === null) return false;
  const def = (schema as { _def?: unknown })._def;
  if (typeof def !== "object" || def === null) return false;
  return typeof (def as { typeName?: unknown }).typeName === "string";
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
