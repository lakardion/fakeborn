## Agent skills

### Issue tracker

Issues live in `lakardion/fakeborn`'s GitHub Issues and are managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout: root `CONTEXT.md` plus `docs/adr/`. See `docs/agents/domain.md`.

## Gotchas

- **`oxfmt` mangles multi-line JSX comments in MDX.** A `{/* … */}` block spanning multiple lines gets rewritten as markdown emphasis (`{/_ … _/}`), and the next `astro build` fails with `Could not parse expression with oxc: Unterminated regular expression`. Keep JSX comments in MDX **single-line** — those survive `bun run format` untouched. (Hit in #30, apps/docs Limitations page.)
