# Research: Starlight playground integration — editor, execution, bundling

Resolves [fakeborn#23](https://github.com/lakardion/fakeborn/issues/23).

Scope: the docs site is Starlight on Astro in a Bun workspaces monorepo (`apps/docs`); the
playground is a live editor where users write Zod/Valibot schemas, executed fully
client-side; deployed to GitHub Pages as a static site. Those decisions are fixed and not
re-litigated here.

Method note: all bundle sizes below marked **measured** were produced locally on
2026-07-30 with `bun build --target=browser --minify` (Bun's bundler/minifier) against the
exact package versions named, plus `gzip` for the compressed figure. Sizes from
bundlephobia.com are marked as such. Byte counts vary by bundler, but relative magnitudes
are stable.

---

## TL;DR

1. **Editor: CodeMirror 6.** A basicSetup + TypeScript editor is ~507 KB min / **169 KB gzip**
   measured; Monaco's shipped minified build is **~24 MB** of JS (core editor chunk alone
   ~2.4 MB, TS worker ~7 MB). Monaco buys in-editor IntelliSense we don't need for a
   schema-snippet playground.
2. **Execution: sandboxed `<iframe>` + import map + sucrase TS strip** — this is exactly
   what Valibot's official playground does (source-verified). Not `new Function` in the
   docs page, and a Web Worker is unnecessary complexity for untrusted-code isolation.
3. **Bundling: one lazy playground chunk behind `client:only` / dynamic `import()`.**
   zod (~13 KB gz) + valibot (~1–15 KB gz) + fakeborn is small; **faker dominates**
   (~154 KB gz for the default English instance — fakeborn's `faker-map.ts` hard-imports
   the default `faker` instance). Total playground runtime ≈ **1.0 MB min / 330 KB gz**
   measured, loaded only on the playground page.
4. **Starlight: `src/pages/playground.astro` + `<StarlightPage frontmatter={{ title: 'Playground' }} hasSidebar={false}>`**,
   with the editor mounted via `client:only` (framework island) or a processed
   `<script>` (framework-free). Editors touch `window`/`document`, so they must not be
   SSR'd.

---

## 1. Editor component: CodeMirror 6 vs Monaco vs lighter

### Evidence

**CodeMirror 6 is explicitly modular.** The official guide: "CodeMirror is set up as a
collection of separate modules… you can pick and choose which features you need"; the
`codemirror` package "pulls in most of the things you need for a baseline editor (except
a language package)"; packages "are distributed as ES6 modules" and require a bundler
(Vite/Rollup named) — which Astro already provides.
Source: https://codemirror.net/docs/guide/

**Measured sizes** (Bun build, minified + gzip):

| Option | Entry | minified | gzip |
|---|---|---|---|
| CodeMirror 6 basic setup | `basicSetup` from `codemirror@6.0.2` + `javascript({typescript:true})` from `@codemirror/lang-javascript@6.2.5` | 507 KB | **169 KB** |
| `codemirror` meta package (bundlephobia) | everything in the meta package | 373 KB | 119 KB |
| `@codemirror/state` (bundlephobia) | state core only | 49 KB | 16 KB |
| `@codemirror/lang-javascript` (bundlephobia) | JS/TS language incl. lezer parser | 384 KB | 129 KB |
| Monaco editor `0.56.0` (shipped `min/vs` build, sum of all minified JS, from the npm tarball via jsDelivr listing) | full editor + all languages + workers | **24.1 MB** (137 JS files) | — |
| — Monaco core editor chunk `editor-*.js` (npm tarball) | editor without TS worker | 2.39 MB | — |
| — Monaco TS language worker `ts.worker.js` (npm tarball) | in-editor TS IntelliSense | 6.7–7.0 MB | — |

Sources:
- https://bundlephobia.com/package/codemirror , https://bundlephobia.com/package/@codemirror/state , https://bundlephobia.com/package/@codemirror/lang-javascript
- https://www.npmjs.com/package/monaco-editor (v0.56.0 tarball contents; file listing also via https://data.jsdelivr.com/v1/packages/npm/monaco-editor@0.56.0)

For reference, bundlephobia on the validator libs (used later): zod@4.4.3 = 281 KB min /
62 KB gz (https://bundlephobia.com/package/zod); valibot@1.4.2 = 85.5 KB min / 14.7 KB gz
(https://bundlephobia.com/package/valibot).

**Lighter alternative considered:** a plain `<textarea>` with a syntax-highlighted overlay.
Starlight already ships Shiki/Expressive Code for its code blocks (config reference lists
the `expressiveCode` option: https://starlight.astro.build/reference/configuration/),
but Expressive Code highlighting is a build-time/SVG-token pipeline — re-highlighting on
every keystroke client-side would mean shipping the Shiki WASM/JS runtime anyway, landing
near CodeMirror's weight with a much worse editing UX (no cursor/selection sync, no
bracket matching). Not recommended.

### Recommendation: **CodeMirror 6**

- ~169 KB gzip for a full editing experience (line numbers, history, bracket matching,
  TS syntax highlighting) vs multiple megabytes for Monaco. Monaco's killer feature —
  in-editor TypeScript IntelliSense with zod/valibot type definitions — would additionally
  require shipping its ~7 MB TS worker plus `.d.ts` files, which is disproportionate for a
  schema-snippet playground on a static docs site.
- CM6 is plain JS with a DOM API (`new EditorView({ parent })`), so it embeds in *any*
  island strategy (React/Svelte/vanilla script) without a wrapper library.
- Valibot's official playground uses Monaco — but it is a dedicated flagship playground
  whose authors accept the weight, and it still *executes* code outside Monaco. Their
  choice doesn't invalidate CM6 for a smaller docs playground. Source:
  https://github.com/open-circle/valibot/blob/main/website/src/components/CodeEditor.tsx
  (imports `monaco-editor`, `monaco-editor-textmate`, onigasm WASM, prettier).

---

## 2. Client-side execution of user schema code

### Prior art, source-verified

**Valibot official playground** (https://valibot.dev/playground/), implementation at
https://github.com/open-circle/valibot/tree/main/website/src/routes/playground:

1. The page holds a hidden `<iframe hidden sandbox="allow-scripts">` whose `srcdoc`
   contains an **import map** pinning `valibot` (and `@valibot/to-json-schema`) to
   pre-built minified ESM bundles (`library/dist/index.min.mjs?url`), plus a small harness
   script. Source: `index.tsx` (the iframe JSX) and
   https://github.com/open-circle/valibot/blob/main/website/src/routes/playground/index.tsx
2. On "run", the page transforms the editor contents with **sucrase**
   (`transform(code, { transforms: ['typescript'] })`) — i.e., it only *strips types*, it
   does not typecheck — and `postMessage`s the resulting JS to the iframe, which injects
   it as a `<script type="module">`. Same file, `executeCode` / `iframeCode.js`
   (https://github.com/open-circle/valibot/blob/main/website/src/routes/playground/iframeCode.js).
3. The harness inside the iframe overrides `console.*` and `window.onerror` and forwards
   everything to the parent via `postMessage`; the parent renders the "logs" sidebar.
   Same sources.
4. Editor code is persisted shareably with `lz-string` (`compressToEncodedURIComponent`)
   into `?code=` search param. Source: `index.tsx`.

**Zod:** no official playground exists — the zod repo has no playground package
(https://github.com/colinhacks/zod/tree/main/packages lists only bench/docs/integration/
resolution/treeshake/tsc/zod) and https://zod.dev/playground returns 404. So there is no
first-party Zod precedent to copy; third-party playgrounds exist but are out of scope per
the primary-sources rule.

**Faker:** no embedded playground; the docs' "Try it" is "load faker into the browser
console… `const { faker } = await import('https://esm.sh/@faker-js/faker')`".
Source: https://fakerjs.dev/guide/usage.html

### Recommendation: **sandboxed iframe + import map + sucrase** (the Valibot pattern)

- `sandbox="allow-scripts"` lets code run but blocks same-origin access, so user code
  can't touch the docs page's DOM/cookies — something neither `new Function` nor a plain
  same-origin Worker provides. (`sandbox` attribute semantics:
  https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe#sandbox)
- The **import map** solves the "user writes `import * as z from 'zod'`" problem cleanly:
  bare specifiers in user code resolve to our pre-bundled, pre-minified runtime chunks —
  no runtime bundler, no CDN dependency (unlike faker's esm.sh approach, which violates
  our "fully client-side, static GitHub Pages" constraint only in spirit: esm.sh is a
  third-party runtime dependency).
- **sucrase** measured at **209 KB min / 48 KB gz** (sucrase@3.35.1, browser-target Bun
  build, TS transform only). It strips types without typechecking — right trade-off for a
  playground (typechecking would require the full TS compiler ≈ Monaco's TS worker
  weight). Source for Valibot's identical choice: `index.tsx` above; package:
  https://www.npmjs.com/package/sucrase
- `new Function`/`eval` in the docs page: no isolation, no import syntax, breaks under a
  strict CSP. Web Worker: isolation but no DOM console UX, import maps don't apply, and
  you'd have to bundle zod/valibot/faker into the worker script instead — strictly more
  work than the iframe for no gain here.

---

## 3. Bundling strategy for zod / valibot / @faker-js/faker / fakeborn

### Measured per-package costs (Bun build `--target=browser --minify`, 2026-07-30)

| Package | Entry | minified | gzip |
|---|---|---|---|
| `zod@3.23` | `z.object({a: z.string()})` | 59 KB | 13 KB |
| `valibot@1.4.1` | `v.object({a: v.string()})` | 2.7 KB | 1.2 KB |
| `@faker-js/faker@10.5.0` | `import { fakerEN }` (default English instance) | 448 KB | **154 KB** |
| `fakeborn` (repo `src/index.ts`) | `import { fake }` | 501 KB | 161 KB |
| **Playground runtime total** | fakeborn + zod + valibot + fakerEN | **1.01 MB** | **330 KB** |
| sucrase (TS strip, see §2) | `transform` | 209 KB | 48 KB |
| CodeMirror 6 (see §1) | basicSetup + TS lang | 507 KB | 169 KB |

Key findings behind the numbers:

- **Faker dominates the runtime.** Faker's own docs: "due to all of the strings Faker
  uses to generate fake data, Faker is a large package. It's > 5 MiB minified. Please
  avoid deploying the full Faker package in your web app," and "a full Faker instance …
  would include at least 500KB of locale data." Source: https://fakerjs.dev/guide/usage.html
  The full package ships ~2.4 MB of minified JS across 77 per-locale chunks
  (npm tarball of `@faker-js/faker@10.5.0`: `dist/` total; `base` chunk 127 KB/38 KB gz,
  `en` chunk 288 KB/115 KB gz).
- **faker is tree-shakeable by locale, not by module.** v9+ is "Tree-Shakeable
  Module-Functions" (roadmap link on https://fakerjs.dev/guide/usage.html), the package is
  `"sideEffects": false` with per-locale exports (package.json exports map in the tarball;
  docs: "The recommended way to access Faker instances is by using one of the individual
  imports" — https://fakerjs.dev/guide/localization.html). But any one real locale carries
  its data: `fakerEN` alone is ~154 KB gz. `simpleFaker` avoids locale data entirely but
  can't generate realistic names/emails — wrong product trade-off for fakeborn, whose
  point is realistic data.
- **fakeborn currently pins the default faker instance:** `src/faker-map.ts` does
  `import { faker } from "@faker-js/faker"` and is "the single module that imports faker"
  (its own comment). So importing `fake()` in the browser pulls the whole English locale
  — the 501 KB / 161 KB gz figure above. That's the floor until/unless fakeborn grows a
  faker-injection seam (the `FakerMap` type in `faker-map.ts` is already documented as
  that future seam).
- zod and valibot are rounding errors by comparison; valibot tree-shakes almost perfectly
  (per-call imports), zod v3 ships as one module (~13 KB gz regardless).

### Strategy

1. **One playground chunk, loaded only on the playground page.** In Astro, a component
   rendered with a `client:*` directive gets its JS bundled per-component and loaded only
   for pages that use it ("client-side JavaScript is only loaded for the explicit
   interactive components that you mark using `client:*` directives" —
   https://docs.astro.build/en/concepts/islands/). A framework-free `<script>` is also
   bundled by Vite with npm imports supported
   (https://docs.astro.build/en/guides/client-side-scripts/: "Import bundling: Import
   local files or npm modules, which will be bundled together… become `type="module"`").
2. **Statically import zod, valibot, fakeborn (+ faker transitively) into that chunk** —
   they must be resolvable as prebuilt bundles for the iframe import map (see §4), so
   they need `?url`-style asset emission or a small Vite step that builds
   `playground-runtime.{zod,valibot,fakeborn}.js` chunks, mirroring Valibot's
   `dist/index.min.mjs?url` approach. Because fakeborn is a workspace package
   (`apps/docs` → `fakeborn`), Vite bundles it from source; mark `zod`/`valibot` as peers
   the playground provides, not bundled twice.
3. **Lazy-load the editor itself** inside the chunk (`await import('codemirror')` on
   first interaction or via `client:visible`) so the ~169 KB gz editor doesn't block the
   initial render of the playground page either.
4. **Do not** try to shrink faker below `fakerEN` for v1; do note the `simpleFaker`-style
   or custom-locale (`new Faker({ locale: [en, base] })` —
   https://fakerjs.dev/guide/localization.html) escape hatch as a follow-up if 330 KB gz
   becomes a problem.

Expected first-load cost of the playground route: ~330 KB gz runtime + ~48 KB gz sucrase
+ ~169 KB gz editor ≈ **~550 KB gz total, all confined to `/playground`**; every other
docs page pays nothing.

---

## 4. Starlight integration recipe

### Custom route

Starlight supports arbitrary Astro pages alongside content pages: "For advanced use
cases, you can add custom pages by creating a `src/pages/` directory. The `src/pages/`
directory uses Astro's file-based routing"; to keep the docs chrome, "wrap your page
content with the `<StarlightPage>` component."
Source: https://starlight.astro.build/guides/pages/

`apps/docs/src/pages/playground.astro`:

```astro
---
import StarlightPage from '@astrojs/starlight/components/StarlightPage.astro';
import Playground from '../components/Playground.tsx'; // or .astro + <script>
---

<StarlightPage frontmatter={{ title: 'Playground' }} hasSidebar={false}>
  <Playground client:only="react">
    <div slot="fallback">Loading playground…</div>
  </Playground>
</StarlightPage>
```

Notes, each grounded in the same source page:

- `<StarlightPage>` props include `hasSidebar` (boolean; default `false` when
  `frontmatter.template` is `'splash'`, otherwise `true`) — a full-width editor wants
  `hasSidebar={false}`, or `frontmatter={{ title: 'Playground', template: 'splash' }}`.
- Custom pages "are not part of a collection and cannot be added to an autogenerated
  sidebar group" — so link to `/playground` from the Starlight `sidebar` config
  (explicit entry) or the header, not from an autogenerated group.
- `frontmatter.title` is required.

### Island hydration: `client:only` is the safe directive

- "client:only={string} skips HTML server rendering, and renders only on the client";
  you must pass the framework name explicitly; `slot="fallback"` children render until
  the component loads. Source:
  https://docs.astro.build/en/reference/directives-reference/#clientonly
- This matters because CodeMirror/Monaco instantiate against the live DOM
  (`new EditorView({ parent })` — https://codemirror.net/docs/guide/): SSR would crash on
  `document`/`window` or produce hydration mismatches. `client:load` would SSR the
  component first; a code editor has no meaningful SSR output, so `client:only` +
  fallback placeholder is strictly better.
- If a lighter lazy mount is wanted, `client:visible` ("Load and hydrate the component
  JavaScript once the component has entered the user's viewport… uses an
  `IntersectionObserver`", same directives reference) still SSRs — combine the "visible"
  semantics with `client:only` by gating a dynamic `import()` inside the island on an
  IntersectionObserver instead, if needed. For a dedicated `/playground` route,
  `client:only` alone is fine.
- Requires a framework integration (e.g. `@astrojs/react`) for `client:only="react"`.
  Framework-free alternative: a `.astro` component whose plain `<script>` Astro processes
  (TS + npm imports bundled, emitted as `type="module"`):
  https://docs.astro.build/en/guides/client-side-scripts/#script-processing. The script
  mounts the CM6 `EditorView` into a `<div>` — no framework dependency at all, matching
  the docs site's otherwise framework-free posture.

### Execution wiring inside the island (concrete, following Valibot)

1. Build-time: emit pre-bundled runtime assets —
   `playground-runtime/zod.js`, `…/valibot.js`, `…/fakeborn.js` (and fakeborn's faker
   dependency) — as hashed static assets (Vite `?url` imports or a tiny
   `vite build` lib-mode step in `apps/docs`).
2. The island renders a hidden `<iframe sandbox="allow-scripts">` whose `srcdoc` declares
   an import map `"imports": { "zod": "<asset-url>", "valibot": "…", "fakeborn": "…" }`
   plus a harness that mirrors Valibot's `iframeCode.js`: wrap `console.*`/`window.onerror`,
   `postMessage` logs to the parent, execute incoming code via
   `<script type="module">` injection.
3. "Run" = `sucrase.transform(code, { transforms: ['typescript'] })` → `postMessage` to
   iframe → render returned logs in the output panel. Presets = `?code=` param compressed
   with `lz-string` (4.8 KB min / 1.5 KB gz — https://bundlephobia.com/package/lz-string),
   exactly as Valibot does.
4. GitHub Pages static hosting imposes no extra constraints: everything above is static
   assets + client JS; no server runtime is involved (Astro static output is the default
   and Starlight targets it; the `client:only` component renders at runtime in the
   browser, not at request time).

### Gotchas

- **`src/pages/` routes bypass the content collection**: no autogenerated sidebar entry,
  no `slug` frontmatter (auto from URL), `editUrl` must be a full URL — all per
  https://starlight.astro.build/guides/pages/.
- **Don't import editor/runtime code in frontmatter** (the server-evaluated part of the
  `.astro` file): keep `codemirror`, `sucrase`, and the validators strictly inside the
  client island/script, or they'll inflate SSR/build and can crash prerendering on
  `window` references.
- **Import maps are supported in all modern browsers** (baseline since 2023) and are the
  mechanism Valibot's playground relies on in production; no polyfill needed for a
  developer-audience docs site. (Valibot `srcdoc` source cited in §2.)
- fakeborn is ESM-only (`"type": "module"`, single `dist/index.js` export in
  `package.json`), which is exactly what the iframe import map needs — no CJS interop
  shim required.

---

## Sources

Primary sources cited above, collected:

- Starlight custom pages / `<StarlightPage>`: https://starlight.astro.build/guides/pages/
- Starlight configuration reference (Expressive Code): https://starlight.astro.build/reference/configuration/
- Astro islands: https://docs.astro.build/en/concepts/islands/
- Astro directives reference (`client:only`, `client:visible`, …): https://docs.astro.build/en/reference/directives-reference/ (source: https://github.com/withastro/docs/blob/main/src/content/docs/en/reference/directives-reference.mdx)
- Astro client-side scripts (script processing/bundling): https://docs.astro.build/en/guides/client-side-scripts/
- CodeMirror system guide (modularity, `basicSetup`, bundler requirement): https://codemirror.net/docs/guide/
- Bundle sizes: https://bundlephobia.com/package/codemirror · /@codemirror/state · /@codemirror/lang-javascript · /zod · /valibot · /lz-string; npm tarballs `monaco-editor@0.56.0`, `@faker-js/faker@10.5.0`, `sucrase@3.35.1` (via https://www.npmjs.com/ and https://data.jsdelivr.com/v1/packages/npm/monaco-editor@0.56.0); local Bun-build measurements as described in the method note.
- Faker usage (browser, ">5 MiB", simpleFaker/500 KB locale data): https://fakerjs.dev/guide/usage.html
- Faker localization (individual locale imports, custom `Faker` instances): https://fakerjs.dev/guide/localization.html
- Valibot playground source: https://github.com/open-circle/valibot/tree/main/website/src/routes/playground (`index.tsx`, `iframeCode.js`, `editorCode.ts`) and https://github.com/open-circle/valibot/blob/main/website/src/components/CodeEditor.tsx
- Zod repo package layout (no playground): https://github.com/colinhacks/zod/tree/main/packages
- sucrase: https://www.npmjs.com/package/sucrase
- MDN iframe `sandbox`: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe#sandbox
