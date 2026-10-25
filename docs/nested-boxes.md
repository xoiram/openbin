# Nested boxes and items in areas

Status: **in progress**. PR 1 (server core) and PR 2 (export/import, AI awareness, MCP, API docs) are merged; the nested-box UI and the area/loose-item UI are still to build (see "Remaining"). This extends `Location → Area → Bin → Item` in two ways:

1. a box can contain one more level of boxes (a "child box"),
2. an area can contain items directly ("loose items"), without a box.

User-facing nouns stay admin-configurable ("bin"/"box" etc. via `useTerminology()`); this document says "box" and "bin" interchangeably.

## Decisions

| Topic | Decision |
|---|---|
| What a nested box is | A full box with a new `parent_bin_id`: own QR/short code, photos, items, tags, custom fields, pin, share. |
| Depth | A child cannot have children. Invalid nesting is **blocked with a clear 4xx** (no auto-flatten). |
| Child's area | Always equals the parent's. A child's area cannot be set directly; moving the parent moves its children. |
| Loose items | An item has a box **or** an area **or neither** ("unassigned in the location", mirroring unassigned boxes). Deleting an area leaves its loose items unassigned. |
| Loose item features | Full parity with box items from day one: checkout/return, shopping list, search, AI "where is X", export, batch API. |
| Areas | Unchanged: already nest to any depth via `areas.parent_id`. |
| Deleting a parent | Trashes its children with it (same timestamp); restoring the parent restores them. |
| Lists/search/scan | Child boxes appear everywhere, labelled "inside {parent}"; a filter can hide them. |
| Privacy | Children inherit the parent's visibility and can't be more public. Loose items are never private. |
| AI | Aware first: results show the full path; context lists child boxes and loose items. Photo analysis and reorganize stay top-level only. |
| Naming | Same noun, "inside {parent}". No new terminology setting. |
| Compatibility | Additive. Old API calls, MCP tools, exports and backups keep working; the export format version is bumped. |
| UI | Reuse existing pages with filters. No new area page. |
| Rollout | Always on, no per-location setting. |
| Plan limits | Every box, children included, counts toward `maxBins`. |

### Defaults for behavior we did not discuss (change if wrong)

1. Restoring a child whose parent is still in the trash is blocked ("restore the parent first").
2. An AI command or bulk "move to area" targeting a child box is rejected.
3. A parent's public share link does not show its children (first version).
4. Returning a checkout whose original area was deleted lets the user pick a new place; "unassigned" is allowed.
5. Activity log entries record parent changes and loose-item moves under the item or box, as today.

## Data model

| Change | Detail |
|---|---|
| `bins.parent_bin_id` | Nullable `REFERENCES bins(id) ON DELETE CASCADE`, indexed. |
| `bin_items.bin_id` | Becomes nullable. |
| `bin_items.area_id` | New, nullable, `REFERENCES areas(id) ON DELETE SET NULL`. |
| `bin_items.location_id` | New, `NOT NULL`, backfilled from the item's box. An unassigned item has neither box nor area, so it needs its own location for scoping and permission checks. |
| `bin_items` constraint | `CHECK (bin_id IS NULL OR area_id IS NULL)`. |
| `item_checkouts` | `origin_bin_id` / `return_bin_id` become nullable; add `origin_area_id` / `return_area_id`. |
| `shopping_list_items` | Add `origin_area_id`. |

A child box keeps its own `bins.area_id`, always equal to its parent's. Existing area filters, counts and `area_name` keep working untouched. Changing a parent's area updates its children in the same transaction.

Privacy: a child of a private box is private; making a parent private makes its children private; moving a box into a private parent makes it private. Child boxes can't be made public while their parent is private.

### Invariants (checked in tests after every write path)

- depth ≤ 2: a box with a parent has no children, and a parent has no parent
- a child's `area_id` equals its parent's
- no public child under a private parent
- no live (non-trashed) child under a trashed parent
- parent and child are in the same location

Every write path that changes these fields goes through one helper, `server/src/lib/binHierarchy.ts`: box create/update/move routes, bulk move, batch and AI command handlers, the reorganize apply step, import and restore, area deletion. Reorganize leaves child boxes out of its candidates.

## Migration safety

- SQLite cannot drop `NOT NULL`, so `bin_items` and `item_checkouts` are rebuilt. SQLite runs with `foreign_keys = ON` and `item_checkouts.item_id` cascades from `bin_items`: a naive rebuild would delete all checkout history. The migration reuses the FK-off, transaction, `foreign_key_check` pattern from `0010_relax_created_by_fks.ts`.
- Row counts of `bin_items`, `item_checkouts` and `shopping_list_items` are asserted unchanged by a test on a populated database.
- Server tests run on SQLite only and CI had no Postgres service: a Postgres CI job covers the migration and a smoke test.

## API (additive)

- **Boxes:** `parent_bin_id` on create/update; responses add `parent_bin_id`, parent name and child count; lists accept `?parent=` and `?top_level=`.
- **Items:** responses gain `area_id`, `area_name` and a nullable `bin_id`; new endpoint to create an item in an area; move endpoint with a box, area or no target; items list accepts `?area_id=` and `?unassigned=`. New item endpoints get the same location-membership and viewer checks as box routes.
- **Checkouts / shopping list:** accept and return an area as origin or return place.
- OpenAPI and the MCP tools are updated; existing clients keep working.

**Main regression risk:** most of the ~80 `bin_items` queries join `bins`. Turning them into `LEFT JOIN`s makes any `WHERE b.deleted_at IS NULL` / `b.visibility …` silently drop loose items. Item queries go through one shared helper, and tests assert that loose and unassigned items appear in: the items list and search, AI context and "where is X", checkouts, the shopping list, export, admin counts.

## Export / import

- Boxes reference their parent by **short code** (merge import matches boxes by short code and ignores ids); parents are imported before children.
- Loose items are exported under their area's path.
- The export format version is bumped (the ZIP export is at `version: 3`, the JSON types at V2: check which one first). Old exports still import.

## AI (aware first)

Search and chat results include the full path ("Garage › Shelf A › Toolbox › Parts box"); AI context lists child boxes and loose items. Photo analysis and reorganize still create and move top-level boxes only.

## Frontend

- Box form: "Inside box" picker offering only valid targets; a child shows its inherited area read-only.
- Box page: breadcrumb (Area › Parent › This) and an "Inside this box" section with an add button.
- Lists/cards: "inside {parent}" label and a toggle to hide nested boxes.
- Areas: cards show "3 boxes · 5 items", linking to the box list and items list filtered by area. The items list gets a location column (box or area).
- Item move dialog: targets are a box, an area or unassigned. Checkouts and the shopping list show the origin as a box or an area.
- Every new string goes into en and nb in the same PR (the i18n lint baseline is empty, so CI enforces it).

## PRs (merge in this order)

1. **Schema and server core**: migration (SQLite and Postgres), `binHierarchy.ts`, box and item routes, checkouts, shopping list, counts, shared item-query helper, invariant test, Postgres CI job.
2. **Export, import, backup, MCP, batch/command handlers, AI context and paths, `openapi.yaml`.**
3. **Frontend, boxes**: types, parent picker, breadcrumb, child section, card labels and filters.
4. **Frontend, areas and items**: loose items, area counts, move dialogs, checkout and shopping list display.
5. **Docs**: the "items exist only inside a bin" line in `CLAUDE.md`, the demo seed.

Every PR is audited with `git diff --name-status origin/main` for unexpected deletions before merging.

## PR 1 implementation notes

Decisions made while building the server core that the plan above didn't settle:

- **API shape.** Boxes: `parentBinId` on create/update (`null` takes a box out of its parent); `parent`/`top_level` list filters; responses carry `parent_bin_id`, `parent_bin_name`, `child_count`. Items: `GET /api/items` rows have nullable box fields plus `area_id`/`area_name`; new `POST/PUT/DELETE /api/locations/:loc/items[/:itemId]` for items outside a box; checkout/return also at `/api/locations/:loc/items/:itemId/{checkout,return}`; bulk move takes exactly one of `targetBinId`, `targetAreaId` or `unassigned: true`.
- **Area filter.** `GET /api/items?area_id=` matches an item's *effective* area: items in the area itself plus items in boxes located there. `loose=true` narrows to items not in a box, so unassigned loose items are `unassigned=true&loose=true`. An area's `item_count` counts only items directly in it, so a card linking to the filtered list shows a different number; settle this in the area UI PR.
- **Returning a checked-out item** (default, no target) goes back to where it came from, even if it was moved while checked out, and falls back to unassigned when the origin is gone, trashed or private to someone else. (Previously a return into a missing box failed.)
- **Shopping list purchase** re-adds the item to the origin box or area; an entry with no origin, or whose origin box is trashed or hidden, is just removed as before. A deleted area clears `origin_area_id` through the foreign key, so such an entry looks like one without an origin.
- **Restoring a parent** checks the plan's box limit for the parent plus the children that come back with it.
- **Duplicating** a child makes a sibling under the same parent; duplicating any other box makes a top-level copy without children. Moving a parent to another location takes its children and its items' `location_id` along; a child can't be moved on its own.
- **Known limitation.** Children are restored with their parent by matching `deleted_at`, which has one-second resolution. A child trashed on its own and then its parent within the same second is restored with the parent. A proper fix needs a restore marker.
- **Not seeded.** The demo data contains nested boxes but no loose or unassigned items yet.

### Follow-ups for the frontend PRs
- Re-add loose and unassigned items to the demo seed once the UI shows them.
- PR 1 only hardens the existing item, checkout and shopping-list screens so a boxless item doesn't crash them; area UI, item move targets and nested-box UI are PRs 3 and 4.

## PR 2 implementation notes

- **Reorganize safety (merged first).** `assertTopLevelIds` rejects child boxes on both reorganize routes (422); the reorganize page and its selection only offer top-level boxes; apply never deletes a box that has children (it empties and keeps it). AI answer enrichment no longer returns other users' private boxes and takes name/area from the database, not the model.
- **Export/import (format version 4).** JSON `version` and the ZIP manifest are 4; importers accept 2..4 (missing = legacy), 422 otherwise. Child boxes carry `parentShortCode` (omitted when the parent isn't in the export); loose items are `areas[].items` and `unassignedItems`; CSV encodes loose items as rows with an empty Bin Name and keeps child boxes flat. Import resolves parents in a second pass through one shared planning function (dry run == import); unresolvable children are skipped and counted, never flattened. Merge skips loose items that already exist (same name, same area); replace also removes loose and unassigned items. Checkouts and the shopping list are not exported. Backup/restore is physical, and restore re-runs the migrations.
- **AI awareness.** Answers show `Area › Parent box › Box` paths (`binPath.ts`). The deterministic planner also returns loose items (`kind: 'loose_item'`, at most 10, never private, read-only in the UI); the legacy and command paths stay box-only. The model context lists child boxes (`parent_bin_code`) and loose items (read-only, capped, counted in the token budget). Commands cannot change loose items yet (no action handler can address an item without a box); prompts say so.
- **MCP 1.1.0.** 55 tools: null-safe output for boxless items, parent/child and loose-item tools, `move_items`, loose checkout/return, location stats; batch lists all 24 server action types (no nesting or loose items in batch).
- **OpenAPI/CLAUDE.md.** All PR 1 and PR 2 API changes are documented; `CLAUDE.md` data-model line corrected.

### Remaining
- **PR 3, nested-box UI:** parent picker on create/edit, breadcrumb and "Inside this box" section on the box page, "inside {parent}" labels and a hide-nested toggle in lists, bulk "move into box".
- **PR 4, area/loose-item UI:** create/edit items in an area, area cards with counts and filtered links (settle the area-count vs. area-filter difference), items list location column, move dialogs with box/area/unassigned targets, checkout/return for loose items, shopping-list display, loose-item actions in Ask AI results, loose items in the demo seed.
- **Known limitations:** CSV flattens child boxes; a child trashed in the same second as its parent is restored with it; batch/AI can't create nested boxes; a child count on the AI `delete_bin` preview.
- **Pre-existing, found on the way:** replace-import deletes other users' private boxes that were never exported; export allows 5000 boxes but import rejects > 2000; an import with custom-field values but no definitions fails entirely; the root `npm run build` fails because `public/api-docs/openapi.yaml` is a symlink and `cp` refuses to copy a file onto itself.
