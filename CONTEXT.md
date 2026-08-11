# fakeborn — Context

fakeborn generates fake data born from a validation schema: pass a validator (Zod,
Valibot) to `fake()` and get a value that satisfies it.

## Glossary

- **The contract** — whatever `fake(schema)` returns parses cleanly through that same
  schema's own validator. fakeborn's identity; admitted constructs must never break it.
- **Runtime-transparent wrapper** — a schema construct that wraps an inner schema without
  constraining its runtime values (`.readonly()`, `.brand()`, `.default()`, `.catch()`).
  fakeborn unwraps it and fakes the inner schema. See
  [ADR-0001](docs/adr/0001-construct-stance-wrappers-vs-effects.md).
- **Output typing** — `fake()`'s return type is the schema's *output* type, read
  structurally from the phantom `_output` (Zod) / `~types.output` (Valibot); never
  `_input`. Constructs whose only fakeable value is the input (e.g. `.transform()`) are
  therefore unsupported.

## Decisions

See `docs/adr/`.
