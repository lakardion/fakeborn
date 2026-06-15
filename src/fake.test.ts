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

describe("fake() — Zod composite types", () => {
  test("object: every required property is populated, and parses", () => {
    const schema = z.object({ name: z.string(), age: z.number(), active: z.boolean() });
    roundTrip(schema);
    faker.seed(0);
    const value = fake(schema);
    expect(value).toHaveProperty("name");
    expect(value).toHaveProperty("age");
    expect(value).toHaveProperty("active");
  });

  test("nested objects are faked recursively to depth, and parse", () => {
    const schema = z.object({
      id: z.string(),
      profile: z.object({
        email: z.string(),
        meta: z.object({ score: z.number(), label: z.literal("inner") }),
      }),
    });
    roundTrip(schema);
    faker.seed(0);
    const value = fake(schema);
    expect(value.profile.meta.label).toBe("inner");
  });

  test("array: a non-empty array of valid elements that parses", () => {
    const schema = z.array(z.number());
    roundTrip(schema);
    faker.seed(0);
    const value = fake(schema);
    expect(Array.isArray(value)).toBe(true);
    expect(value.length).toBeGreaterThan(0);
  });

  test("tuple: each position satisfies its element type, and parses", () => {
    const schema = z.tuple([z.string(), z.number(), z.boolean()]);
    roundTrip(schema);
    faker.seed(0);
    const value = fake(schema);
    expect(typeof value[0]).toBe("string");
    expect(typeof value[1]).toBe("number");
    expect(typeof value[2]).toBe("boolean");
  });

  test("union: the result matches one of the options, and parses", () => {
    const schema = z.union([z.string(), z.number()]);
    roundTrip(schema);
    faker.seed(0);
    expect(["string", "number"]).toContain(typeof fake(schema));
  });

  test("optional: present with a valid value by default, and parses", () => {
    const schema = z.object({ maybe: z.string().optional() });
    roundTrip(schema);
    faker.seed(0);
    const value = fake(schema);
    // "full" fake: the optional field is populated, not omitted.
    expect(value.maybe).toBeDefined();
    expect(typeof value.maybe).toBe("string");
  });

  test("nullable: a valid non-null value by default, and parses", () => {
    const schema = z.object({ note: z.string().nullable() });
    roundTrip(schema);
    faker.seed(0);
    const value = fake(schema);
    expect(value.note).not.toBeNull();
    expect(typeof value.note).toBe("string");
  });

  test("a realistic composite schema round-trips", () => {
    const schema = z.object({
      id: z.string(),
      tags: z.array(z.string()),
      role: z.enum(["admin", "user", "guest"]),
      nickname: z.string().optional(),
      deletedAt: z.date().nullable(),
      coords: z.tuple([z.number(), z.number()]),
      kind: z.union([z.literal("a"), z.literal("b")]),
    });
    roundTrip(schema);
  });
});

describe("fake() — Zod constraints & formats", () => {
  test("bounded strings stay within min/max length and parse", () => {
    roundTrip(z.string().min(5).max(8));
    roundTrip(z.string().min(20));
    roundTrip(z.string().max(3));
  });

  test("exact-length strings produce that length and parse", () => {
    const schema = z.string().length(12);
    roundTrip(schema);
    faker.seed(0);
    expect(fake(schema)).toHaveLength(12);
  });

  test("string formats (email/url/uuid/iso-date) produce parsing values", () => {
    roundTrip(z.string().email());
    roundTrip(z.string().url());
    roundTrip(z.string().uuid());
    roundTrip(z.string().datetime());
  });

  test("z.number().int() produces an integer; plain numbers may be floats", () => {
    const intSchema = z.number().int();
    roundTrip(intSchema);
    faker.seed(0);
    expect(Number.isInteger(fake(intSchema))).toBe(true);
  });

  test("bounded numbers (min/max, inclusive) stay within bounds and parse", () => {
    roundTrip(z.number().min(3).max(9));
    roundTrip(z.number().int().min(-5).max(5));
    roundTrip(z.number().min(100)); // only a lower bound
    roundTrip(z.number().max(-100)); // only an upper bound
  });

  test("positive/negative/nonnegative shorthands stay within bounds and parse", () => {
    roundTrip(z.number().positive());
    roundTrip(z.number().negative());
    roundTrip(z.number().nonnegative());
    roundTrip(z.number().int().positive());
  });

  test("bounded arrays produce a valid-length array and parse", () => {
    roundTrip(z.array(z.number()).min(2).max(4));
    roundTrip(z.array(z.string()).length(3));
    roundTrip(z.array(z.boolean()).min(5));
  });

  test("constraints survive nesting inside an object", () => {
    const schema = z.object({
      email: z.string().email(),
      score: z.number().int().min(0).max(100),
      tags: z.array(z.string().min(2)).min(1).max(3),
      createdAt: z.string().datetime(),
    });
    roundTrip(schema);
  });
});
