import { faker } from "@faker-js/faker";
import type { IRKind, IRNode } from "./ir";

/**
 * Recursion handle handed to every generator entry. Composite nodes (object,
 * array, …) use `generate` to fake their children without knowing how the
 * generator is wired. Unused by leaf nodes like `string`, but part of the seam
 * from the start so later slices don't change the map signature.
 */
export type GeneratorContext = {
  generate: (node: IRNode) => unknown;
};

/**
 * A kind → faker generator table. This is the single replaceable unit a future
 * "custom faker map" PRD swaps out: the generator depends only on this shape,
 * never on faker directly. Entries are optional so a partial map can override
 * just a few kinds and fall back to the default for the rest.
 */
export type FakerMap = {
  [K in IRKind]?: (node: Extract<IRNode, { kind: K }>, ctx: GeneratorContext) => unknown;
};

/**
 * Seed faker for reproducible output. Lives here so faker-map stays the single
 * module that imports faker: seeding is a faker concern, even though `fake()`
 * owns *when* it runs (once, before generating, when a `seed` option is given).
 */
export function seedFaker(seed: number): void {
  faker.seed(seed);
}

/** Constrain a value to an inclusive `[min, max]` window. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** The default kind → faker generator table used by `fake()`. */
export const defaultFakerMap: FakerMap = {
  string: (node) => {
    // A declared format pins the generator; length is honored for plain strings.
    switch (node.format) {
      case "email":
        return faker.internet.email();
      case "url":
        return faker.internet.url();
      case "uuid":
        return faker.string.uuid();
      case "date-iso":
        return faker.date.anytime().toISOString();
    }
    const { length, minLength, maxLength } = node;
    if (length === undefined && minLength === undefined && maxLength === undefined) {
      return faker.string.sample();
    }
    const size =
      length ?? faker.number.int({ min: minLength ?? 0, max: maxLength ?? (minLength ?? 0) + 10 });
    return faker.string.alphanumeric(size);
  },
  number: (node) => {
    if (node.int) {
      const min =
        node.min !== undefined ? Math.ceil(node.min) : node.max !== undefined ? node.max - 1000 : 0;
      const max = node.max !== undefined ? Math.floor(node.max) : min + 1000;
      return clamp(faker.number.int({ min, max: Math.max(min, max) }), min, Math.max(min, max));
    }
    if (node.min === undefined && node.max === undefined) {
      return faker.number.float();
    }
    // One side is guaranteed defined here; the unreachable fallbacks keep the
    // types honest without a cast.
    const min = node.min ?? (node.max !== undefined ? node.max - 1000 : 0);
    const max = Math.max(min, node.max ?? min + 1000);
    return clamp(faker.number.float({ min, max }), min, max);
  },
  boolean: () => faker.datatype.boolean(),
  date: () => faker.date.anytime(),
  bigint: () => faker.number.bigInt(),
  // A literal is its one allowed value; an enum is one of its allowed members.
  literal: (node) => node.value,
  enum: (node) => faker.helpers.arrayElement(node.values),
  // Composites recurse through `ctx.generate`, so they never touch faker
  // directly for their children and nest to arbitrary depth.
  object: (node, ctx) => {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(node.entries)) {
      result[key] = ctx.generate(child);
    }
    return result;
  },
  // Honor declared length bounds; otherwise a small non-empty array. When only
  // a min is given, stretch the max to cover it so the window is never empty.
  array: (node, ctx) => {
    const min = node.minLength ?? 1;
    const max = node.maxLength ?? Math.max(min, 3);
    const length = faker.number.int({ min, max });
    return Array.from({ length }, () => ctx.generate(node.element));
  },
  tuple: (node, ctx) => node.elements.map((element) => ctx.generate(element)),
  // Pick one option and fake it.
  union: (node, ctx) => ctx.generate(faker.helpers.arrayElement(node.options)),
  // Present-by-default: an optional field gets a valid value, a nullable field
  // a valid non-null value, so the fake is "full" and obviously satisfies.
  optional: (node, ctx) => ctx.generate(node.inner),
  nullable: (node, ctx) => ctx.generate(node.inner),
};
