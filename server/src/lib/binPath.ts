import { query } from '../db.js';

/** Separator for human-readable paths shown to the AI and in AI results. (Export keeps " / ".) */
export const PATH_SEPARATOR = ' › ';

export interface AreaRow {
  id: string;
  name: string;
  parent_id: string | null;
}

export interface PathBuilder {
  /** Area path like "Garage › Shelf A"; '' for null/unknown. Cycle-guarded. */
  areaPath(areaId: string | null | undefined): string;
  /** `[area path ›] [parent box name ›] name` */
  binPath(bin: { area_id: string | null | undefined; name: string; parent_bin_name?: string | null }): string;
}

/** Build a path builder from already-loaded area rows (pure; no DB access). */
export function createPathBuilder(rows: AreaRow[]): PathBuilder {
  const byId = new Map<string, AreaRow>();
  for (const r of rows) byId.set(r.id, r);
  const cache = new Map<string, string>();

  function areaPath(areaId: string | null | undefined): string {
    if (!areaId) return '';
    const cached = cache.get(areaId);
    if (cached !== undefined) return cached;
    const names: string[] = [];
    const seen = new Set<string>();
    let cur: AreaRow | undefined = byId.get(areaId);
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      names.unshift(cur.name);
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
    const path = names.join(PATH_SEPARATOR);
    cache.set(areaId, path);
    return path;
  }

  function binPath(bin: { area_id: string | null | undefined; name: string; parent_bin_name?: string | null }): string {
    const parts: string[] = [];
    const area = areaPath(bin.area_id);
    if (area) parts.push(area);
    if (bin.parent_bin_name) parts.push(bin.parent_bin_name);
    parts.push(bin.name);
    return parts.join(PATH_SEPARATOR);
  }

  return { areaPath, binPath };
}

/** Load the location's areas once and return a path builder. */
export async function loadPathBuilder(locationId: string): Promise<PathBuilder> {
  const result = await query<AreaRow>('SELECT id, name, parent_id FROM areas WHERE location_id = $1', [locationId]);
  return createPathBuilder(result.rows);
}
