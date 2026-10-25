import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type ApiClient, withErrorHandling } from "../api-client.js";
import { type BinDetail, resolveItemId, resolveLooseItemId } from "../resolve-item.js";
import { buildTargetBody, targetFields } from "../targets.js";

/** An item lives in a bin, OR loose in an area, OR unassigned (all bin/area fields null). */
interface Item {
  id: string;
  name: string;
  quantity: number | null;
  bin_id: string | null;
  bin_name: string | null;
  bin_icon: string | null;
  bin_color: string | null;
  area_id: string | null;
  area_name: string | null;
}

function describeItemHome(item: Item): string {
  if (item.bin_id) return `in bin "${item.bin_name ?? item.bin_id}" (bin_id: ${item.bin_id})`;
  if (item.area_id) return `loose in area "${item.area_name ?? item.area_id}" (area_id: ${item.area_id})`;
  return "unassigned (not in any bin or area)";
}

interface ItemListResponse {
  results: Item[];
  count: number;
}

interface AddItemsResponse {
  items: Array<{ id: string; name: string }>;
}

export function registerItemTools(server: McpServer, api: ApiClient) {
  server.tool(
    "search_items",
    "Search items in a location. Items can be inside a bin, loose in an area, or unassigned; each result says which.",
    {
      location_id: z.string().describe("Location UUID (required)"),
      q: z.string().optional().describe("Search text (matches item, bin and area names)"),
      area_id: z
        .string()
        .optional()
        .describe("Only items located in this area UUID: loose items in the area plus items in bins in the area"),
      unassigned: z
        .boolean()
        .optional()
        .describe("true = only items with no area (unassigned loose items plus items in unassigned bins). Not with area_id."),
      loose: z
        .boolean()
        .optional()
        .describe("true = only loose items (not inside any bin). Combine with area_id or unassigned."),
      sort: z.enum(["alpha", "bin"]).optional().describe("Sort by item name or bin name"),
      limit: z.number().min(1).max(100).optional().describe("Max results (1-100, default 40)"),
      offset: z.number().min(0).optional().describe("Offset for pagination"),
    },
    withErrorHandling(async ({ location_id, q, area_id, unassigned, loose, sort, limit, offset }) => {
      if (area_id && unassigned) {
        return { content: [{ type: "text" as const, text: "Provide only one of 'area_id' or 'unassigned'." }], isError: true };
      }
      const params = new URLSearchParams({ location_id });
      if (q) params.set("q", q);
      if (area_id) params.set("area_id", area_id);
      else if (unassigned) params.set("unassigned", "true");
      if (loose) params.set("loose", "true");
      if (sort) params.set("sort", sort);
      if (limit !== undefined) params.set("limit", String(limit));
      if (offset !== undefined) params.set("offset", String(offset));

      const data = await api.get<ItemListResponse>(`/api/items?${params}`);

      if (data.results.length === 0) {
        return { content: [{ type: "text" as const, text: "No items found." }] };
      }

      const lines = data.results.map(
        (item) => `- **${item.name}**${item.quantity != null ? ` (x${item.quantity})` : ""} [${item.id}] ${describeItemHome(item)}`,
      );

      return {
        content: [
          {
            type: "text" as const,
            text: `Found ${data.count} item(s)${data.results.length < data.count ? ` (showing ${data.results.length})` : ""}:\n\n${lines.join("\n")}`,
          },
        ],
      };
    }),
  );

  // --- Loose items (in an area or unassigned, not inside a bin) ---

  server.tool(
    "create_loose_item",
    "Create an item that is not inside a bin: loose in an area, or unassigned when area_id is omitted.",
    {
      location_id: z.string().describe("Location UUID"),
      name: z.string().describe("Item name"),
      quantity: z.number().optional().describe("Quantity (omit for none)"),
      area_id: z.string().optional().describe("Area UUID to put the item in (omit for unassigned)"),
    },
    withErrorHandling(async ({ location_id, name, quantity, area_id }) => {
      const body: Record<string, unknown> = { name };
      if (quantity !== undefined) body.quantity = quantity;
      if (area_id) body.areaId = area_id;

      const item = await api.post<{ id: string; name: string; quantity: number | null; area_id: string | null; area_name: string | null }>(
        `/api/locations/${encodeURIComponent(location_id)}/items`,
        body,
      );

      const where = item.area_id ? `in area "${item.area_name ?? item.area_id}"` : "unassigned";
      return {
        content: [
          {
            type: "text" as const,
            text: `Loose item created: **${item.name}**${item.quantity != null ? ` (x${item.quantity})` : ""} [${item.id}], ${where}.`,
          },
        ],
      };
    }),
  );

  server.tool(
    "update_loose_item",
    "Rename a loose item (in an area or unassigned) or change its quantity. Provide item_id, or item_name for an exact case-insensitive match. Items inside a bin use rename_item instead. To relocate use move_items.",
    {
      location_id: z.string().describe("Location UUID"),
      item_id: z.string().optional().describe("Item UUID"),
      item_name: z.string().optional().describe("Current item name (exact, case-insensitive; must match exactly one loose item)"),
      area_id: z.string().optional().describe("With item_name: only look in this area"),
      unassigned: z.boolean().optional().describe("With item_name: only look among unassigned items"),
      name: z.string().optional().describe("New item name"),
      quantity: z.number().nullable().optional().describe("New quantity (null clears it)"),
    },
    withErrorHandling(async ({ location_id, item_id, item_name, area_id, unassigned, name, quantity }) => {
      if (name === undefined && quantity === undefined) {
        return { content: [{ type: "text" as const, text: "Provide 'name' and/or 'quantity'." }], isError: true };
      }
      const resolved = await resolveLooseItemId(api, location_id, item_id, item_name, { area_id, unassigned });
      if ("error" in resolved) {
        return { content: [{ type: "text" as const, text: resolved.error }], isError: true };
      }

      const body: Record<string, unknown> = {};
      if (name !== undefined) body.name = name;
      if (quantity !== undefined) body.quantity = quantity;

      const item = await api.put<{ id: string; name: string; quantity: number | null }>(
        `/api/locations/${encodeURIComponent(location_id)}/items/${encodeURIComponent(resolved.id)}`,
        body,
      );

      return {
        content: [
          {
            type: "text" as const,
            text: `Loose item updated: **${item.name}**${item.quantity != null ? ` (x${item.quantity})` : ""} [${item.id}].`,
          },
        ],
      };
    }),
  );

  server.tool(
    "delete_loose_item",
    "Delete a loose item (in an area or unassigned). Provide item_id, or item_name for an exact case-insensitive match. Items inside a bin use remove_item instead.",
    {
      location_id: z.string().describe("Location UUID"),
      item_id: z.string().optional().describe("Item UUID"),
      item_name: z.string().optional().describe("Item name (exact, case-insensitive; must match exactly one loose item)"),
      area_id: z.string().optional().describe("With item_name: only look in this area"),
      unassigned: z.boolean().optional().describe("With item_name: only look among unassigned items"),
    },
    withErrorHandling(async ({ location_id, item_id, item_name, area_id, unassigned }) => {
      const resolved = await resolveLooseItemId(api, location_id, item_id, item_name, { area_id, unassigned });
      if ("error" in resolved) {
        return { content: [{ type: "text" as const, text: resolved.error }], isError: true };
      }

      await api.del(
        `/api/locations/${encodeURIComponent(location_id)}/items/${encodeURIComponent(resolved.id)}`,
      );

      return {
        content: [{ type: "text" as const, text: `Loose item "${resolved.name}" deleted.` }],
      };
    }),
  );

  server.tool(
    "move_items",
    "Move items (in bins or loose) to a bin, to an area (loose in that area), or to unassigned. Provide exactly one of target_bin_id, target_area_id or unassigned: true.",
    {
      item_ids: z.array(z.string()).min(1).describe("Item UUIDs to move (see search_items)"),
      ...targetFields,
    },
    withErrorHandling(async ({ item_ids, target_bin_id, target_area_id, unassigned }) => {
      const target = buildTargetBody({ target_bin_id, target_area_id, unassigned }, true);
      if ("error" in target) {
        return { content: [{ type: "text" as const, text: target.error }], isError: true };
      }

      const data = await api.post<{ moved: number }>("/api/items/bulk-move", {
        ids: item_ids,
        ...target.body,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Moved ${data.moved} of ${item_ids.length} item(s) to ${target.label}.`,
          },
        ],
      };
    }),
  );

  server.tool(
    "add_items",
    "Add items to a bin",
    {
      bin_id: z.string().describe("Bin ID (6-character short code)"),
      items: z.array(z.string()).min(1).describe("Item names to add"),
    },
    withErrorHandling(async ({ bin_id, items }) => {
      const data = await api.post<AddItemsResponse>(
        `/api/bins/${encodeURIComponent(bin_id)}/items`,
        { items },
      );

      return {
        content: [
          {
            type: "text" as const,
            text: `Added ${data.items.length} item(s): ${data.items.map((i) => i.name).join(", ")}`,
          },
        ],
      };
    }),
  );

  server.tool(
    "remove_item",
    "Remove a single item from a bin. Provide item_id or item_name (not both).",
    {
      bin_id: z.string().describe("Bin ID (6-character short code)"),
      item_id: z.string().optional().describe("Item UUID"),
      item_name: z.string().optional().describe("Item name (case-insensitive match)"),
    },
    withErrorHandling(async ({ bin_id, item_id, item_name }) => {
      const resolved = await resolveItemId(api, bin_id, item_id, item_name);
      if ("error" in resolved) {
        return { content: [{ type: "text" as const, text: resolved.error }], isError: true };
      }

      await api.del(
        `/api/bins/${encodeURIComponent(bin_id)}/items/${encodeURIComponent(resolved.id)}`,
      );

      return {
        content: [{ type: "text" as const, text: "Item removed successfully." }],
      };
    }),
  );

  server.tool(
    "rename_item",
    "Rename an item within a bin. Provide item_id or item_name (not both).",
    {
      bin_id: z.string().describe("Bin ID (6-character short code)"),
      item_id: z.string().optional().describe("Item UUID"),
      item_name: z.string().optional().describe("Current item name (case-insensitive match)"),
      name: z.string().describe("New item name"),
    },
    withErrorHandling(async ({ bin_id, item_id, item_name, name }) => {
      const resolved = await resolveItemId(api, bin_id, item_id, item_name);
      if ("error" in resolved) {
        return { content: [{ type: "text" as const, text: resolved.error }], isError: true };
      }

      const item = await api.put<{ id: string; name: string }>(
        `/api/bins/${encodeURIComponent(bin_id)}/items/${encodeURIComponent(resolved.id)}`,
        { name },
      );

      return {
        content: [
          {
            type: "text" as const,
            text: `Item renamed to "${item.name}".`,
          },
        ],
      };
    }),
  );

  server.tool(
    "reorder_items",
    "Reorder items within a bin. Provide item_ids or item_names (not both).",
    {
      bin_id: z.string().describe("Bin ID (6-character short code)"),
      item_ids: z.array(z.string()).optional().describe("Item UUIDs in the desired order"),
      item_names: z.array(z.string()).optional().describe("Item names in the desired order (resolved to IDs via bin lookup)"),
    },
    withErrorHandling(async ({ bin_id, item_ids, item_names }) => {
      if (!item_ids && !item_names) {
        return {
          content: [{ type: "text" as const, text: "Provide either 'item_ids' or 'item_names'." }],
          isError: true,
        };
      }

      let resolvedIds = item_ids;
      if (!resolvedIds && item_names) {
        const bin = await api.get<BinDetail>(`/api/bins/${encodeURIComponent(bin_id)}`);
        const ids: string[] = [];
        for (const name of item_names) {
          const matches = bin.items.filter(
            (i) => i.name.toLowerCase() === name.toLowerCase(),
          );
          if (matches.length === 0) {
            return {
              content: [{ type: "text" as const, text: `No item named "${name}" found in this bin.` }],
              isError: true,
            };
          }
          if (matches.length > 1) {
            const list = matches.map((m) => `- ${m.name} [${m.id}]`).join("\n");
            return {
              content: [{ type: "text" as const, text: `Multiple items named "${name}" found. Use item_ids instead:\n${list}` }],
              isError: true,
            };
          }
          ids.push(matches[0].id);
        }
        resolvedIds = ids;
      }

      await api.put(
        `/api/bins/${encodeURIComponent(bin_id)}/items/reorder`,
        { item_ids: resolvedIds },
      );

      return {
        content: [{ type: "text" as const, text: `Items reordered (${resolvedIds!.length} items).` }],
      };
    }),
  );
}
