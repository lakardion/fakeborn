/**
 * Playground presets — one per fakeborn feature area, grouped for the
 * preset nav (Zod / Valibot / Errors). Selecting a preset seeds the editor.
 *
 * Convention: preset (and user) code declares a top-level `schema`; the
 * iframe harness fakes it with the toolbar options, so count/seed/adapter
 * always apply.
 */
export interface Preset {
  id: string;
  title: string;
  section: "Zod" | "Valibot" | "Errors";
  code: string;
}

export const PRESET_SECTIONS: Preset["section"][] = ["Zod", "Valibot", "Errors"];

export const PRESETS: Preset[] = [
  {
    id: "zod-scalars",
    title: "Scalars",
    section: "Zod",
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
    id: "valibot-object",
    title: "Object + pipe constraints",
    section: "Valibot",
    code: `import * as v from "valibot";

// Same contract, other library — the adapter is auto-detected.
const schema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  age: v.pipe(v.number(), v.integer(), v.minValue(18)),
  email: v.pipe(v.string(), v.email()),
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
