# ADR-0001: Construct stance — runtime-transparent wrappers are unwrapped; effects stay unsupported

## Status

Accepted (wayfinder ticket [#44](https://github.com/lakardion/fakeborn/issues/44), map [#41](https://github.com/lakardion/fakeborn/issues/41))

## Context

fakeborn's contract: **whatever `fake(schema)` returns parses cleanly through that same
schema's own validator.** Its return type is read structurally from the schema's phantom
`_output` (see `packages/fakeborn/src/fake.ts`, `Infer`), i.e. `fake()` promises the
*output* type. fakeborn generates runtime values; a complete type-level mapping of the
validation libraries is not a goal.

The tn-models-fp playground inventory (issue
[#42](https://github.com/lakardion/fakeborn/issues/42), branch
`research/tn-models-fp-zod-inventory`) surfaced constructs fakeborn v1 rejects with
`UnsupportedSchemaError`. Each needed a stance: coverage or documented limitation.

## Decision

**1. Runtime-transparent wrappers are unwrapped.** `.readonly()`, `.brand()`,
`.default()`, `.catch()` wrap an inner schema without constraining its runtime values: a
value faked for the inner schema parses cleanly through the wrapper, and satisfies the
wrapper's `_output` type. fakeborn therefore unwraps them and fakes the inner schema; the
wrapper adds nothing it must honor. All four are **coverage**. The same rule applies to
Valibot's analogues (`v.readonly()`, `v.brand()`), ticketed separately.

**2. ZodEffects (`.refine()`, `.transform()`, `.preprocess()`) remain a documented
limitation.** Two reasons, either sufficient:

- **Opaque predicates**: a `.refine()` can reject an otherwise-valid inner fake, breaking
  the parses-cleanly contract invisibly.
- **Input/output typing conflict**: `.transform()` changes the runtime type, so the only
  fakeable value is the *input* — which does not satisfy `_output`. Admitting effects
  would force `fake()` to promise `_input` for some schemas and `_output` for others.

If a real use case arrives, prefer a separate input-faking API over loosening `fake()`'s
contract.

**3. Secondary constructs:**

| Construct | Stance | Note |
|---|---|---|
| `z.nativeEnum()` | Coverage | Values structurally visible (`_def.values`); fake = random pick, as with `z.enum()`. |
| `z.any()` | Coverage | Fake = arbitrary JSON-safe faker value (string/number/boolean/simple object), not `undefined` — more useful in mocks. |
| ZodIntersection (`.and()`) | Documented limitation | Can't generally synthesize a value satisfying both sides. Object∩object merging is a possible future carve-out. |
| `ZodVoid` / `ZodUndefined` | Coverage (trivial) | Fake = `undefined`. Near-zero value, but one line and keeps the contract total. |

## Consequences

- Coverage issues get filed per the map's disposition rule (ticket
  [#47](https://github.com/lakardion/fakeborn/issues/47)): ZodReadonly (first — it blocks
  the playground's canonical entity shape), ZodBranded, ZodDefault, ZodCatch,
  ZodNativeEnum, ZodAny, ZodVoid/ZodUndefined.
- README Limitations gains explicit entries for ZodEffects and ZodIntersection.
- `fake()`'s output-type promise (`Infer` reads `_output`) is preserved unchanged — every
  admitted construct produces values honest to it.
