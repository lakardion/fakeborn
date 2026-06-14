import { describe, expect, test } from "bun:test";
import { faker } from "@faker-js/faker";
import { z } from "zod";
import { fake } from "./index";

describe("fake() — Zod string tracer", () => {
  test("returns a string for z.string()", () => {
    const value = fake(z.string());
    expect(typeof value).toBe("string");
  });

  // The contract the whole project defends: a generated fake parses cleanly
  // through its source schema. Re-seeded across many iterations to surface any
  // randomness-induced violation.
  test("round-trip: z.string().parse(fake(z.string())) never throws over many re-seeded iterations", () => {
    const schema = z.string();
    for (let i = 0; i < 1000; i++) {
      faker.seed(i);
      const value = fake(schema);
      expect(() => schema.parse(value)).not.toThrow();
    }
  });

  test("identical seed produces identical output", () => {
    faker.seed(42);
    const a = fake(z.string());
    faker.seed(42);
    const b = fake(z.string());
    expect(a).toBe(b);
  });

  test("throws a descriptive error for an unsupported Zod construct", () => {
    expect(() => fake(z.number())).toThrow(/unsupported Zod schema/i);
  });

  test("throws a descriptive error when no validator is detected", () => {
    expect(() => fake({} as never)).toThrow(/could not detect/i);
  });
});
