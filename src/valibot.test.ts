import { describe, expect, test } from "bun:test";
import { faker } from "@faker-js/faker";
import * as v from "valibot";
import { fake } from "./index";

// The project's core contract, Valibot edition: a generated fake parses cleanly
// through its source schema via `v.parse`. Each construct is exercised over many
// re-seeded iterations to surface any randomness-induced violation.
const roundTrip = (schema: v.GenericSchema, iterations = 500) => {
  for (let i = 0; i < iterations; i++) {
    faker.seed(i);
    expect(() => v.parse(schema, fake(schema))).not.toThrow();
  }
};

describe("fake() — Valibot detection", () => {
  test("returns a string for v.string()", () => {
    const value = fake(v.string());
    expect(typeof value).toBe("string");
  });

  test("round-trip: v.parse(v.string(), fake(v.string())) never throws over many re-seeded iterations", () => {
    const schema = v.string();
    for (let i = 0; i < 1000; i++) {
      faker.seed(i);
      const value = fake(schema);
      expect(() => v.parse(schema, value)).not.toThrow();
    }
  });

  test("throws a descriptive error for an unsupported Valibot construct", () => {
    // v.record(...) is out of v1 scope, so it stays a valid "unsupported" probe
    // even as later slices grow the supported set.
    expect(() => fake(v.record(v.string(), v.number()))).toThrow(/unsupported Valibot schema/i);
  });
});

describe("fake() — Valibot scalar primitives", () => {
  test("v.number() → a number that parses", () => {
    const schema = v.number();
    roundTrip(schema);
    faker.seed(0);
    expect(typeof fake(schema)).toBe("number");
  });

  test("v.boolean() → a boolean that parses", () => {
    const schema = v.boolean();
    roundTrip(schema);
    faker.seed(0);
    expect(typeof fake(schema)).toBe("boolean");
  });

  test("v.date() → a Date that parses", () => {
    const schema = v.date();
    roundTrip(schema);
    faker.seed(0);
    expect(fake(schema)).toBeInstanceOf(Date);
  });

  test("v.bigint() → a bigint that parses", () => {
    const schema = v.bigint();
    roundTrip(schema);
    faker.seed(0);
    expect(typeof fake(schema)).toBe("bigint");
  });

  test("v.literal(...) → exactly that literal, and parses", () => {
    const strLit = v.literal("the-literal");
    roundTrip(strLit);
    faker.seed(0);
    expect(fake(strLit)).toBe("the-literal");

    const numLit = v.literal(42);
    roundTrip(numLit);
    faker.seed(0);
    expect(fake(numLit)).toBe(42);
  });

  test("v.picklist([...]) → one of the declared members, and parses", () => {
    const members = ["red", "green", "blue"] as const;
    const schema = v.picklist(members);
    roundTrip(schema);
    faker.seed(0);
    expect(members).toContain(fake(schema));
  });

  test("v.enum({...}) → one of the declared members, and parses", () => {
    const Color = { Red: "red", Green: "green", Blue: "blue" } as const;
    const schema = v.enum(Color);
    roundTrip(schema);
    faker.seed(0);
    expect(Object.values(Color)).toContain(fake(schema));
  });
});

describe("fake() — Valibot composite types", () => {
  test("object: every required property is populated, and parses", () => {
    const schema = v.object({ name: v.string(), age: v.number(), active: v.boolean() });
    roundTrip(schema);
    faker.seed(0);
    const value = fake(schema);
    expect(value).toHaveProperty("name");
    expect(value).toHaveProperty("age");
    expect(value).toHaveProperty("active");
  });

  test("nested objects are faked recursively to depth, and parse", () => {
    const schema = v.object({
      id: v.string(),
      profile: v.object({
        email: v.string(),
        meta: v.object({ score: v.number(), label: v.literal("inner") }),
      }),
    });
    roundTrip(schema);
    faker.seed(0);
    const value = fake(schema);
    expect(value.profile.meta.label).toBe("inner");
  });

  test("array: a non-empty array of valid elements that parses", () => {
    const schema = v.array(v.number());
    roundTrip(schema);
    faker.seed(0);
    const value = fake(schema);
    expect(Array.isArray(value)).toBe(true);
    expect(value.length).toBeGreaterThan(0);
  });

  test("tuple: each position satisfies its element type, and parses", () => {
    const schema = v.tuple([v.string(), v.number(), v.boolean()]);
    roundTrip(schema);
    faker.seed(0);
    const value = fake(schema);
    expect(typeof value[0]).toBe("string");
    expect(typeof value[1]).toBe("number");
    expect(typeof value[2]).toBe("boolean");
  });

  test("union: the result matches one of the options, and parses", () => {
    const schema = v.union([v.string(), v.number()]);
    roundTrip(schema);
    faker.seed(0);
    expect(["string", "number"]).toContain(typeof fake(schema));
  });

  test("optional: present with a valid value by default, and parses", () => {
    const schema = v.object({ maybe: v.optional(v.string()) });
    roundTrip(schema);
    faker.seed(0);
    const value = fake(schema);
    // "full" fake: the optional field is populated, not omitted.
    expect(value.maybe).toBeDefined();
    expect(typeof value.maybe).toBe("string");
  });

  test("nullable: a valid non-null value by default, and parses", () => {
    const schema = v.object({ note: v.nullable(v.string()) });
    roundTrip(schema);
    faker.seed(0);
    const value = fake(schema);
    expect(value.note).not.toBeNull();
    expect(typeof value.note).toBe("string");
  });

  test("a realistic composite schema round-trips", () => {
    const schema = v.object({
      id: v.string(),
      tags: v.array(v.string()),
      role: v.picklist(["admin", "user", "guest"]),
      nickname: v.optional(v.string()),
      deletedAt: v.nullable(v.date()),
      coords: v.tuple([v.number(), v.number()]),
      kind: v.union([v.literal("a"), v.literal("b")]),
    });
    roundTrip(schema);
  });
});

describe("fake() — Valibot constraints & formats", () => {
  test("bounded strings stay within min/max length and parse", () => {
    roundTrip(v.pipe(v.string(), v.minLength(5), v.maxLength(8)));
    roundTrip(v.pipe(v.string(), v.minLength(20)));
    roundTrip(v.pipe(v.string(), v.maxLength(3)));
  });

  test("exact-length strings produce that length and parse", () => {
    const schema = v.pipe(v.string(), v.length(12));
    roundTrip(schema);
    faker.seed(0);
    expect(fake(schema)).toHaveLength(12);
  });

  test("string formats (email/url/uuid/iso-timestamp) produce parsing values", () => {
    roundTrip(v.pipe(v.string(), v.email()));
    roundTrip(v.pipe(v.string(), v.url()));
    roundTrip(v.pipe(v.string(), v.uuid()));
    roundTrip(v.pipe(v.string(), v.isoTimestamp()));
  });

  test("v.integer() produces an integer; plain numbers may be floats", () => {
    const intSchema = v.pipe(v.number(), v.integer());
    roundTrip(intSchema);
    faker.seed(0);
    expect(Number.isInteger(fake(intSchema))).toBe(true);
  });

  test("bounded numbers (min/max, inclusive) stay within bounds and parse", () => {
    roundTrip(v.pipe(v.number(), v.minValue(3), v.maxValue(9)));
    roundTrip(v.pipe(v.number(), v.integer(), v.minValue(-5), v.maxValue(5)));
    roundTrip(v.pipe(v.number(), v.minValue(100))); // only a lower bound
    roundTrip(v.pipe(v.number(), v.maxValue(-100))); // only an upper bound
  });

  test("bounded arrays produce a valid-length array and parse", () => {
    roundTrip(v.pipe(v.array(v.number()), v.minLength(2), v.maxLength(4)));
    roundTrip(v.pipe(v.array(v.string()), v.length(3)));
    roundTrip(v.pipe(v.array(v.boolean()), v.minLength(5)));
  });

  test("constraints survive nesting inside an object", () => {
    const schema = v.object({
      email: v.pipe(v.string(), v.email()),
      score: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100)),
      tags: v.pipe(v.array(v.pipe(v.string(), v.minLength(2))), v.minLength(1), v.maxLength(3)),
      createdAt: v.pipe(v.string(), v.isoTimestamp()),
    });
    roundTrip(schema);
  });
});

describe("fake() — Valibot options", () => {
  test("count returns an array of N independently-satisfying fakes", () => {
    const schema = v.object({ id: v.string(), n: v.number() });
    for (let i = 0; i < 200; i++) {
      faker.seed(i);
      const values = fake(schema, { count: 5 });
      expect(values).toHaveLength(5);
      for (const value of values) {
        expect(() => v.parse(schema, value)).not.toThrow();
      }
    }
  });

  test("seed option produces deterministic output across calls", () => {
    const schema = v.object({ name: v.string(), age: v.number() });
    expect(fake(schema, { seed: 123 })).toEqual(fake(schema, { seed: 123 }));
  });

  test("adapter: 'valibot' forces the Valibot adapter, bypassing detection", () => {
    const schema = v.object({ id: v.string(), score: v.pipe(v.number(), v.integer()) });
    roundTrip(schema);
    faker.seed(0);
    expect(() => v.parse(schema, fake(schema, { adapter: "valibot" }))).not.toThrow();
  });
});
