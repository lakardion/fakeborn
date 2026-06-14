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
 * v1 tracer: only the `string` node exists. Later slices widen this union with
 * number, boolean, date, object, array, tuple, union, optional, nullable, etc.
 */
export type IRNode = { kind: "string" };

/** The discriminant of every IR node. */
export type IRKind = IRNode["kind"];
