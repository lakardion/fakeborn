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

/** The default kind → faker generator table used by `fake()`. */
export const defaultFakerMap: FakerMap = {
  string: () => faker.string.sample(),
  number: () => faker.number.float(),
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
  // A small non-empty array when the length is unconstrained (bounds land in a
  // later slice).
  array: (node, ctx) => {
    const length = faker.number.int({ min: 1, max: 3 });
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
