import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/eventBus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/eventBus')>();
  return { ...actual, notify: vi.fn() };
});

import { apiFetch } from '@/lib/api';
import { Events, notify } from '@/lib/eventBus';
import { createLooseItem, deleteLooseItem, updateLooseItem } from '../looseItems';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  vi.clearAllMocks();
  mockApiFetch.mockResolvedValue({ id: 'i1', name: 'Ladder', quantity: 2 });
});

function refreshed() {
  const events = vi.mocked(notify).mock.calls.map((c) => c[0]);
  expect(events).toContain(Events.BINS);
  expect(events).toContain(Events.AREAS); // area cards count items
}

describe('loose item API', () => {
  it('creates an item in an area', async () => {
    await createLooseItem('loc 1', { name: 'Ladder', quantity: 2, areaId: 'a1' });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/locations/loc%201/items', {
      method: 'POST',
      body: { name: 'Ladder', quantity: 2, areaId: 'a1' },
    });
    refreshed();
  });

  it('creates an unassigned item when there is no area, and omits an unset quantity', async () => {
    await createLooseItem('loc1', { name: 'Tape', areaId: null });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/locations/loc1/items', { method: 'POST', body: { name: 'Tape' } });
  });

  it('sends a null quantity to clear it', async () => {
    await createLooseItem('loc1', { name: 'Tape', quantity: null });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/locations/loc1/items', { method: 'POST', body: { name: 'Tape', quantity: null } });
  });

  it('updates and deletes by id', async () => {
    await updateLooseItem('loc1', 'i/1', { name: 'New', quantity: null });
    expect(mockApiFetch).toHaveBeenLastCalledWith('/api/locations/loc1/items/i%2F1', {
      method: 'PUT',
      body: { name: 'New', quantity: null },
    });
    refreshed();

    vi.mocked(notify).mockClear();
    await deleteLooseItem('loc1', 'i1');
    expect(mockApiFetch).toHaveBeenLastCalledWith('/api/locations/loc1/items/i1', { method: 'DELETE' });
    refreshed();
  });
});
