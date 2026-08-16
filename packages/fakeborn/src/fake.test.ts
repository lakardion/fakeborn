import { describe, expect, test } from "bun:test";
import { faker } from "@faker-js/faker";
import { z } from "zod";
import { fake, UnsupportedSchemaError } from "./index";

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

  test("unsupported Zod construct throws a named UnsupportedSchemaError naming the construct", () => {
    try {
      fake(z.symbol());
      expect.unreachable("fake(z.symbol()) should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedSchemaError);
      expect((error as Error).message).toMatch(/ZodSymbol/);
    }
  });

  test("throws a descriptive error when no validator is detected", () => {
    expect(() => fake({} as never)).toThrow(/could not detect/i);
  });

  test("undetectable schema throws a named UnsupportedSchemaError", () => {
    expect(() => fake({} as never)).toThrow(UnsupportedSchemaError);
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

describe("fake() — Zod runtime-transparent wrappers", () => {
  // ADR-0001: `.readonly()` constrains nothing at parse time, so it is
  // unwrapped and the inner schema is faked directly.
  test("readonly: a plain readonly scalar fakes its inner type and parses", () => {
    const schema = z.string().readonly();
    roundTrip(schema);
    faker.seed(0);
    expect(typeof fake(schema)).toBe("string");
  });

  test("readonly: inner constraints survive the unwrap (uuid stays a uuid)", () => {
    const schema = z.string().uuid().readonly();
    roundTrip(schema);
    // Also round-trip through the unwrapped constraint schema, proving the
    // fake honors the inner checks, not just the readonly shell.
    roundTrip(z.string().uuid());
  });

  test("readonly: fields inside an object — the tn-models-fp entityZodShape case", () => {
    // The playground's canonical shape (src/api/tests/mocks.ts): a readonly
    // derived field alongside plain and uuid fields.
    const schema = z.object({
      firstName: z.string(),
      lastName: z.string(),
      age: z.number(),
      id: z.string().uuid(),
      fullName: z.string().readonly(),
    });
    roundTrip(schema);
  });

  test("readonly: chained with nullable/optional, in any order, round-trips", () => {
    roundTrip(z.string().nullable().optional().readonly());
    roundTrip(z.string().readonly().optional());
  });

  test("readonly: wrapping a whole composite fakes the composite", () => {
    const schema = z.object({ id: z.string().uuid(), tags: z.array(z.string()) }).readonly();
    roundTrip(schema);
  });

  // ADR-0001: `.brand()` is type-level fiction — nothing changes at parse
  // time, so it is unwrapped and the inner schema is faked directly.
  test("brand: a branded scalar fakes its inner type and parses", () => {
    const schema = z.string().brand<"Id">();
    roundTrip(schema);
    faker.seed(0);
    expect(typeof fake(schema)).toBe("string");
  });

  test("brand: inner constraints survive the unwrap (uuid stays a uuid)", () => {
    roundTrip(z.string().uuid().brand<"Id">());
  });

  test("brand: branding a whole composite fakes the composite", () => {
    const schema = z.object({ id: z.string().uuid() }).brand<"User">();
    roundTrip(schema);
  });

  // ADR-0001: `.default()` only applies when the key is absent, and fakes are
  // always present, so the fake is the inner schema's fake — never the
  // default, never undefined.
  test("default: fakes the inner value — never the default, never undefined", () => {
    const schema = z.string().default("the-default");
    roundTrip(schema);
    for (let i = 0; i < 100; i++) {
      faker.seed(i);
      const value = fake(schema);
      expect(value).toBeDefined();
      expect(value).not.toBe("the-default");
    }
  });

  test("default: inner constraints survive the unwrap (int stays an int)", () => {
    const schema = z.number().int().default(0);
    roundTrip(schema);
    faker.seed(0);
    const value = fake(schema);
    expect(Number.isInteger(value)).toBe(true);
    expect(value).not.toBe(0);
  });

  // ADR-0001: `.catch()` only engages on parse failure; a faked inner value
  // parses, so the catch value never surfaces.
  test("catch: fakes the inner value and parses", () => {
    const schema = z.number().catch(0);
    roundTrip(schema);
    faker.seed(0);
    expect(typeof fake(schema)).toBe("number");
  });

  test("wrappers: branded, defaulted, and caught fields inside an object round-trip", () => {
    const schema = z.object({
      id: z.string().uuid().brand<"Id">(),
      role: z.string().default("user"),
      score: z.number().int().catch(0),
      name: z.string(),
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

describe("fake() — options", () => {
  test("count returns an array of N independently-satisfying fakes", () => {
    const schema = z.object({ id: z.string(), n: z.number() });
    for (let i = 0; i < 200; i++) {
      faker.seed(i);
      const values = fake(schema, { count: 5 });
      expect(Array.isArray(values)).toBe(true);
      expect(values).toHaveLength(5);
      for (const value of values) {
        expect(() => schema.parse(value)).not.toThrow();
      }
    }
  });

  test("count fakes are independently generated, not N copies of one", () => {
    faker.seed(0);
    // Ten random strings being identical is effectively impossible, so a set
    // with >1 member proves each element was generated fresh.
    const values = fake(z.string(), { count: 10 });
    expect(new Set(values).size).toBeGreaterThan(1);
  });

  test("no count returns a single fake, not an array", () => {
    faker.seed(0);
    const value = fake(z.string());
    expect(Array.isArray(value)).toBe(false);
    expect(typeof value).toBe("string");
  });

  test("count: 0 returns an empty array", () => {
    faker.seed(0);
    expect(fake(z.string(), { count: 0 })).toEqual([]);
  });

  test("seed option produces deterministic output across calls", () => {
    const schema = z.object({ name: z.string(), age: z.number(), tags: z.array(z.string()) });
    const a = fake(schema, { seed: 123 });
    const b = fake(schema, { seed: 123 });
    expect(a).toEqual(b);
  });

  test("different seeds produce different output", () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    const a = fake(schema, { seed: 1 });
    const b = fake(schema, { seed: 2 });
    expect(a).not.toEqual(b);
  });

  test("seed + count is reproducible yet varies element to element", () => {
    const schema = z.number();
    const a = fake(schema, { seed: 7, count: 4 });
    const b = fake(schema, { seed: 7, count: 4 });
    expect(a).toEqual(b); // reproducible
    expect(new Set(a).size).toBeGreaterThan(1); // not four copies of one value
  });

  test("adapter: 'zod' forces the Zod adapter, bypassing detection", () => {
    const schema = z.object({ id: z.string(), score: z.number().int() });
    roundTrip(schema as z.ZodTypeAny);
    faker.seed(0);
    const value = fake(schema, { adapter: "zod" });
    expect(() => schema.parse(value)).not.toThrow();
  });
});

describe("fake() — Zod secondary constructs (ADR-0001)", () => {
  // z.nativeEnum(): fake = a random pick from the enum's visible values (#53).
  test("nativeEnum: string enum fakes a declared member and parses", () => {
    enum Color {
      Red = "RED",
      Green = "GREEN",
      Blue = "BLUE",
    }
    const schema = z.nativeEnum(Color);
    roundTrip(schema);
    faker.seed(0);
    expect(Object.values(Color)).toContain(fake(schema));
  });

  test("nativeEnum: numeric enum fakes only the visible values, never reverse mappings", () => {
    // TS compiles this to { 0: "Low", 1: "Medium", 2: "High", Low: 0, … } —
    // the string keys are reverse mappings, not valid enum members.
    enum Level {
      Low,
      Medium,
      High,
    }
    const schema = z.nativeEnum(Level);
    roundTrip(schema);
    for (let i = 0; i < 200; i++) {
      faker.seed(i);
      expect([Level.Low, Level.Medium, Level.High]).toContain(fake(schema));
    }
  });

  test("nativeEnum: nested inside an object round-trips", () => {
    enum Status {
      Active = "ACTIVE",
      Inactive = "INACTIVE",
    }
    const schema = z.object({ status: z.nativeEnum(Status), count: z.number().int() });
    roundTrip(schema);
  });

  // z.any(): fake = an arbitrary JSON-safe value, never undefined (#54).
  test("any: round-trips, is always defined, and JSON.stringify never throws", () => {
    const schema = z.any();
    roundTrip(schema);
    for (let i = 0; i < 500; i++) {
      faker.seed(i);
      const value = fake(schema);
      expect(value).toBeDefined();
      expect(() => JSON.stringify(value)).not.toThrow();
    }
  });

  test("any: covers string/number/boolean/object shapes across seeds", () => {
    const schema = z.any();
    const types = new Set<string>();
    for (let i = 0; i < 500; i++) {
      faker.seed(i);
      const value = fake(schema);
      types.add(Array.isArray(value) ? "array" : typeof value);
    }
    expect(types).toContain("string");
    expect(types).toContain("number");
    expect(types).toContain("boolean");
    expect(types).toContain("object");
  });

  test("any: z.unknown() shares the same treatment", () => {
    const schema = z.unknown();
    roundTrip(schema);
    faker.seed(0);
    expect(fake(schema)).toBeDefined();
  });

  test("any: nested inside an object round-trips", () => {
    const schema = z.object({ id: z.string().uuid(), payload: z.any() });
    roundTrip(schema);
    faker.seed(0);
    const value = fake(schema);
    expect(value.payload).toBeDefined();
  });

  // z.void() / z.undefined(): fake = undefined (#55).
  test("void/undefined: fake is undefined and parses", () => {
    const voidSchema = z.void();
    const undefSchema = z.undefined();
    roundTrip(voidSchema);
    roundTrip(undefSchema);
    expect(fake(voidSchema)).toBeUndefined();
    expect(fake(undefSchema)).toBeUndefined();
  });

  test("void/undefined: as object fields round-trip", () => {
    const schema = z.object({ id: z.string(), nothing: z.undefined(), done: z.void() });
    roundTrip(schema);
    faker.seed(0);
    const value = fake(schema);
    expect(typeof value.id).toBe("string");
    expect(value.nothing).toBeUndefined();
    expect(value.done).toBeUndefined();
  });
});
