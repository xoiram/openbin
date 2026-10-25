import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type ApiClient, withErrorHandling } from "../api-client.js";

interface ExportPhoto {
  id: string;
  filename: string;
  mimeType: string;
}

interface ExportBin {
  id: string;
  name: string;
  location: string;
  items: Array<string | { name: string; quantity?: number | null }>;
  notes: string;
  tags: string[];
  icon: string;
  color: string;
  shortCode: string;
  parentShortCode?: string | null;
  createdAt: string;
  updatedAt: string;
  photos: ExportPhoto[];
}

interface ExportData {
  version: number;
  exportedAt: string;
  locationName: string;
  bins: ExportBin[];
}

function formatItem(item: string | { name: string; quantity?: number | null }): string {
  if (typeof item === "string") return item;
  return item.quantity != null ? `${item.name} (x${item.quantity})` : item.name;
}

export function registerExportTools(server: McpServer, api: ApiClient) {
  server.tool(
    "export_location_json",
    "Export the bins in a location (with their items) as JSON and summarize them. Covers bins only: nested boxes appear as their own bins; items that are loose in an area or unassigned (not inside any bin) are not included.",
    {
      location_id: z.string().describe("Location UUID"),
    },
    withErrorHandling(async ({ location_id }) => {
      const data = await api.get<ExportData>(
        `/api/locations/${encodeURIComponent(location_id)}/export`,
      );

      const summary = [
        `**${data.locationName}** — exported ${data.bins.length} bin(s)`,
        `Exported at: ${data.exportedAt}`,
      ];

      for (const bin of data.bins) {
        const parts = [`- **${bin.name}** (${bin.shortCode})`];
        if (bin.parentShortCode) parts.push(`  Inside bin: ${bin.parentShortCode}`);
        if (bin.location) parts.push(`  Area: ${bin.location}`);
        if (bin.items.length > 0) parts.push(`  Items: ${bin.items.map(formatItem).join(", ")}`);
        if (bin.tags.length > 0) parts.push(`  Tags: ${bin.tags.join(", ")}`);
        if (bin.notes) parts.push(`  Notes: ${bin.notes}`);
        if (bin.photos.length > 0) parts.push(`  Photos: ${bin.photos.length}`);
        summary.push(parts.join("\n"));
      }

      return {
        content: [{ type: "text" as const, text: summary.join("\n\n") }],
      };
    }),
  );

  server.tool(
    "export_location_csv",
    "Export the bins in a location as CSV text (one row per bin item). Covers bins only: items that are loose in an area or unassigned (not inside any bin) are not included.",
    {
      location_id: z.string().describe("Location UUID"),
    },
    withErrorHandling(async ({ location_id }) => {
      const csv = await api.getText(
        `/api/locations/${encodeURIComponent(location_id)}/export/csv`,
      );

      return {
        content: [{ type: "text" as const, text: csv }],
      };
    }),
  );
}
