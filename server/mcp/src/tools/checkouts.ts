import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type ApiClient, withErrorHandling } from "../api-client.js";
import { resolveItemId, resolveLooseItemId } from "../resolve-item.js";
import { buildTargetBody, targetFields } from "../targets.js";

interface CheckoutListResponse {
  results: Array<{
    id: string;
    item_id: string;
    item_name: string;
    checked_out_by_name: string;
    checked_out_at: string;
  }>;
  count: number;
}

interface LocationCheckoutListResponse {
  results: Array<{
    id: string;
    item_id: string;
    item_name: string;
    origin_bin_id: string | null;
    origin_bin_name: string | null;
    origin_area_id: string | null;
    origin_area_name: string | null;
    checked_out_by_name: string;
    checked_out_at: string;
  }>;
  count: number;
}

function describeOrigin(c: LocationCheckoutListResponse["results"][number]): string {
  if (c.origin_bin_id) return `from bin "${c.origin_bin_name ?? c.origin_bin_id}"`;
  if (c.origin_area_id) return `from area "${c.origin_area_name ?? c.origin_area_id}" (loose)`;
  return "from unassigned (loose, no bin or area)";
}

export function registerCheckoutTools(server: McpServer, api: ApiClient) {
  server.tool(
    "checkout_item",
    "Check out an item from a bin. Provide item_id or item_name (not both).",
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

      await api.post(
        `/api/bins/${encodeURIComponent(bin_id)}/items/${encodeURIComponent(resolved.id)}/checkout`,
      );

      return {
        content: [
          {
            type: "text" as const,
            text: `Checked out "${resolved.name}" from bin ${bin_id}.`,
          },
        ],
      };
    }),
  );

  server.tool(
    "return_item",
    "Return a checked-out item from a bin. Without a target it goes back where it came from. Optionally return it to a different bin, to an area (loose), or to unassigned (give at most one target). Provide item_id or item_name (not both). For items that were loose, use return_loose_item.",
    {
      bin_id: z.string().describe("Origin bin ID (6-character short code)"),
      item_id: z.string().optional().describe("Item UUID"),
      item_name: z.string().optional().describe("Item name (case-insensitive match)"),
      target_bin_id: z.string().optional().describe("Return to a different bin (must be in same location)"),
      target_area_id: targetFields.target_area_id,
      unassigned: targetFields.unassigned,
    },
    withErrorHandling(async ({ bin_id, item_id, item_name, target_bin_id, target_area_id, unassigned }) => {
      const target = buildTargetBody({ target_bin_id, target_area_id, unassigned }, false);
      if ("error" in target) {
        return { content: [{ type: "text" as const, text: target.error }], isError: true };
      }
      const resolved = await resolveItemId(api, bin_id, item_id, item_name);
      if ("error" in resolved) {
        return { content: [{ type: "text" as const, text: resolved.error }], isError: true };
      }

      if (target_area_id || unassigned) {
        // The bin route only accepts a bin target; area/unassigned go through the location route.
        const bin = await api.get<{ location_id: string }>(`/api/bins/${encodeURIComponent(bin_id)}`);
        await api.post(
          `/api/locations/${encodeURIComponent(bin.location_id)}/items/${encodeURIComponent(resolved.id)}/return`,
          target.body,
        );
      } else {
        await api.post(
          `/api/bins/${encodeURIComponent(bin_id)}/items/${encodeURIComponent(resolved.id)}/return`,
          target.label ? target.body : undefined,
        );
      }

      const dest = target.label ? ` to ${target.label}` : "";
      return {
        content: [
          {
            type: "text" as const,
            text: `Returned "${resolved.name}"${dest}.`,
          },
        ],
      };
    }),
  );

  server.tool(
    "checkout_loose_item",
    "Check out a loose item (one in an area or unassigned, not in a bin). Provide item_id, or item_name for an exact case-insensitive match.",
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

      await api.post(
        `/api/locations/${encodeURIComponent(location_id)}/items/${encodeURIComponent(resolved.id)}/checkout`,
      );

      return {
        content: [{ type: "text" as const, text: `Checked out loose item "${resolved.name}".` }],
      };
    }),
  );

  server.tool(
    "return_loose_item",
    "Return a checked-out item (works for loose items; see also return_item for bin items). Without a target it goes back where it came from, or becomes unassigned if that place is gone. Optionally give one target: a bin, an area (loose), or unassigned. Provide item_id, or item_name to match among the currently checked-out items of the location.",
    {
      location_id: z.string().describe("Location UUID"),
      item_id: z.string().optional().describe("Item UUID"),
      item_name: z.string().optional().describe("Item name (exact, case-insensitive; matched among active checkouts)"),
      ...targetFields,
    },
    withErrorHandling(async ({ location_id, item_id, item_name, target_bin_id, target_area_id, unassigned }) => {
      const target = buildTargetBody({ target_bin_id, target_area_id, unassigned }, false);
      if ("error" in target) {
        return { content: [{ type: "text" as const, text: target.error }], isError: true };
      }
      if (!item_id && !item_name) {
        return { content: [{ type: "text" as const, text: "Provide either 'item_id' or 'item_name'." }], isError: true };
      }

      let id = item_id;
      let label = item_id ?? "";
      if (!id) {
        // A checked-out item is addressed by name among the location's active checkouts
        // (it is not necessarily still loose, and the fuzzy item search may not show it as such).
        const active = await api.get<LocationCheckoutListResponse>(
          `/api/locations/${encodeURIComponent(location_id)}/checkouts`,
        );
        const matches = active.results.filter(
          (c) => c.item_name.toLowerCase() === item_name!.trim().toLowerCase(),
        );
        if (matches.length === 0) {
          return { content: [{ type: "text" as const, text: `No checked-out item named "${item_name}" found.` }], isError: true };
        }
        if (matches.length > 1) {
          const list = matches.map((m) => `- ${m.item_name} [${m.item_id}] ${describeOrigin(m)}`).join("\n");
          return {
            content: [{ type: "text" as const, text: `Multiple checked-out items named "${item_name}" found. Specify item_id to disambiguate:\n${list}` }],
            isError: true,
          };
        }
        id = matches[0].item_id;
        label = matches[0].item_name;
      }

      await api.post(
        `/api/locations/${encodeURIComponent(location_id)}/items/${encodeURIComponent(id)}/return`,
        target.label ? target.body : undefined,
      );

      return {
        content: [
          {
            type: "text" as const,
            text: `Returned "${label}"${target.label ? ` to ${target.label}` : " to where it came from"}.`,
          },
        ],
      };
    }),
  );

  server.tool(
    "bulk_return_checkouts",
    "Return several checked-out items at once (see list_location_checkouts for checkout ids). Without a target each item goes back where it came from; optionally give one target (bin, area, or unassigned) for all of them.",
    {
      location_id: z.string().describe("Location UUID"),
      checkout_ids: z.array(z.string()).min(1).describe("Checkout IDs (the 'id' of each checkout, NOT the item id)"),
      ...targetFields,
    },
    withErrorHandling(async ({ location_id, checkout_ids, target_bin_id, target_area_id, unassigned }) => {
      const target = buildTargetBody({ target_bin_id, target_area_id, unassigned }, false);
      if ("error" in target) {
        return { content: [{ type: "text" as const, text: target.error }], isError: true };
      }

      const data = await api.post<{ returned: number; errors: Array<{ id: string; reason: string }> }>(
        `/api/locations/${encodeURIComponent(location_id)}/checkouts/bulk-return`,
        { checkoutIds: checkout_ids, ...target.body },
      );

      const lines = [
        `Returned ${data.returned} of ${checkout_ids.length} item(s)${target.label ? ` to ${target.label}` : " to where they came from"}.`,
      ];
      for (const e of data.errors) lines.push(`- checkout ${e.id}: ${e.reason}`);
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }),
  );

  server.tool(
    "list_bin_checkouts",
    "List active (unreturned) checkouts for a specific bin",
    {
      bin_id: z.string().describe("Bin ID (6-character short code)"),
    },
    withErrorHandling(async ({ bin_id }) => {
      const data = await api.get<CheckoutListResponse>(
        `/api/bins/${encodeURIComponent(bin_id)}/checkouts`,
      );

      if (data.results.length === 0) {
        return { content: [{ type: "text" as const, text: "No active checkouts for this bin." }] };
      }

      const lines = data.results.map(
        (c) => `- **${c.item_name}** [${c.item_id}] — checked out by ${c.checked_out_by_name} at ${c.checked_out_at}`,
      );

      return {
        content: [
          {
            type: "text" as const,
            text: `${data.count} active checkout(s):\n\n${lines.join("\n")}`,
          },
        ],
      };
    }),
  );

  server.tool(
    "list_location_checkouts",
    "List all active (unreturned) checkouts across a location, including loose items (origin shown as bin, area, or unassigned). Each line shows the checkout id and item id.",
    {
      location_id: z.string().describe("Location UUID"),
    },
    withErrorHandling(async ({ location_id }) => {
      const data = await api.get<LocationCheckoutListResponse>(
        `/api/locations/${encodeURIComponent(location_id)}/checkouts`,
      );

      if (data.results.length === 0) {
        return { content: [{ type: "text" as const, text: "No active checkouts in this location." }] };
      }

      const lines = data.results.map(
        (c) => `- **${c.item_name}** [item ${c.item_id}, checkout ${c.id}] ${describeOrigin(c)} — checked out by ${c.checked_out_by_name} at ${c.checked_out_at}`,
      );

      return {
        content: [
          {
            type: "text" as const,
            text: `${data.count} active checkout(s):\n\n${lines.join("\n")}`,
          },
        ],
      };
    }),
  );
}
