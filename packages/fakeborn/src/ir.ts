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
 * Covered: the scalars (string, number, boolean, date, bigint, literal, enum)
 * and the composites (object, array, tuple, union, optional, nullable).
 *
 * Constraints travel on the nodes that carry them — string length/format,
 * number int/bounds, array length — so the generator honors them with zero
 * library knowledge. Adapters normalize a library's constraints into these
 * fields; bounds are stored already-inclusive (the generator never reasons
 * about exclusivity).
 */
export type IRNode =
  | {
      kind: "string";
      format?: "email" | "url" | "uuid" | "date-iso";
      minLength?: number;
      maxLength?: number;
      length?: number;
    }
  | { kind: "number"; int?: boolean; min?: number; max?: number }
  | { kind: "boolean" }
  | { kind: "date" }
  | { kind: "bigint" }
  | { kind: "literal"; value: unknown }
  | { kind: "enum"; values: readonly unknown[] }
  | { kind: "object"; entries: Record<string, IRNode> }
  | { kind: "array"; element: IRNode; minLength?: number; maxLength?: number }
  | { kind: "tuple"; elements: IRNode[] }
  | { kind: "union"; options: IRNode[] }
  | { kind: "optional"; inner: IRNode }
  | { kind: "nullable"; inner: IRNode };

/** The discriminant of every IR node. */
export type IRKind = IRNode["kind"];
