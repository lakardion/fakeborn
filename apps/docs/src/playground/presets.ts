/**
 * Playground presets — one per fakeborn feature area (scalars, composites,
 * constraints), mirrored across both libraries, plus the error case.
 * Selecting a preset seeds the editor.
 *
 * Presets sharing a `feature` are cross-library counterparts: the adapter
 * picker uses that link to load the SAME example in the other library.
 *
 * Convention: preset (and user) code declares a top-level `schema`; the
 * iframe harness fakes it with the toolbar options, so count/seed/adapter
 * always apply.
 */
export interface Preset {
  id: string;
  title: string;
  section: "Zod" | "Valibot" | "Errors";
  /** Feature area — presets sharing one are cross-library counterparts. */
  feature?: "scalars" | "composites" | "constraints";
  code: string;
}

export const PRESET_SECTIONS: Preset["section"][] = ["Zod", "Valibot", "Errors"];

export const PRESETS: Preset[] = [
  {
    id: "zod-scalars",
    title: "Scalars",
    section: "Zod",
    feature: "scalars",
    code: `import { z } from "zod";

const schema = z.object({
  id: z.string(),
  age: z.number(),
  active: z.boolean(),
  createdAt: z.date(),
  role: z.enum(["admin", "user", "guest"]),
});
`,
  },
  {
    id: "zod-composites",
    title: "Composites",
    section: "Zod",
    feature: "composites",
    code: `import { z } from "zod";

const schema = z.object({
  tags: z.array(z.string()),
  point: z.tuple([z.number(), z.number()]),
  id: z.union([z.string(), z.number()]),
  nickname: z.string().optional(),
  deletedAt: z.date().nullable(),
});
`,
  },
  {
    id: "zod-constraints",
    title: "Constraints & formats",
    section: "Zod",
    feature: "constraints",
    code: `import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  id: z.string().uuid(),
  site: z.string().url(),
  username: z.string().min(3).max(12),
  age: z.number().int().min(18).max(99),
  scores: z.array(z.number()).length(3),
});
`,
  },
  {
    id: "valibot-scalars",
    title: "Scalars",
    section: "Valibot",
    feature: "scalars",
    code: `import * as v from "valibot";

const schema = v.object({
  id: v.string(),
  age: v.number(),
  active: v.boolean(),
  createdAt: v.date(),
  role: v.picklist(["admin", "user", "guest"]),
});
`,
  },
  {
    id: "valibot-composites",
    title: "Composites",
    section: "Valibot",
    feature: "composites",
    code: `import * as v from "valibot";

const schema = v.object({
  tags: v.array(v.string()),
  point: v.tuple([v.number(), v.number()]),
  id: v.union([v.string(), v.number()]),
  nickname: v.optional(v.string()),
  deletedAt: v.nullable(v.date()),
});
`,
  },
  {
    id: "valibot-constraints",
    title: "Constraints & formats",
    section: "Valibot",
    feature: "constraints",
    code: `import * as v from "valibot";

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
  {
    id: "unsupported",
    title: "Unsupported schema",
    section: "Errors",
    code: `import { z } from "zod";

// z.map() exposes nothing fakeborn can introspect in v1,
// so this throws a descriptive UnsupportedSchemaError.
const schema = z.map(z.string(), z.number());
`,
  },
];
