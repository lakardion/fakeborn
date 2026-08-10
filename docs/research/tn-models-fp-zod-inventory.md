# Inventory: Zod constructs and mock semantics in tn-models-fp

Research for fakeborn #42. Playground repo: `thinknimble/tn-models-fp` (local checkout
`/Users/lakardion/repos/tn-models-fp`, `@thinknimble/tn-models` v4.1.1, Zod ^3.23.8 — Zod v3,
matching fakeborn's target). fakeborn sources cited: `packages/fakeborn/src/adapters/zod.ts`
(`zodToIR`), `packages/fakeborn/src/ir.ts`, `packages/fakeborn/src/faker-map.ts`, and
`packages/fakeborn/README.md` (Limitations).

Note: the playground's `package.json` already declares
`"fakeborn": "link:/tmp/fakeborn-research-consumption/packages/fakeborn"`, but no `src/` file
imports fakeborn yet.

Line numbers marked `~` are approximate (long test files); small files are exact.

## (a) Zod constructs used

### Test fixtures and entity shapes

- `z.string()`, `z.number()` — `src/api/tests/mocks.ts:12-14`
- `z.string().uuid()` — `src/api/tests/mocks.ts:18`; also `src/collection-manager/collection-manager.test.ts` (~entityZodShape, lines 17-21)
- `z.string().readonly()` — `src/api/tests/mocks.ts:19` (`fullName`); reapplied via `.readonly()` at `mocks.ts:23-24` (`entityZodShapeWithReadonlyId`)
- `z.number()` as entity id — `src/api/tests/mocks.ts:28` (`entityZodShapeWithIdNumber`)
- `z.string().uuid().readonly()`, `z.string().datetime().optional().readonly()`, `z.string().email()`, `z.string().nullable().optional().readonly()` — `src/api/tests/create-api.test.ts:~196-206` ("It properly works with create model and readonly id")
- Nested `z.object(...)` and `z.array(z.object(...)).optional().nullable()` — `create-api.test.ts:~246-253` ("Works with nested fields")
- `z.any()` — `src/api/tests/create-custom-call.test.ts:16` (`outputShape { justAny: z.any() }`)
- `z.nativeEnum(...)` (ZodNativeEnum) — `create-custom-call.test.ts:~441,445` ("Allows shapes with native enums")
- `z.object({...}).array()` as output shape; `z.string().array()` outputs; `z.string().array()` filter (`testArrayFilter`) — `create-custom-call.test.ts` ("Allows an array output shape", standAlone describe, ~line 301)
- Nested `z.object` in input shapes — `src/api/tests/create-paginated-call.test.ts` (`dObj`, `urlParams`)
- Plain `z.string()` shapes only — `src/api/tests/create-ws-api.test.ts` (no faker fixtures; mock clients via `vi.fn()`)

### Library/runtime helpers (construct surface the library itself manipulates)

- `getPaginatedSnakeCasedZod` / `getPaginatedShape` / `getPaginatedZod` — `src/utils/pagination.ts:6-30`:
  `{ count: z.number(), next: z.string().nullable(), previous: z.string().nullable(), results: z.array(zodObjectToSnakeRecursive(z.object(shape).passthrough())) }`, outer `.passthrough()` at line 22.
- `zodObjectToSnakeRecursive` / `resolveRecursiveZod` — `src/utils/zod/zod.ts:52-144`. Handles, by reconstruction:
  - ZodReadonly → unwrap + `.readonly()` (zod.ts:41-43 type guard, 131-133 rebuild)
  - ZodBranded → unwrap + `.brand()` (zod.ts:38-40, 135-138)
  - ZodObject / ZodArray / ZodOptional / ZodNullable (zod.ts:60-71, 85-101)
  - ZodIntersection → `.and()` (zod.ts:103-106)
  - ZodUnion → `z.union(...)` (zod.ts:108-112)
  - ZodDefault → `.default(defaultValue())` (zod.ts:47-49, 140-144)
  - `.passthrough()` preserved on objects (zod.ts:128)
- `ZodVoid` / `ZodUndefined` as "no shape" sentinels — `isZodVoid` zod.ts:44-46 (used in
  `src/utils/api/api.ts` `createCustomServiceCallHandler`); `zodPrimitivesList` in
  `src/utils/zod/types.ts` (ZodString, ZodNumber, ZodDate, ZodBigInt, ZodBoolean, ZodUndefined, ZodVoid)
- `paginationFiltersZodShape` (`z.number()` page/pageSize) and `FiltersShape`
  (`ZodString | ZodNumber | ZodArray<ZodNumber> | ZodArray<ZodString> | ZodBoolean`) —
  `src/utils/filters.ts:6-9, 43-46`; `parseFilters` uses `z.object(shape).partial()` (filters.ts:26)
- `parseResponse` — `src/utils/response.ts:28-40`; objects are parsed with `.passthrough().safeParse`
- `updateBase` in `src/api/create-api.ts` builds `z.object(shapeWithoutReadonly).partial()`;
  `removeReadonlyFields` (`src/utils/api/api.ts`, end of file) strips `ZodReadonly` entries (with an
  unwrap allowlist, used for `id`).
- Type-level only: `GetInferredFromRaw(WithReadonly/WithStripReadonly)`, `StripZodReadonly`,
  `UnwrapZodReadonly` — `src/utils/zod/types.ts`.

### Not used anywhere (verified by reading all test files + library sources)

`z.literal`, `z.enum`, `z.tuple`, `z.record`, `z.map`, `z.set`, `z.lazy`, `.refine`/`.transform`
(ZodEffects), `.regex`, discriminated unions.

## (b) Mock factories and the semantics tests depend on

### `src/api/tests/mocks.ts` (the central fixture module)

- `createEntityMock` (mocks.ts:33-43): faker-built entity where **`fullName` is derived** —
  `` fullName: `${firstName} ${lastName}` `` (line 41). `mockEntity1`/`mockEntity2` (lines 44-45)
  are single instances reused everywhere.
- `listResponse` (mocks.ts:46-67): hand-built snake_cased paginated response whose `results`
  **reuse the exact ids/fields of `mockEntity1/2`** (`first_name: mockEntity1.firstName`, …),
  with fixed `count: 10`, `next: null`, `previous: null`.
- `mockEntity1Snaked`/`mockEntity2Snaked` (mocks.ts:68): destructured aliases into
  `listResponse.results` — same object identity.

Semantics a schema-driven fake would NOT reproduce:

1. **Cross-field derivation** — fakeborn's object generator creates each key independently
   (`packages/fakeborn/src/faker-map.ts`, `object` entry). `fullName` would be unrelated to
   `firstName`/`lastName`. No test asserts the formula directly, but whole-object equality
   assertions (e.g. create-api.test.ts "uses entity response if no create shape was passed",
   list test expecting `results: [mockEntity1, mockEntity2]`) require intra-fixture consistency.
2. **Fixture identity / shared ids** — retrieve tests build expected URLs from
   `mockEntity1Snaked.id`; update/upsert tests destructure `mockEntity1`. Two independent
   `fake()` calls produce different ids; tests must generate ONE entity and derive the
   snake/camel/list variants from it.
3. **Hand-mirrored snake case** — the snake fixture is the exact case-transform of the camel
   entity. fakeborn has no case conversion; the viable path is faking the snake-cased schema
   (`getPaginatedSnakeCasedZod(entityZodShape)`), which is blocked on `.readonly()` (gap #1).
4. **Hard-coded literals** — `createInput = { age: 19, lastName: "Doe", firstName: "Jane" }`
   (create-api.test.ts:~126-130) and its expected snake POST body. Fakes can't hit literals;
   assertions must be derived from the generated value.
5. **Server-added readonly fields** — create-api.test.ts:~193-240: request body excludes
   readonly fields; response adds `id`, `datetime_created`, `last_edited`, `token`. This models
   the input/output split tn-models implements via `removeReadonlyFields`.

### `src/collection-manager/collection-manager.test.ts`

- `createFakeUser` (~lines 31-36): factory emitting **already snake_cased** users
  (`first_name`, `last_name`).
- `mockedPaginatedEntitySnakeCased` (~lines 38-43): `count: 50`,
  `next: "https://mock.list/?page=2"`, 5 results; `mockedPaginatedEntity` derived via
  `objectToCamelCaseArr`. Tests depend on: non-null `next` (gates `addNextPage` in
  `src/collection-manager/collection-manager.ts`), `count` → `pagination.totalCount`, and the
  camel copy being the exact case-transform of the snake fixture.
- Feed list in `resetCollectionManager` (~lines 73-84) is a hand-built single-element
  camelCase entity array.

### Utils tests

- `src/utils/tests/response.test.ts` (only utils test in this checkout): inline fixture with an
  extra undeclared key (`number_of_children`) verifying passthrough/non-obfuscation. Not a
  faking concern (fakes never add undeclared keys).

## (c) Support matrix vs fakeborn

fakeborn `zodToIR` (`packages/fakeborn/src/adapters/zod.ts`) supports exactly: ZodString
(+email/url/uuid/datetime→date-iso, min/max/length), ZodNumber (+int, min/max normalized to
inclusive), ZodBoolean, ZodDate, ZodBigInt, ZodLiteral, ZodEnum, ZodObject, ZodArray (+length
bounds), ZodTuple, ZodUnion, ZodOptional, ZodNullable. Any other `_def.typeName` throws
`UnsupportedSchemaError` (end of the switch in adapters/zod.ts). See also `ir.ts` (13 IR kinds)
and README "Limitations".

| Construct | Used at | fakeborn |
|---|---|---|
| `z.string()` / `z.number()` | mocks.ts:12-14, 28 | ✅ |
| `.uuid()` / `.email()` / `.datetime()` | mocks.ts:18; create-api.test.ts:~197-202 | ✅ (format + date-iso) |
| `.nullable()` | pagination.ts:15-16,27-28 | ✅ |
| `.optional()` / `.partial()` | create-api.test.ts:~197; filters.ts:26 | ✅ |
| `z.object()` (nested) / `z.array()` | pagination.ts:12-29; nested tests | ✅ |
| `.passthrough()` | pagination.ts:12,22; response.ts:31 | ~ harmless: fakeborn ignores `unknownKeys`, generates only declared keys → still parses |
| **`.readonly()` (ZodReadonly)** | mocks.ts:19,23; create-api.test.ts:~196-206; custom-call + paginated-call readonly tests | ❌ throws |
| **`z.any()`** | create-custom-call.test.ts:16 | ❌ throws |
| **`z.nativeEnum()`** | create-custom-call.test.ts:~441,445 | ❌ throws (only ZodEnum) |
| **`z.intersection`/`.and()`** | zod/zod.ts:103-106 | ❌ throws |
| **`.brand()`** | zod/zod.ts:38-40,135-138 | ❌ throws |
| **`.default()`** | zod/zod.ts:47-49,140-144 | ❌ throws |
| **`ZodVoid`/`ZodUndefined`** | zod/zod.ts:44-46; types.ts primitives | ❌ throws |
| `z.union()` | zod/zod.ts:108-112 | ✅ |
| `z.date()` / `z.bigint()` | types.ts primitives only (unexercised) | ✅ |

## (d) Gap list

Blocking for the canonical fixtures:

1. **ZodReadonly (`.readonly()`)** — present in `entityZodShape` itself (mocks.ts:19), so
   `fake(entityZodShape)` fails today. Fix shape: unwrap pass-through in the Zod adapter
   (readonly is a type-level-only wrapper; tn-models itself treats it as unwrap/re-wrap,
   zod/zod.ts:131-133). This unblocks the entity shape, `getPaginatedSnakeCasedZod` output, and
   every list/retrieve fixture.

Secondary (construct surface, not on the critical fixture path):

2. **ZodAny** — create-custom-call.test.ts:16.
3. **ZodNativeEnum** — create-custom-call.test.ts:~441,445.
4. **ZodIntersection** — zod/zod.ts:103-106 (README Limitations already lists `intersect`).
5. **ZodBranded** — zod/zod.ts:38-40,135-138.
6. **ZodDefault** — zod/zod.ts:47-49,140-144.
7. **ZodVoid / ZodUndefined** — sentinel-only usage (zod/zod.ts:44-46); low value.

Semantic gaps (test-side, not fakeborn features):

8. Derived fields (`fullName = firstName + " " + lastName`, mocks.ts:41) — fakes generate fields
   independently.
9. Fixture identity/shared ids across list + retrieve + update tests — generate once, derive.
10. Hard-coded literal expectations (create-api.test.ts:~126-138) — assertions must be derived
    from the generated fake.
