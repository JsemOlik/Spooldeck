# Contributing to Spooldeck

Thanks for helping out! Bug reports, fixes, new label presets and ideas are all welcome.

Spooldeck is a self-hosted app for one person's filament shelf. Changes that keep it small, fast to run on a home server and pleasant on a phone fit best. If you're planning something big, like multi-user support or a new integration, open an issue first so we can agree on the approach before you spend time on it.

## Reporting bugs

Open an [issue](https://github.com/jsemolik/spooldeck/issues) and include:

- the commit or version you're running, and whether it's Docker or `bun run dev`
- what you did, what you expected and what happened instead
- relevant lines from the server log (`docker compose logs spooldeck`) or the browser console

Leave out anything private: your `DATABASE_URL`, passwords, the setup code and session cookies.

**Security issues:** please don't open a public issue. Email [hello@jsemolik.dev](mailto:hello@jsemolik.dev) with a description and steps to reproduce, and please allow time for a fix to be released before sharing details publicly.

## Development setup

You need [bun](https://bun.sh) and a PostgreSQL database. The quickest way to get a database without Docker is the embedded one:

```bash
bun install
bun run db:dev
```

Then copy `.env.example` to `.env.local` and set:

```
DATABASE_URL=postgres://postgres@localhost:5432/postgres
DATABASE_POOL_MAX=1
```

In a second terminal:

```bash
bun run dev
```

Open http://localhost:3000/setup and enter the setup code printed in the terminal. The [Development section of the README](README.md#development) covers using a Docker Postgres instead.

Live camera scanning needs HTTPS or `localhost`. To try it on your phone, expose the dev server over HTTPS (for example with `bun run dev --experimental-https` or a tunnel), or use "Scan from a photo", which works on plain HTTP.

## Project layout

| Path                 | What lives there                                                               |
| -------------------- | ------------------------------------------------------------------------------ |
| `src/app/`           | Routes (App Router). `(app)` is everything behind login, `(auth)` login/setup. |
| `src/actions/`       | Server Actions, one file per area. All mutations go through these.             |
| `src/db/schema.ts`   | Drizzle schema. `src/db/queries/` holds the read queries used by pages.        |
| `src/server/`        | `services/` holds the mutations shared by Server Actions and the JSON API. `printer-sync.ts` is the background loop that polls printers; the Moonraker and PrusaLink clients are in `src/lib/printers/`. |
| `src/lib/`           | Logic without UI: Prusament import, G-code parsing, the Moonraker client, weights and costs, backups. |
| `src/lib/auth/`      | Password hashing, sessions and `requireUser()`.                                |
| `src/components/ui/` | shadcn/ui building blocks. Feature components sit in sibling folders.          |
| `drizzle/`           | Generated SQL migrations, applied automatically on startup.                    |
| `scripts/`           | `reset-password`, which sets a new password when you are locked out.           |
| `test/`              | `bun test` suites. They start their own in-memory Postgres (PGlite).           |

## Guidelines

- **Next.js 16 is newer than most tutorials.** Some APIs and conventions changed (for example `proxy.ts` instead of `middleware.ts`). When in doubt, check the docs bundled in `node_modules/next/dist/docs/`.
- **Every Server Action and data route checks auth.** Start with `await requireUser()` and validate input with zod before touching the database. The proxy only checks that a cookie exists; it isn't the security boundary. (`/api/health` is the one public route.)
- **Database changes need a migration.** Edit `src/db/schema.ts`, run `bun run db:generate` and commit the new file in `drizzle/`. Never edit a migration that's already on `main`; people's databases have run it.
- **Postgres returns `count(*)` and `sum()` as strings.** Add `.mapWith(Number)` to aggregate `sql` expressions so the UI gets numbers.
- **Design for the phone first.** Scanning happens on a phone, so check new screens at ~390 px wide as well as on desktop, and in both light and dark mode.
- **Use bun.** Add packages with `bun add` so `bun.lock` stays the only lockfile.
- **Add tests for logic.** Anything in `src/lib/` or a database query with calculations should get a test in `test/`. UI-only changes don't need one, but a screenshot in the PR helps.

## Before opening a pull request

Make sure these pass:

```bash
bun run lint
bun run typecheck
bun test
bun run build
```

Keep each pull request to one change. If you notice something unrelated along the way, a separate PR is easier to review.

## Commit messages

The project uses [Conventional Commits](https://www.conventionalcommits.org). Look at `git log` for the style, for example:

```
feat(scan): toggle the flashlight while scanning
fix(db): let scripts close the connection pool
docs: add a contributing guide
```

Common types are `feat`, `fix`, `refactor`, `docs`, `test`, `build` and `chore`, with an optional scope like `spools`, `labels`, `scan`, `db`, `ui` or `docker`. Mark breaking changes with `!` (e.g. `refactor(db)!:`) and explain the upgrade path in the commit body.

## License

Spooldeck is licensed under the [GNU GPL v3.0](LICENSE). By contributing, you agree that your contributions are licensed under the same terms.
