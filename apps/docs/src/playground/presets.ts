/**
 * Playground presets — one per fakeborn feature area (scalars, composites,
 * constraints), plus the error case. Selecting a preset seeds the editor.
 *
 * Each preset carries both library variants of the SAME example. The sidebar
 * lists every preset once; the adapter picker converts the code in place —
 * picking "valibot" with an untouched preset loaded swaps `z.*` for `v.*`
 * (and back), rather than jumping to a different sidebar entry. Presets
 * without a `valibot` variant are Zod-only.
 *
 * Convention: preset (and user) code declares a top-level `schema`; the
 * iframe harness fakes it with the toolbar options, so count/seed/adapter
 * always apply.
 */
export interface Preset {
  id: string;
  title: string;
  section: "Examples" | "Errors";
  /** The same example per library; `valibot` absent means Zod-only. */
  code: { zod: string; valibot?: string };
}

export const PRESET_SECTIONS: Preset["section"][] = ["Examples", "Errors"];

export const PRESETS: Preset[] = [
  {
    id: "scalars",
    title: "Scalars",
    section: "Examples",
    code: {
      zod: `import { z } from "zod";

const schema = z.object({
  id: z.string(),
  age: z.number(),
  active: z.boolean(),
  createdAt: z.date(),
  role: z.enum(["admin", "user", "guest"]),
});
`,
      valibot: `import * as v from "valibot";

const schema = v.object({
  id: v.string(),
  age: v.number(),
  active: v.boolean(),
  createdAt: v.date(),
  role: v.picklist(["admin", "user", "guest"]),
});
`,
    },
  },
  {
    id: "composites",
    title: "Composites",
    section: "Examples",
    code: {
      zod: `import { z } from "zod";

const schema = z.object({
  tags: z.array(z.string()),
  point: z.tuple([z.number(), z.number()]),
  id: z.union([z.string(), z.number()]),
  nickname: z.string().optional(),
  deletedAt: z.date().nullable(),
});
`,
      valibot: `import * as v from "valibot";

const schema = v.object({
  tags: v.array(v.string()),
  point: v.tuple([v.number(), v.number()]),
  id: v.union([v.string(), v.number()]),
  nickname: v.optional(v.string()),
  deletedAt: v.nullable(v.date()),
});
`,
    },
  },
  {
    id: "constraints",
    title: "Constraints & formats",
    section: "Examples",
    code: {
      zod: `import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  id: z.string().uuid(),
  site: z.string().url(),
  username: z.string().min(3).max(12),
  age: z.number().int().min(18).max(99),
  scores: z.array(z.number()).length(3),
});
`,
      valibot: `import * as v from "valibot";

const schema = v.object({
  email: v.pipe(v.string(), v.email()),
  id: v.pipe(v.string(), v.uuid()),
  site: v.pipe(v.string(), v.url()),
  username: v.pipe(v.string(), v.minLength(3), v.maxLength(12)),
  age: v.pipe(v.number(), v.integer(), v.minValue(18), v.maxValue(99)),
  scores: v.pipe(v.array(v.number()), v.length(3)),
});
`,
    },
  },
  {
    id: "unsupported",
    title: "Unsupported schema",
    section: "Errors",
    code: {
      zod: `import { z } from "zod";

// z.map() exposes nothing fakeborn can introspect in v1,
// so this throws a descriptive UnsupportedSchemaError.
const schema = z.map(z.string(), z.number());
`,
    },
  },
];
