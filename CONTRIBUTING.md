# Contributing

## Commit messages are the versioning

Releases are fully automated: every merge to `main` runs
[semantic-release](https://semantic-release.gitbook.io/) (see
`.github/workflows/release.yml`), which derives the version bump, changelog,
git tag, GitHub Release, and npm publish **from commit messages alone**. There
is no manual `npm version` step — a sloppy message becomes a wrong bump.

Use [Conventional Commits](https://www.conventionalcommits.org/) (PR titles
too — squash merges turn the title into the commit):

| Commit                              | Bump              |
| ----------------------------------- | ----------------- |
| `fix: …`                            | patch (1.0.x)     |
| `feat: …`                           | minor (1.x.0)     |
| `feat!: …` / `BREAKING CHANGE:`     | major (x.0.0)     |
| `chore:`, `docs:`, `refactor:`, …   | no release        |

Scope is optional but encouraged: `feat(valibot): …`, `fix(zod): …`.

## Before opening a PR

```sh
bun run check   # lint + format + typecheck + tests
```

## Layout

- `packages/fakeborn` — the library; the only workspace published to npm.
- `apps/docs` — the docs site (Starlight); `"private": true`, never published.
