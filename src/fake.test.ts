import { describe, expect, test } from "bun:test";
import { faker } from "@faker-js/faker";
import { z } from "zod";
import { fake } from "./index";

// The project's core contract: a generated fake parses cleanly through its
// source schema. Each construct is exercised over many re-seeded iterations to
// surface any randomness-induced violation.
const roundTrip = (schema: z.ZodTypeAny, iterations = 500) => {
  for (let i = 0; i < iterations; i++) {
    faker.seed(i);
    expect(() => schema.parse(fake(schema))).not.toThrow();
  }
};

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
    // z.symbol() is out of v1 scope and stays that way, so it remains a valid
    // "unsupported" probe even as later slices grow the supported set.
    expect(() => fake(z.symbol())).toThrow(/unsupported Zod schema/i);
  });

  test("throws a descriptive error when no validator is detected", () => {
    expect(() => fake({} as never)).toThrow(/could not detect/i);
  });
});

describe("fake() — Zod scalar primitives", () => {
  test("z.number() → a number that parses", () => {
    const schema = z.number();
    roundTrip(schema);
    faker.seed(0);
    expect(typeof fake(schema)).toBe("number");
  });

  test("z.boolean() → a boolean that parses", () => {
    const schema = z.boolean();
    roundTrip(schema);
    faker.seed(0);
    expect(typeof fake(schema)).toBe("boolean");
  });

  test("z.date() → a Date that parses", () => {
    const schema = z.date();
    roundTrip(schema);
    faker.seed(0);
    expect(fake(schema)).toBeInstanceOf(Date);
  });

  test("z.bigint() → a bigint that parses", () => {
    const schema = z.bigint();
    roundTrip(schema);
    faker.seed(0);
    expect(typeof fake(schema)).toBe("bigint");
  });

  test("z.literal(...) → exactly that literal, and parses", () => {
    const strLit = z.literal("the-literal");
    roundTrip(strLit);
    faker.seed(0);
    expect(fake(strLit)).toBe("the-literal");

    // Non-string literals reproduce exactly too.
    const numLit = z.literal(42);
    roundTrip(numLit);
    faker.seed(0);
    expect(fake(numLit)).toBe(42);
  });

  test("z.enum([...]) → one of the declared members, and parses", () => {
    const members = ["red", "green", "blue"] as const;
    const schema = z.enum(members);
    roundTrip(schema);
    faker.seed(0);
    expect(members).toContain(fake(schema));
  });
});
