This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Repository layout

This is an npm workspaces monorepo:

- `apps/mobile` — the Expo app (`@unicore/mobile`). All Expo and EAS paths below are relative to it.
- `packages/shared` — `@unicore/shared`: domain models, catalog, invite validation and error codes. Shipped as TypeScript sources without a build step; the server uses it too, so it must not depend on Expo, React Native or Nest. The built server runs these files with Node's type stripping, so relative imports end in `.ts`, types are imported with `import type`, and only erasable syntax is allowed (no `enum`, `namespace` or parameter properties).
- `apps/api` — the NestJS 12 server (`@unicore/api`), being built stage by stage (see "Backend migration" below).
- Root `supabase/`, `scripts/seed*.mjs` and `tests/` — the current Supabase backend and its tests; they stay until stage 9 of the migration.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

Run Expo commands from `apps/mobile`:

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

`npx expo install` looks packages up in the npm registry, so it cannot add a workspace package: add it to `package.json` as `"@unicore/shared": "*"` and run `npm install` from the repository root.

Run from the repository root:

```bash
npm ci          # install all workspaces; there is a single package-lock.json at the root
npm start       # start the app (forwards to apps/mobile)
npm run check   # typecheck, lint and tests in every workspace, plus the Supabase tests
```

Run `npm run check` from the repository root before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `apps/mobile/src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Run EAS CLI from `apps/mobile`, where `eas.json` lives. EAS uploads the whole repository and reads `.easignore` only from the repository root; it replaces every `.gitignore`, so add new ignore rules to both files.
Docs: https://docs.expo.dev/eas/index.md

## Server (`apps/api`, NestJS 12)

NestJS 12 is likely newer than your training data: it moved to ESM, validates with Standard Schema (zod) instead of class-validator, and changed its builders. Read the docs before writing server code — https://docs.nestjs.com/llms.txt indexes them with a markdown page per chapter. Check Nest's first-party packages (config, throttler, schedule, drizzle, mail, storage, terminus…) before adding another library.

- The project is ESM: relative imports end in `.js`, there is no `__dirname` (use `import.meta.dirname`), mocks are `vi.fn()`.
- Validate input with `@Body({ schema })`, `@Query({ schema })` and `@Param('id', { schema })` using schemas from `packages/shared/src/api` (a failed check is 422 `UNICORE_INVALID_INPUT`). Schemas check the shape and single-field limits; a rule with its own error code (`UNICORE_WEAK_PASSWORD`, `UNICORE_INVALID_TAGS`, `UNICORE_PAST`…) or one that needs the database belongs in the service.
- A new error code goes to `errorStatus` in `packages/shared/src/api/errors.ts` and gets a Russian text in `packages/shared/src/errors.ts` (the typecheck fails without it).
- `src/app.setup.ts` holds the HTTP setup shared by `main.ts` and the tests; add global pipes, filters and middleware there, not in `main.ts`.
- Environment variables are validated by the zod schema in `src/config/env.ts`; add new ones there and to `apps/api/.env.example`.
- The database is Drizzle 1.0 (an RC: read https://orm.drizzle.team/llms.txt, the 0.x API differs) on Postgres when `DATABASE_URL` is set, otherwise on PGlite in `apps/api/.local/pgdata`. The schema is `src/db/schema.ts`; after changing it run `db:generate` and commit the new folder in `apps/api/drizzle/`, never edit an applied migration. Services take the database with `@InjectDrizzle()` from `@nestjs/drizzle`, typed as `Db` from `src/db/database.ts`.
- The server applies pending migrations at startup. PGlite allows one process per data folder: run `db:migrate` against it only while the server is stopped.
- `@electric-sql/pglite` stays on 0.5.x (PostgreSQL 18) in every workspace: 0.6 ships PostgreSQL 19 and can't open a 0.5 data folder.

```bash
npm -w apps/api run start:dev   # watch mode with SWC; needs apps/api/.env (copy .env.example)
npm -w apps/api run build       # SWC build to apps/api/dist
npm -w apps/api run start       # run the build
npm -w apps/api run check       # typecheck, oxlint, unit and e2e tests
npm -w apps/api run db:generate # SQL migration from changes in src/db/schema.ts
npm -w apps/api run db:migrate  # apply migrations (PGlite: only with the server stopped)
npm -w apps/api run db:check    # consistency of the migration history

# optional Postgres 18 on 127.0.0.1:5432 (user, password and database: unicore)
docker compose -f apps/api/docker-compose.dev.yml up -d --wait
```

## Backend migration (in progress)

The project is moving from Supabase to its own TypeScript server in a monorepo (`apps/mobile`, `apps/api`, `packages/shared`). Stages, tasks, progress and the verification step for each task live in `docs/backend-migration.md`; the target server architecture (NestJS modules, database schema, auth flows, diagrams) lives in `docs/backend-architecture.md`. Read both before touching backend or data-layer code, and update the architecture doc when a design decision changes. Tick a task only after its verification passes, then update the stage counter in the progress table and add a journal entry.

## Rules

- If `apps/mobile/ios/` and `apps/mobile/android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `apps/mobile/app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
