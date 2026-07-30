# fakeborn

Generate fake data born from your validation schema — pass a validator (Zod, Valibot) to `fake()` and get a value that satisfies it.

This is a Bun workspaces monorepo:

- [`packages/fakeborn`](./packages/fakeborn) — the library published to npm. See its README for usage, options, and limitations.
- `apps/` — applications (the docs site lands here).

## Development

```sh
bun install        # installs all workspaces (single root bun.lock)
bun run check      # lint + format + typecheck + test
bun run build      # builds packages/fakeborn (dist + type declarations)
```
