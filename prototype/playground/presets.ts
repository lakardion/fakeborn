// PROTOTYPE — throwaway. One preset per fakeborn feature (fakeborn#26).

export interface Preset {
  id: string;
  title: string;
  section: "Zod" | "Valibot" | "Errors";
  blurb: string;
  code: string;
}

export const PRESETS: Preset[] = [
  {
    id: "zod-scalars",
    title: "Scalars",
    section: "Zod",
    blurb: "string, number, boolean, date, enum — the primitive building blocks.",
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
    blurb: "array, tuple, union, optional, nullable — shapes inside shapes.",
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
    blurb: "email, uuid, url, lengths, int, bounds — the fake honors what the schema exposes.",
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
    blurb: "Same contract, other library — the adapter is auto-detected.",
    code: `import * as v from "valibot";

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
    blurb: "z.map() isn't introspectable yet — fakeborn throws, never silently fakes.",
    code: `import { z } from "zod";

// z.map() exposes nothing fakeborn can introspect in v1,
// so this throws a descriptive UnsupportedSchemaError.
const schema = z.map(z.string(), z.number());
`,
  },
];
