This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Repository layout

This is an npm workspaces monorepo:

- `apps/mobile` — the Expo app (`@unicore/mobile`). All Expo and EAS paths below are relative to it.
- `packages/shared` — `@unicore/shared`: domain models, catalog, invite validation and error codes. Shipped as TypeScript sources without a build step; the future server will use it too, so it must not depend on Expo or React Native.
- `apps/api` — the future TypeScript server (see "Backend migration" below).
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

## Backend migration (in progress)

The project is moving from Supabase to its own TypeScript server in a monorepo (`apps/mobile`, `apps/api`, `packages/shared`). Stages, tasks, progress and the verification step for each task live in `docs/backend-migration.md`. Read it before touching backend or data-layer code. Tick a task only after its verification passes, then update the stage counter in the progress table and add a journal entry.

## Rules

- If `apps/mobile/ios/` and `apps/mobile/android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `apps/mobile/app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
