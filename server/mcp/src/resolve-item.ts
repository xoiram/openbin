import { type ApiClient } from "./api-client.js";

export interface BinItem {
  id: string;
  name: string;
}

export interface BinDetail {
  id: string;
  items: BinItem[];
}

/**
 * Resolve an item by ID or name within a bin.
 * When item_id is provided, skips the bin fetch (server validates existence).
 * Returns the matched name when resolved by name; falls back to the raw ID otherwise.
 */
export async function resolveItemId(
  api: ApiClient,
  bin_id: string,
  item_id: string | undefined,
  item_name: string | undefined,
): Promise<{ id: string; name: string } | { error: string }> {
  if (!item_id && !item_name) {
    return { error: "Provide either 'item_id' or 'item_name'." };
  }

  if (item_id) {
    return { id: item_id, name: item_id };
  }

  const bin = await api.get<BinDetail>(`/api/bins/${encodeURIComponent(bin_id)}`);
  const matches = bin.items.filter(
    (i) => i.name.toLowerCase() === item_name!.toLowerCase(),
  );

  if (matches.length === 0) {
    return { error: `No item named "${item_name}" found in this bin.` };
  }
  if (matches.length > 1) {
    const list = matches.map((m) => `- ${m.name} [${m.id}]`).join("\n");
    return {
      error: `Multiple items named "${item_name}" found. Specify item_id to disambiguate:\n${list}`,
    };
  }
  return { id: matches[0].id, name: matches[0].name };
}

interface LooseItemRow {
  id: string;
  name: string;
  area_name: string | null;
}

/**
 * Resolve a LOOSE item (one in an area or unassigned, not in a box) by ID or name.
 * An explicit item_id is accepted as-is (the server validates it). By name, lists loose items
 * (optionally narrowed to an area or to the unassigned ones) and requires exactly one exact,
 * case-insensitive name match, since the server's `q` search is fuzzy.
 */
export async function resolveLooseItemId(
  api: ApiClient,
  location_id: string,
  item_id: string | undefined,
  item_name: string | undefined,
  scope: { area_id?: string; unassigned?: boolean } = {},
): Promise<{ id: string; name: string } | { error: string }> {
  if (!item_id && !item_name) {
    return { error: "Provide either 'item_id' or 'item_name'." };
  }

  if (item_id) {
    return { id: item_id, name: item_id };
  }

  const wanted = item_name!.trim().toLowerCase();
  const matches: LooseItemRow[] = [];
  const pageSize = 100;
  for (let offset = 0; offset < 1000; offset += pageSize) {
    const params = new URLSearchParams({
      location_id,
      loose: "true",
      q: item_name!.trim(),
      limit: String(pageSize),
      offset: String(offset),
    });
    if (scope.area_id) params.set("area_id", scope.area_id);
    else if (scope.unassigned) params.set("unassigned", "true");
    const page = await api.get<{ results: LooseItemRow[]; count: number }>(`/api/items?${params}`);
    matches.push(...page.results.filter((i) => i.name.toLowerCase() === wanted));
    if (offset + pageSize >= page.count) break;
  }

  const where = scope.area_id ? "in that area" : scope.unassigned ? "among the unassigned items" : "among loose items (items not in a bin)";
  if (matches.length === 0) {
    return { error: `No loose item named "${item_name}" found ${where}.` };
  }
  if (matches.length > 1) {
    const list = matches.map((m) => `- ${m.name} [${m.id}] (${m.area_name ? `area: ${m.area_name}` : "unassigned"})`).join("\n");
    return {
      error: `Multiple loose items named "${item_name}" found. Specify item_id to disambiguate:\n${list}`,
    };
  }
  return { id: matches[0].id, name: matches[0].name };
}
