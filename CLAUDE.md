# OpenBin

AI-powered bin inventory: photo recognition fills bins, chat answers "where is X", bulk reorganize restructures storage. QR codes and manual entry also work. Multi-user web app; data in SQLite (or PostgreSQL) behind an Express API.

**Data model**: Location → Area → **Bin** → Items. The bin is the core entity ("what's in this container", not an asset tracker). A bin holds one level of child bins (`parent_bin_id`). An item lives in a bin, directly in an area ("loose"), or is unassigned. Custom fields, photos, tags and QR codes attach to bins. Shared types: `src/types.ts`.

## Architecture

- **Client**: React + TypeScript (strict) + Vite, Tailwind CSS, react-router-dom (BrowserRouter, path-based URLs). Features live in `src/features/`.
- **Server**: Express, SQLite (better-sqlite3) or PostgreSQL (pg), JWT auth. `DATABASE_URL` selects Postgres; the engine is locked after first init. SQL differences go through the `d` object in `server/src/db/dialect.ts`.
- **Open-core**: proprietary cloud code lives in `src/ee/` (see `src/ee/LICENSE`) and is reached through the compile-time global `__EE__` (set by `BUILD_EDITION=cloud`). Pattern: `const X = __EE__ ? lazy(() => import('@/ee/X')) : (() => null) as React.FC<…>`. `npm run dev:cloud:all` builds with it; `npm run dev:all` leaves EE as no-ops. Plans, billing and Pro-gating are upstream; don't add plan gates to new features.
- **Docker**: single container; Express serves the static frontend and the API.
- Tooling: one root `biome.json` for `src/` and `server/src/`. No ESLint or Prettier.

## Conventions

- Named exports only (except `App.tsx`). Path alias `@/*` → `src/*`.
- **Feature hooks**: each feature exposes a data hook (e.g. `useBinList` → `{ bins, isLoading }`) using `apiFetch()` with event-based refresh, plus plain async functions for mutations, in the same file.
- **List fetching**: prefer `useListData` / `usePaginatedList` / `usePagedList` from `lib/useListQuery.ts` over hand-rolled `useEffect` fetches.
- **Dialogs**: lazy-mount bodies with `useMountOnOpen(isOpen)`.
- **Events**: `notify()` / `useRefreshOn()` from `lib/eventBus.ts`.
- **i18n**: `useTerminology()` → destructure as `term`, never `t` (collides with i18next). See `docs/i18n.md`.
- **API**: lists return `{ results, count }`; errors `{ error: "CODE", message }`. Spec in `server/openapi.yaml`. Routes `throw new ValidationError(...)` (`server/src/lib/httpErrors.ts`) inside `asyncHandler()`.
- Icons from `lucide-react`. Mobile-first; breakpoint `lg` (1024px).
- Soft deletes: `DELETE /api/bins/:id` sets `deleted_at`; every bin query filters `deleted_at IS NULL`.
- Roles: `admin`, `member`, `viewer` (viewers are read-only). Client: `usePermissions()`. Server: `requireMemberOrAbove()`. AI streaming endpoints require `requireLocationMemberOrAbove`.

## Gotchas

- **Item queries**: use `ITEM_FROM` and `itemScopePredicate()` from `server/src/lib/itemQueries.ts`. Never `JOIN bins` for items: loose items have no box and drop out silently.
- **`bin_items.location_id` is NOT NULL**: set it on every insert, loose items included.
- **Nested boxes**: depth ≤ 2; child area and visibility follow the parent (a child may be more private, never less); children trash with the parent. Every writer of `area_id`, `visibility`, `deleted_at` or `parent_bin_id` must go through `server/src/lib/binHierarchy.ts`. `findHierarchyViolations()` is the test checker. See `docs/nested-boxes.md`.
- **Schema vs migrations**: `schema.*.sql` runs before migrations on every start, so indexes on newly added columns belong in a migration, not the schema files (see `NESTED_BOXES_INDEXES_*` in `0015_nested_boxes.ts`).
- **Postgres**: server unit tests run on SQLite only. Migration or query changes also need `cd server && npm run test:postgres` (`*.postgres.integration.test.ts`).
- **`html5-qrcode`** is ~330KB gzipped: always dynamic-import the scanner page.
- **Route mounting**: photos upload on the bins router (`POST /api/bins/:id/photos`), export is at `/api`, areas are under `/api/locations` (not `/api/areas`).
- **Thumbnails** are generated off the main thread by a `piscina` pool (`server/src/lib/thumbnailPool.ts`). Never run Sharp on the main thread: it blocks the event loop.
- **QR URLs**: the in-app scanner regex (`BIN_URL_REGEX` in `lib/qr.ts`) accepts both old hash URLs and path URLs. Nothing else converts hash URLs, so a hash-style label scanned with a phone camera never reaches the box. `/bin/:id` is the URL printed labels use: keep it working, including for anonymous visitors (`AuthGuard` renders the public view there).
- **Photos** are served via the API (`getPhotoUrl(id)` → `/api/photos/${id}/file`), authenticated by httpOnly cookies, never a query param.
- **`/api/public/*` is unauthenticated** and keyed by bin UUID (`server/src/routes/publicBins.ts`, spec in `docs/public-qr-access.md`). Never look boxes up there by `short_code`, never add a mutating method, and return fields by allowlist.
- **Export** streams large JSON with `res.write()`: don't buffer the response (`server/src/routes/export.ts`).
- **Attachments**: `ATTACHMENTS_ENABLED=false` makes every attachments route 404; the client reads the flag from `/api/auth/status`.
- **Env vars**: parsed and validated in `server/src/lib/config.ts`; full list in `.env.example`.
- **Docker**: the container runs as `node` (uid 1000), so mounted volumes must be owned by 1000:1000. Set `DATABASE_PATH=/data/openbin.db` (also locates `.jwt_secret`, even on Postgres) and `JWT_SECRET` explicitly. Set `CORS_ORIGIN` to the production URL (default is the dev origin).
- **`docs/` is gitignored but its files are tracked**: add new ones with `git add -f`.

## Security

- **CSRF**: double-submit cookie (`server/src/lib/csrf.ts`). `apiFetch()` sends the header; mutating requests without a matching cookie and header are rejected.
- **Auth**: JWT or API keys (`sk_openbin_` prefix); `req.authMethod` is `'jwt' | 'api_key'`.
- **SSRF**: AI provider calls use an `undici` Agent with DNS pinning (`server/src/lib/aiCaller.ts`). Self-hosted mode allows local endpoints such as Ollama.
- **AI key encryption**: AES-256-GCM when `AI_ENCRYPTION_KEY` is set, plaintext otherwise.
- **Registration**: `REGISTRATION_MODE` is `open`, `invite` or `closed`.
- **OIDC**: generic OIDC (`OIDC_ISSUER_URL`, must be `https://`) works self-hosted; Google and Apple are cloud-only. **`REQUIRE_OIDC_LOGIN=true` disables all password auth, so the admin must first link an OIDC identity under Settings → Account → Connected Accounts.** There is no recovery except unsetting the env var and restarting.
- **Account deletion** is two-stage: always go through `requestDeletion()` in `server/src/lib/accountDeletion.ts` (soft delete, grace period, then `userCleanup`). Never delete a user row directly.

## Commands

```sh
npm install && cd server && npm install   # deps
npm run dev:all                           # API (1453) + Vite (5173)
npm run check                             # frontend + server type check
npx biome check .                         # lint & format
npx vitest run path/to/test               # frontend (happy-dom; mock apiFetch and useAuth)
cd server && npx vitest run               # server tests
npx vite build                            # production build
```

- Tests live in `__tests__/` next to the code.
- Run `npm run check` and `npx biome check .` before committing.
- Commit prefixes take no parentheses: `feat: description`, not `feat(area): description`.
- The commit hooks need Node from mise: set `MISE_NODE_VERSION=24`.
- When compacting context, keep the list of modified files and any failing test output.
