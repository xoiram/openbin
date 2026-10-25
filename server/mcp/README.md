# OpenBin MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) server (stdio) that lets an MCP client
(Claude Desktop, Claude Code, ...) manage an OpenBin inventory. It is a thin wrapper over the OpenBin
REST API (`server/openapi.yaml`): every tool is one or a few API calls with text output.

Data model reminder: Location > Area > **Bin** > Items. A bin can contain one level of nested
(child) boxes. An item is inside a bin, **or** loose in an area, **or** unassigned (neither).

## Environment

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `OPENBIN_API_KEY` | yes | | API key (`sk_openbin_...`), created in Settings > API keys. Sent as a Bearer token. |
| `OPENBIN_API_URL` | no | `http://localhost:1453` | Base URL of the OpenBin server. |

The key acts as the user who created it (same location roles: admin / member / viewer).

## Build and run

```sh
cd server/mcp
npm ci
npm run build        # tsc -> dist/
npm start            # node dist/index.js (speaks MCP on stdio)
npm run dev          # tsx src/index.ts, no build step
```

Client config example:

```json
{
  "mcpServers": {
    "openbin": {
      "command": "node",
      "args": ["/path/to/openbin/server/mcp/dist/index.js"],
      "env": { "OPENBIN_API_KEY": "sk_openbin_...", "OPENBIN_API_URL": "https://your-host" }
    }
  }
}
```

## Tools

### locations.ts
- `list_locations` - locations you belong to
- `create_location` - create a location
- `update_location` - change settings (admin)
- `delete_location` - delete a location and all its data (admin)
- `join_location` - join with an invite code
- `list_location_members` - members and roles
- `remove_location_member` - remove a member (admin, or yourself)
- `update_member_role` - change a member's role (admin)
- `regenerate_invite_code` - new invite code (admin)
- `get_location_stats` - bin, item, loose item, area and needs-organizing counts

### areas.ts
- `list_areas` - areas with bin counts and loose-item counts (direct only, not items inside bins)
- `create_area` - create an area (admin)
- `rename_area` - rename an area (admin)
- `delete_area` - delete an area; its bins and loose items become unassigned (admin)

### bins.ts
- `search_bins` - filter bins (text, tags, area, `parent`, `top_level`, sort, paging); shows nesting
- `get_bin` - one bin by id or short code
- `create_bin` - create a bin, optionally nested via `parent_bin_id`
- `update_bin` - edit a bin; `parent_bin_id` nests it, `null` detaches it
- `delete_bin` - move to trash (nested boxes go with it)
- `list_trash` - trashed bins
- `restore_bin` - restore from trash
- `permanent_delete_bin` - delete a trashed bin for good
- `list_pinned_bins` / `pin_bin` / `unpin_bin` / `reorder_pinned_bins` - pins
- `add_tags` - merge tags into a bin
- `move_bin` - move a bin (with its nested boxes) to another location (admin)

### items.ts
- `search_items` - find items; says whether each is in a bin, loose in an area or unassigned; filters `area_id`, `unassigned`, `loose`
- `create_loose_item` - item in an area (or unassigned)
- `update_loose_item` - rename / change quantity of a loose item
- `delete_loose_item` - delete a loose item
- `move_items` - move items to a bin, an area or unassigned
- `add_items` - add items to a bin
- `remove_item` / `rename_item` / `reorder_items` - edit items inside a bin

### checkouts.ts
- `checkout_item` / `return_item` - check out / return an item in a bin (return can target a bin, area or unassigned)
- `checkout_loose_item` / `return_loose_item` - same for loose items (location-scoped)
- `bulk_return_checkouts` - return many checkouts at once
- `list_bin_checkouts` - active checkouts of one bin
- `list_location_checkouts` - active checkouts of a location (origin shown as bin, area or unassigned)

### tags.ts
- `list_tags` / `list_tag_colors` / `set_tag_color` / `delete_tag_color`

### batch.ts
- `batch_operations` - up to 50 operations in one request (24 operation types; bins, items-in-bins, tags, areas, checkouts). No nesting or loose-item operations.

### export.ts
- `export_location_json` - bins and their items as JSON (summarized); loose items are not part of it
- `export_location_csv` - bins and their items as CSV

### activity.ts
- `get_activity_log` - recent changes in a location

### scan-history.ts
- `get_scan_history` / `record_scan` / `clear_scan_history`

## Smoke test over stdio

There are no automated tests. Quick check that the server starts and lists its tools (the
`initialize` / `initialized` / `tools/list` handshake):

```sh
export OPENBIN_API_KEY=sk_openbin_dummy OPENBIN_API_URL=http://localhost:1453
(
  echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}'
  echo '{"jsonrpc":"2.0","method":"notifications/initialized"}'
  echo '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
  sleep 1
) | node dist/index.js 2>/dev/null | tail -1 | node -e 'const r=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(r.result.tools.map(t=>t.name).join("\n"))'
```

To exercise tools against a real server, start OpenBin (`npm run dev:server` in the repo root, port 1453),
register a user, create an API key (`POST /api/api-keys` while logged in, or Settings > API keys), set
`OPENBIN_API_KEY`, and send `tools/call` messages (`{"method":"tools/call","params":{"name":"get_location_stats","arguments":{"location_id":"..."}}}`).
