import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type ApiClient, withErrorHandling } from "../api-client.js";

interface Area {
  id: string;
  name: string;
  location_id: string;
  parent_id?: string | null;
  bin_count?: number;
  descendant_bin_count?: number;
  item_count?: number;
  descendant_item_count?: number;
  created_at: string;
}

interface ListResponse {
  results: Area[];
  count: number;
  unassigned_count?: number;
}

export function registerAreaTools(server: McpServer, api: ApiClient) {
  server.tool(
    "list_areas",
    "List all areas within a location with counts. Bin counts include nested (child) boxes. 'loose items' counts only items placed directly in the area (not inside bins); use search_items with area_id to see everything located in an area.",
    { location_id: z.string().describe("Location UUID") },
    withErrorHandling(async ({ location_id }) => {
      const data = await api.get<ListResponse>(
        `/api/locations/${encodeURIComponent(location_id)}/areas`,
      );

      if (data.results.length === 0) {
        return { content: [{ type: "text" as const, text: "No areas found in this location." }] };
      }

      const lines = data.results.map((area) => {
        const counts: string[] = [];
        if (area.bin_count !== undefined) {
          const sub = area.descendant_bin_count !== undefined && area.descendant_bin_count !== area.bin_count
            ? ` (${area.descendant_bin_count} including sub-areas)`
            : "";
          counts.push(`${area.bin_count} bin(s)${sub}`);
        }
        if (area.item_count !== undefined) {
          const sub = area.descendant_item_count !== undefined && area.descendant_item_count !== area.item_count
            ? ` (${area.descendant_item_count} including sub-areas)`
            : "";
          counts.push(`${area.item_count} loose item(s) directly in the area, not counting items inside bins${sub}`);
        }
        const parent = area.parent_id ? `, parent area: ${area.parent_id}` : "";
        return `- **${area.name}** (id: ${area.id}${parent})${counts.length ? ` — ${counts.join("; ")}` : ""}`;
      });
      if (data.unassigned_count !== undefined) {
        lines.push(`\n${data.unassigned_count} bin(s) have no area (unassigned).`);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Found ${data.count} area(s):\n\n${lines.join("\n")}`,
          },
        ],
      };
    }),
  );

  server.tool(
    "create_area",
    "Create a new area within a location (admin only)",
    {
      location_id: z.string().describe("Location UUID"),
      name: z.string().describe("Area name"),
    },
    withErrorHandling(async ({ location_id, name }) => {
      const area = await api.post<Area>(
        `/api/locations/${encodeURIComponent(location_id)}/areas`,
        { name },
      );

      return {
        content: [
          {
            type: "text" as const,
            text: `Area created successfully!\n\n- **${area.name}** (id: ${area.id})`,
          },
        ],
      };
    }),
  );

  server.tool(
    "rename_area",
    "Rename an existing area (admin only)",
    {
      location_id: z.string().describe("Location UUID"),
      area_id: z.string().describe("Area UUID"),
      name: z.string().describe("New area name"),
    },
    withErrorHandling(async ({ location_id, area_id, name }) => {
      const area = await api.put<Area>(
        `/api/locations/${encodeURIComponent(location_id)}/areas/${encodeURIComponent(area_id)}`,
        { name },
      );

      return {
        content: [
          {
            type: "text" as const,
            text: `Area renamed successfully!\n\n- **${area.name}** (id: ${area.id})`,
          },
        ],
      };
    }),
  );

  server.tool(
    "delete_area",
    "Delete an area (admin only). Sub-areas are deleted with it. Bins and loose items in the deleted areas become unassigned (they are not deleted).",
    {
      location_id: z.string().describe("Location UUID"),
      area_id: z.string().describe("Area UUID"),
    },
    withErrorHandling(async ({ location_id, area_id }) => {
      await api.del(
        `/api/locations/${encodeURIComponent(location_id)}/areas/${encodeURIComponent(area_id)}`,
      );

      return {
        content: [{ type: "text" as const, text: "Area deleted (with any sub-areas). Any bins and loose items that were in them are now unassigned." }],
      };
    }),
  );
}
