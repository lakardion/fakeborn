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
};
