# Public QR access

Source: [issue #126](https://github.com/akifbayram/openbin/issues/126). Status: spec, not implemented.

## Problem

Scanning a bin's QR code without a session lands on the login page. A household member who only wants to see what is in a box has to have an account and log in. The existing `/s/:token` share links don't help: labels don't encode them.

## Decisions

| Topic | Decision |
| --- | --- |
| Scope | Per location. No per-bin switch, no instance-wide env var. |
| Who can change it | Location admins. |
| Default | Off. Existing locations are unaffected after upgrade. |
| Plan gating | None. Nothing we add is plan-gated. |
| What visitors see | Same fields as the share page (`server/src/routes/shared.ts`), plus child boxes. |
| Photos | Included by default. A second admin switch, `public_qr_photos`, turns them off while the rest stays public. |
| Private bins | Never exposed. A child box is judged on its own visibility. |
| Who gets the public view | Anyone without access to the bin: anonymous visitors and logged-in non-members. |
| URL | The existing `/bin/:id`, so printed labels keep working. |
| Counting | A counter on the bin, incremented per public view. |
| Call to action | A small "Log in to edit" link. No sign-up link. |

## Security model

- Bin IDs are `crypto.randomUUID()` (v4, 122 random bits). With the toggle on, the UUID is a read capability. Leaking a label or URL exposes that bin until the toggle is switched off. The settings copy must say so.
- The public endpoint is `GET` only. Every mutation still needs a session and the CSRF double-submit token, so the UUID gives no write access.
- Look up by UUID only. **Never** by `short_code`: it is name-derived from a small charset and enumerable.
- All refusals return the same 404 and the same body: toggle off, unknown ID, soft-deleted bin, private bin. Nothing may reveal which case applied.
- Response is an allowlist, not a denylist (see Public response).
- Send `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex, nofollow`, as `shared.ts` does.
- Rate-limit the endpoint with `express-rate-limit`, like the other unauthenticated routes.

## Data model

Migration `0016_public_qr_access.ts` (the schema files run before migrations, so no index belongs in `schema.*.sql`):

- `locations.public_qr_access` boolean, `NOT NULL DEFAULT false` (SQLite `INTEGER` 0/1, per `dialect.ts`).
- `locations.public_qr_photos` boolean, `NOT NULL DEFAULT true`. Only meaningful while `public_qr_access` is on; turning access off does not reset it.
- `bins.public_view_count` integer, `NOT NULL DEFAULT 0`.
- `bins.last_public_view_at` timestamp, nullable.

Add both to the Postgres migration test run (`npm run test:postgres`).

## API

### `GET /api/public/bins/:id` (unauthenticated)

Resolution, in one query:

```
bins b JOIN locations l ON l.id = b.location_id
WHERE b.id = $1
  AND b.deleted_at IS NULL
  AND b.visibility != 'private'
  AND l.public_qr_access = true
```

No row: 404 `NOT_FOUND`. Otherwise increment `public_view_count`, set `last_public_view_at` (fire-and-forget, as `shared.ts` does), and respond.

Mount outside `authenticate`. No `Cookie` or CSRF requirement because it is read-only.

### Public response

Allowlist, mirroring the share page:

- `id` (needed so the client can link to children and photos), `name`, `area_name`, `notes`, `tags`, `icon`, `color`, `card_style`, `created_at`, `updated_at`
- `items`: `{ name, quantity }[]`, not deleted, ordered by position
- `custom_fields`: `{ name, value }[]` in position order, empty values skipped (field ids are internal, so they are resolved to names server-side)
- `photos`: `{ id, filename }[]`; always `[]` when the location has `public_qr_photos` off
- `parent`: `{ id, name } | null`, only when the parent is itself public
- `children`: `{ id, name, icon, color, item_count }[]`, only children that are not deleted and not private

Never returned: `area_id`, `location_id`, `created_by`, `created_by_name`, `visibility`, the counter, `short_code`.

### Photos

`GET /api/public/bins/:id/photos/:photoId/file` and `.../thumb`, same resolution as above plus `photos.bin_id = :id` and `l.public_qr_photos = true`. With photos off they return the same 404 as any other refusal, so a known photo URL stops working the moment the switch is flipped. Keep `Cache-Control: private, max-age=3600`. Reuse the streaming and thumbnail logic in `shared.ts` (extract it so both routers share it rather than duplicating).

### Location setting

`PUT /api/locations/:id` accepts `public_qr_access: boolean` and `public_qr_photos: boolean`. Admin only (existing `requireAdmin` path). Return both in the location payload (`Location.public_qr_access` and `Location.public_qr_photos` in `src/types.ts`). Log the change in the activity log with old and new values.

## Client

### Routing

`/bin/:id` stays inside the protected route group; the route tree does not change. Instead:

1. Not logged in: `AuthGuard` matches exactly `/bin/:id` (nothing deeper) and renders a lazily loaded `PublicBinPage` for that id in place of the usual redirect to `/login`. Every other protected path still redirects. `PublicBinPage` has no app providers (no `LocationProvider`, `PlanProvider` or terminology), so it uses neutral wording rather than the location's custom terms.
2. Logged in: unchanged, `BinDetailPage`.
3. Logged in, but the authenticated fetch fails (non-member): `BinDetailPage`'s not-found branch renders `PublicBinFallback`, which tries the public endpoint and shows the read-only view inside the app shell, or the usual not-found state if the box isn't public (or the lookup failed).

(An earlier draft moved the route out of the guard into a wrapper; that needs duplicate route definitions or nested `<Routes>`, and gains nothing.)

When the public lookup 404s for an anonymous visitor they are sent to `/login?next=/bin/:id`. Only a 404 means "not public": a network or server failure shows an error page instead of a misleading login redirect.

**Login return-to.** The login page did not previously support returning anywhere, so this adds it: after password sign-in it navigates to `?next=` if the value passes `safeNextPath()` (`src/lib/safeRedirect.ts`: must start with a single `/`; rejects `//`, `/\`, control characters and the auth pages), else to `/`. OAuth/OIDC sign-in drops the parameter and lands on the dashboard.

**Old printed labels.** Nothing converts old hash-style URLs (`/#/bin/<id>`) to path URLs outside the in-app scanner, so a label of that vintage scanned with a phone camera loads `/` and never reaches the box, with or without this feature. Out of scope.

### `PublicBinPage`

Reuse the layout of `SharedBinPage` where it fits; share components rather than copying them. It shows the public response fields, children as links to `/bin/<childId>` (each opens the public view and counts), and a link to the parent when present. A small "Log in to edit" link goes to `/login?next=/bin/<id>`. No edit controls anywhere.

### Settings

Toggle in location settings (admin only): "Let anyone who scans a QR code see this location's boxes". Helper text: anyone with a label, or the link, can view the contents read-only, without logging in. Private boxes are never shown. Beneath it, a nested switch "Include photos" (on by default, shown only while the main toggle is on, admin only). Its helper text warns that photos can show the surroundings of a box, not just its contents. Add strings to `en` and `nb` locale files, using `term.bin` and `term.location` for terminology.

## Counting

`public_view_count` and `last_public_view_at` count only loads through the public endpoint. Member views are not counted. A view of a child box counts for the child only. `GET /api/bins/:id` returns `public_view_count`; the bin's information tab shows "Opened without login: N times" for members whenever it is above zero (it does not also check the location toggle: a non-zero count means public access was on at some point, and it avoids a location lookup in that tab). Keep that UI minimal.

## Tests

Server (SQLite, plus Postgres integration for the migration and queries):

- Toggle off: 404 for a valid public bin.
- Toggle on: 200 and the allowlisted shape. Assert the forbidden fields are absent.
- Private bin: 404, identical body to unknown ID.
- Soft-deleted bin: 404.
- Photos off: `photos` is `[]` and both photo routes 404, while the rest of the page still returns 200.
- Photos on: photo `file` and `thumb` stream; a photo belonging to a different bin 404s.
- Private child of a public parent: absent from `children`; direct fetch 404.
- Private parent: `parent` is null on a public child.
- `short_code` as ID: 404.
- Counter increments per view and not for members.
- Mutating routes still reject unauthenticated requests (regression).
- Setting changes (both switches): admin only; member and viewer get 403; activity logged.
- Headers present on every public response, including photos.

Client:

- Anonymous visit to `/bin/:id` renders the public page when allowed and redirects to login when not.
- Logged-in member still gets the full page.
- Logged-in non-member falls back to the public page.
- No edit controls on the public page.
- Settings toggles visible to admins only; the photos switch appears only while public access is on.
- Public page hides the photo section when `photos` is empty.

## Docs

- `server/openapi.yaml`: the new public routes and the `public_qr_access` field.
- `.env.example`: no change (no env var).
- CLAUDE.md gotcha: `/api/public/*` is unauthenticated and keyed by bin UUID; never add `short_code` lookups or mutating methods there.

## Out of scope

Per-bin overrides, per-field visibility, an instance-wide kill switch, area or location QR codes, scan analytics beyond the counter, and changing what the QR code encodes.
