import { apiFetch } from '@/lib/api';
import { Events, notify } from '@/lib/eventBus';

/** An item that isn't in a box: placed directly in an area, or in no area at all ("unassigned"). */
export interface LooseItem {
  id: string;
  name: string;
  quantity: number | null;
  location_id: string;
  bin_id: null;
  area_id: string | null;
  area_name: string | null;
}

/** Items changed: refresh item/box lists and the area cards, whose counts include items. */
export function notifyItemsChanged(): void {
  notify(Events.BINS);
  notify(Events.AREAS);
}

const base = (locationId: string) => `/api/locations/${encodeURIComponent(locationId)}/items`;

/** Create an item in an area (`areaId`) or, without one, unassigned in the location. */
export async function createLooseItem(
  locationId: string,
  item: { name: string; quantity?: number | null; areaId?: string | null },
): Promise<LooseItem> {
  const body: Record<string, unknown> = { name: item.name };
  if (item.quantity !== undefined) body.quantity = item.quantity;
  if (item.areaId) body.areaId = item.areaId;
  const created = await apiFetch<LooseItem>(base(locationId), { method: 'POST', body });
  notifyItemsChanged();
  return created;
}

/** Rename and/or set the quantity of a loose item (`quantity: null` clears it). */
export async function updateLooseItem(
  locationId: string,
  itemId: string,
  changes: { name?: string; quantity?: number | null },
): Promise<{ id: string; name: string; quantity: number | null }> {
  const updated = await apiFetch<{ id: string; name: string; quantity: number | null }>(
    `${base(locationId)}/${encodeURIComponent(itemId)}`,
    { method: 'PUT', body: changes },
  );
  notifyItemsChanged();
  return updated;
}

export async function deleteLooseItem(locationId: string, itemId: string): Promise<void> {
  await apiFetch(`${base(locationId)}/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
  notifyItemsChanged();
}
