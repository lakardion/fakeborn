import { describe, expect, test } from "bun:test";
import { faker } from "@faker-js/faker";
import * as v from "valibot";
import { z } from "zod";
import { fake, UnsupportedSchemaError } from "./index";

// Cross-library detection: the same fake() entry point must route a Zod schema
// to the Zod adapter and a Valibot schema to the Valibot adapter — proven by
// round-tripping each fake through its own library's parser. The two
// structural shapes (`_def.typeName` vs `kind === "schema"` + `type`) are
// mutually exclusive, so a schema can only ever match one adapter.
describe("fake() — cross-library detection", () => {
  test("a Zod and a Valibot schema through the same fake() each round-trip through their own parser", () => {
    const zodSchema = z.object({
      email: z.string().email(),
      age: z.number().int().min(0),
    });
    const valibotSchema = v.object({
      email: v.pipe(v.string(), v.email()),
      age: v.pipe(v.number(), v.integer(), v.minValue(0)),
    });

    for (let i = 0; i < 500; i++) {
      faker.seed(i);
      expect(() => zodSchema.parse(fake(zodSchema))).not.toThrow();
      expect(() => v.parse(valibotSchema, fake(valibotSchema))).not.toThrow();
    }
  });

  test("an unrecognized schema with no explicit adapter throws UnsupportedSchemaError", () => {
    expect(() => fake({ not: "a schema" } as never)).toThrow(UnsupportedSchemaError);
  });
});
