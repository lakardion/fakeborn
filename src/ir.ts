/**
 * Library-agnostic intermediate representation (IR).
 *
 * Adapters normalize a validator schema into this node tree, and the generator
 * walks the tree with a faker map. The IR is the central architectural seam:
 * the only place that knows a specific validator is the adapter that produces
 * IR, and the only place that knows faker is the map that consumes it. New
 * constructs are added as new union members here — never by teaching the
 * generator about a particular validator.
 *
 * Scalars covered so far: string, number, boolean, date, bigint, literal, enum.
 * Later slices widen this union with the composites (object, array, tuple,
 * union, optional, nullable) and add constraint fields (lengths, bounds,
 * formats) to the scalar nodes that carry them.
 */
export type IRNode =
  | { kind: "string" }
  | { kind: "number" }
  | { kind: "boolean" }
  | { kind: "date" }
  | { kind: "bigint" }
  | { kind: "literal"; value: unknown }
  | { kind: "enum"; values: readonly unknown[] };

/** The discriminant of every IR node. */
export type IRKind = IRNode["kind"];
