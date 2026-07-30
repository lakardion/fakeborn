# Research: GitHub Pages deployment of `apps/docs` (Astro/Starlight) from a Bun workspaces monorepo

Resolves: <https://github.com/lakardion/fakeborn/issues/24>

Context (pre-decided, not re-litigated here): Bun workspaces monorepo with `packages/fakeborn`
(the lib, built with `bun build` + `tsc` for declarations) and `apps/docs` (Astro + Starlight).
Deploy target: GitHub Pages project site at `https://lakardion.github.io/fakeborn` (repo
`lakardion/fakeborn`), static output.

---

## 1. `astro.config` `site` / `base` for the project Pages URL

### The values

```ts
// apps/docs/astro.config.mjs
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://lakardion.github.io",
  base: "/fakeborn",
  integrations: [starlight({ title: "fakeborn", sidebar: [/* ... */] })],
});
```

- `site` must be the **origin only** (`https://<username>.github.io`), not the full URL with the
  repo path. Astro's deploy guide states `site` must be either `https://<username>.github.io` or the
  random `https://<random-string>.pages.github.io/` URL of an Organization private page.
  Source: <https://docs.astro.build/en/guides/deploy/github/>
- `base` is required for a **project** site because GitHub Pages serves it under
  `https://<owner>.github.io/<repositoryname>` — only user/organization sites (repo named
  `<owner>.github.io`) are served at the root and can skip `base`.
  Sources: <https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages>
  (types of sites, default locations), <https://docs.astro.build/en/guides/deploy/github/>
  ("Set a value for `base` that specifies the repository… You can skip this if your repository name
  matches the special `<username>.github.io` pattern").
- `base` is given as the repo name with a leading slash, no trailing slash: `/fakeborn`.
  Source: <https://docs.astro.build/en/guides/deploy/github/> ("Configure `base` as the
  repository's name starting with a forward slash (e.g. `/my-repo`)".

### How `base` behaves (Astro core)

- Astro uses `base` as the root for pages and assets in both `astro dev` and `astro build`; e.g.
  with `base: "/fakeborn"`, `astro dev` serves the site under `/fakeborn`.
  Source: <https://docs.astro.build/en/reference/configuration-reference/#base>
- Hand-written internal links in `.astro`/MDX files and any hard-coded asset URLs must include the
  `base` prefix themselves (e.g. `<a href="/fakeborn/about">`); the value is available as
  `import.meta.env.BASE_URL`.
  Sources: <https://docs.astro.build/en/guides/deploy/github/> ("Internal links with `base`
  configured"), <https://docs.astro.build/en/reference/configuration-reference/#base>
- `import.meta.env.BASE_URL` (and the `config.base` value seen by integrations) is normalized by
  the `trailingSlash` option: with the default `trailingSlash: "ignore"` the value is used as-is;
  `"always"` forces a trailing slash, `"never"` strips it. Keep the default and `base: "/fakeborn"`
  (no trailing slash) for the least surprise.
  Source: <https://docs.astro.build/en/reference/configuration-reference/#base>

### How Starlight handles `base`

- Starlight supports `base` and prefixes its own generated URLs (sidebar entries, prev/next
  pagination, header links) with it. Base support was made consistent across the integration —
  including under `trailingSlash: "never"` — in Starlight **0.0.8** (PR #62), i.e. it has been a
  first-class feature since the earliest releases; any current Starlight handles it.
  Source: <https://github.com/withastro/starlight/blob/main/packages/starlight/CHANGELOG.md>
  (0.0.8: "Make `base` support consistent, including when `trailingSlash: 'never'` is set.")
- Known historical bug, relevant only if `build.format` is changed from the default: a link
  formatting issue with `build.format: "file"` combined with `base` was fixed in Starlight
  **0.28.3** (PR #2408). Starlight's default output (`build.format: "directory"`) is unaffected,
  so no action needed — just don't opt into `build.format: "file"` on an old Starlight.
  Source: <https://github.com/withastro/starlight/blob/main/packages/starlight/CHANGELOG.md> (0.28.3)
- Sidebar entries written as internal slugs (e.g. `slug: "guides/example"` or `link: "/guides/example"`)
  are resolved by Starlight against the site root; do **not** bake `/fakeborn` into sidebar slugs —
  Starlight adds `base` at render time. Only fully hand-written links in custom `.astro` components
  or raw HTML need the explicit prefix (per the Astro `base` rules above). Assets placed in
  `public/` are served verbatim and must be referenced with the base prefix (or via
  `import.meta.env.BASE_URL`); assets imported through the build pipeline get correct URLs.
  Sources: <https://docs.astro.build/en/reference/configuration-reference/#base>,
  <https://docs.astro.build/en/guides/deploy/github/>

## 2. GitHub Actions workflow

### Recommended: `withastro/action` pointed at the repo root

The official Astro action is the recommended deploy path per Astro's docs
(<https://docs.astro.build/en/guides/deploy/github/>). Its `path` input is "the root location of
your Astro project inside the repository", but every step — lockfile scan, install, build —
runs with `working-directory: ${{ inputs.path }}`, and `out-dir` is resolved relative to `path`.
Source: <https://github.com/withastro/action/blob/main/action.yml>

In a Bun monorepo the lockfile lives at the **repo root**, so the clean way to use the action is to
point `path` at the root and drive the per-package builds with Bun's `--filter`:

```yaml
# .github/workflows/deploy.yml
name: Deploy docs to GitHub Pages

on:
  push:
    branches: [main]
    paths:
      - "packages/fakeborn/**"
      - "apps/docs/**"
      - "bun.lock"
      - ".github/workflows/deploy.yml"
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

# Cancel superseded runs; required so a stale run can't overwrite a newer deploy
concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - name: Install, build, and upload docs site
        uses: withastro/action@v6
        with:
          path: . # repo root: bun.lock lives here, so package-manager auto-detects as bun
          package-manager: bun@latest # explicit: skips lockfile sniffing entirely
          build-cmd: bun run --filter fakeborn build && bun run --filter docs build
          out-dir: apps/docs/dist # relative to `path`
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v5
```

Why each piece:

- **Lockfile detection**: the action scans `${{ inputs.path }}` (maxdepth 1) for
  `pnpm-lock.yaml` / `yarn.lock` / `package-lock.json` / `bun.lock` / `bun.lockb`. With `path: .`
  it finds the root `bun.lock` and selects bun; passing `package-manager: bun` explicitly makes it
  deterministic. If instead `path: apps/docs` were used, detection would find no lockfile there and
  the action would fail with "No lockfile found" unless `package-manager` is set.
  Source: <https://github.com/withastro/action/blob/main/action.yml> ("Check lockfiles" step)
- **Install**: with bun selected, the action installs Bun via `oven-sh/setup-bun` (pinned to
  v2.2.0 in the action) and runs `bun install` in `path`. Run at the root, this installs all
  workspace dependencies and links `fakeborn` into `node_modules` via the `workspace:` protocol.
  Sources: <https://github.com/withastro/action/blob/main/action.yml> ("Setup Bun" / "Install"
  steps), <https://bun.sh/docs/install/workspaces> ("`bun install` installs dependencies for all
  workspaces in the monorepo"), <https://github.com/oven-sh/setup-bun>
- **Build order**: `bun run --filter <name> <script>` runs a script in a single workspace package;
  `--filter` matches the `name` field of each workspace `package.json`. Building `fakeborn` first
  guarantees `packages/fakeborn/dist` exists before the Astro build resolves the `fakeborn` import
  (see §3). Source: <https://bun.sh/docs/cli/filter> ("Running scripts with `--filter`")
  (Note: the docs package name above is assumed to be `docs`; use whatever `name` lands in
  `apps/docs/package.json`.)
- **Upload/deploy**: `withastro/action` ends with `actions/upload-pages-artifact` on
  `${{ inputs.path }}/${{ inputs.out-dir }}/`, and the separate `deploy` job uses
  `actions/deploy-pages` with the `github-pages` environment — this is the official Pages pipeline,
  and requires **Settings → Pages → Source: "GitHub Actions"** on the repo.
  Sources: <https://github.com/withastro/action/blob/main/action.yml> ("Upload Pages Artifact"
  step), <https://docs.astro.build/en/guides/deploy/github/>,
  <https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site>
- **Trigger**: push to `main` plus `workflow_dispatch` is the pattern from the official guide; the
  `paths` filter avoids pointless deploys for lib-only test/refactor commits that don't touch the
  published output — include `bun.lock` (dependency changes affect the built site) and the workflow
  file itself. Source: <https://docs.astro.build/en/guides/deploy/github/>
- Action versions (`actions/checkout@v7`, `withastro/action@v6`, `actions/deploy-pages@v5`) match
  the current official workflow template. Sources: <https://docs.astro.build/en/guides/deploy/github/>,
  <https://github.com/withastro/action>

### Alternative: fully manual steps (more transparent, same result)

If we'd rather see every step (or need `bun ci` for strict reproducibility), skip
`withastro/action` and compose the same pipeline from the underlying actions:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: oven-sh/setup-bun@v2 # reads packageManager/engines.bun, else latest
      - run: bun ci # == bun install --frozen-lockfile; fails if bun.lock is stale
      - run: bun run --filter fakeborn build
      - run: bun run --filter docs build
      - uses: actions/upload-pages-artifact@v5
        with:
          path: apps/docs/dist/
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```

- `oven-sh/setup-bun@v2` picks the Bun version from the root `package.json` `packageManager`
  field (e.g. `"packageManager": "bun@1.x"`), then `engines.bun`, else `latest` — pin via
  `packageManager` for reproducibility. Source: <https://github.com/oven-sh/setup-bun>
- `bun ci` is exactly `bun install --frozen-lockfile`: installs exact versions from `bun.lock` and
  fails the build if `package.json` is out of sync with the lockfile — the Bun-recommended CI
  install. Source: <https://bun.sh/docs/cli/install> (CI/CD section)

Either variant is fine; the first stays closest to Astro's officially maintained path, the second
is easier to debug in a monorepo. Do **not** use `peaceiris/actions-gh-pages`-style branch deploys —
the Actions-artifact pipeline above is the approach GitHub and Astro document, and branch-based
deploys fight with the `github-pages` environment/protection model.
Source: <https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site>

## 3. Monorepo pitfalls (and how the recipe above defuses them)

1. **Lockfile must live (and be committed) at the repo root.** Bun workspaces keep a single
   `bun.lock` at the root next to the root `package.json` with the `"workspaces"` field — there is
   no per-package lockfile. Any tooling that sniffs for a lockfile inside `apps/docs` (as
   `withastro/action` does when pointed at a subdirectory) will find nothing; commit the root
   `bun.lock` and either run install from the root or set `package-manager` explicitly. Astro's
   guide also requires committing the lockfile for detection.
   Sources: <https://bun.sh/docs/install/workspaces> (monorepo layout),
   <https://github.com/withastro/action/blob/main/action.yml>,
   <https://docs.astro.build/en/guides/deploy/github/> (lockfile caution)
2. **`workspace:` protocol resolution.** `apps/docs` should depend on the lib as
   `"fakeborn": "workspace:*"`. Bun resolves this at install time by linking the local
   `packages/fakeborn` directory into `node_modules` — nothing is fetched from the registry, and no
   publish step is needed for the docs build to import it. (On actual `bun publish`, Bun rewrites
   `workspace:*` to the real version.)
   Source: <https://bun.sh/docs/install/workspaces>
3. **`fakeborn` must be built before the docs build.** Bun links the workspace *directory*, so
   `import … from "fakeborn"` resolves through `packages/fakeborn/package.json`'s
   `main`/`exports`, which point at `./dist/index.js` + `./dist/index.d.ts` — files that only exist
   after `bun run build` (which runs `bun build` + `tsc --emitDeclarationOnly`) has run in that
   package. If the docs import `fakeborn` (live examples, API extraction), the lib build is a hard
   precondition in CI: fresh clones have no `dist/`, and `dist/` is git-ignored. Hence the
   `build-cmd: bun run --filter fakeborn build && bun run --filter docs build` ordering (or the two
   explicit steps in the manual variant). Local `astro dev` has the same requirement.
   Sources: <https://bun.sh/docs/install/workspaces> ("If package `b` depends on `a`, `bun install`
   installs your local `packages/a` directory into `node_modules`"), repo `package.json` (`exports`
   → `./dist/*`, `build` script)
4. **Install scope.** Plain `bun install` at the root installs every workspace (correct and simple).
   If CI time ever matters, `bun install --filter` can restrict to a subset, but filters do **not**
   auto-include workspace dependencies of the selected packages — filtering to the docs site only
   would skip nothing harmful here, yet the full install is the safer default.
   Source: <https://bun.sh/docs/cli/filter> ("`bun install` and `bun outdated`")
5. **Node is still present.** Even with bun selected, `withastro/action` also runs
   `actions/setup-node` (Node 24 by default, overridable via `node-version`) because parts of the
   Astro toolchain expect Node — don't be surprised to see it in the logs, and don't try to strip
   it. Source: <https://github.com/withastro/action/blob/main/action.yml> ("Setup Node (Bun)" step)

## One-time repo setup checklist

1. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
   Source: <https://docs.astro.build/en/guides/deploy/github/>
2. `apps/docs/astro.config.mjs`: `site: "https://lakardion.github.io"`, `base: "/fakeborn"`.
3. Commit root `bun.lock`; ensure `apps/docs/package.json` depends on `"fakeborn": "workspace:*"`.
4. Add `.github/workflows/deploy.yml` (either variant above).
5. Verify the deployed `https://lakardion.github.io/fakeborn/` serves assets from
   `/fakeborn/_astro/…` (quick smoke test that `base` is applied).

## Sources

- Astro GitHub Pages deploy guide: <https://docs.astro.build/en/guides/deploy/github/>
- Astro configuration reference (`site`, `base`, `trailingSlash`): <https://docs.astro.build/en/reference/configuration-reference/>
- `withastro/action` README and action definition: <https://github.com/withastro/action>, <https://github.com/withastro/action/blob/main/action.yml>
- `oven-sh/setup-bun`: <https://github.com/oven-sh/setup-bun>
- Starlight changelog (base support 0.0.8; `build.format: "file"` + base fix 0.28.3): <https://github.com/withastro/starlight/blob/main/packages/starlight/CHANGELOG.md>
- Starlight configuration reference: <https://starlight.astro.build/reference/configuration/>
- GitHub Pages — site types & default URLs: <https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages>
- GitHub Pages — publishing source (Actions vs branch): <https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site>
- Bun workspaces: <https://bun.sh/docs/install/workspaces>
- Bun `--filter`: <https://bun.sh/docs/cli/filter>
- Bun install / CI (`bun ci`, `--frozen-lockfile`): <https://bun.sh/docs/cli/install>
