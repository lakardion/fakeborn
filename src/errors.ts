/**
 * Thrown when `fake()` is handed a schema (or schema construct) that fakeborn
 * cannot satisfy — an unrecognized validator, or a construct outside the v1
 * supported set. The message always names what is unsupported, so callers get
 * a descriptive failure instead of a silently invalid fake.
 */
export class UnsupportedSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedSchemaError";
  }
}
