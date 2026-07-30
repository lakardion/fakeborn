import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  site: "https://lakardion.github.io",
  base: "/fakeborn",
  integrations: [
    starlight({
      title: "fakeborn",
      description:
        "Generate fake data born from your validation schema — pass a validator (Zod, Valibot) to fake() and get a value that satisfies it.",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/lakardion/fakeborn",
        },
      ],
      customCss: ["./src/styles/global.css"],
      // Sidebar slugs are site-root-relative — Starlight prepends `base`
      // (/fakeborn) itself. Do NOT bake the base into these slugs.
      sidebar: [
        {
          label: "Start Here",
          items: [{ slug: "getting-started" }],
        },
      ],
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
