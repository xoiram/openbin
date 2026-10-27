import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));
vi.mock('@/features/bins/useBins', () => ({ notifyBinsChanged: vi.fn() }));

import { apiFetch } from '@/lib/api';
import { buildAreaTree, sumLooseItems, useAreaList } from '../useAreas';

const mockApiFetch = vi.mocked(apiFetch);
beforeEach(() => vi.clearAllMocks());

const area = (id: string, parent: string | null, loose: number) => ({
  id, location_id: 'l', name: id, parent_id: parent, bin_count: 0, descendant_bin_count: 0, item_count: 0,
  descendant_item_count: 0, loose_item_count: loose, created_by: null, created_at: '', updated_at: '',
});

describe('useAreaList unassignedItemCount', () => {
  it('exposes the unassigned item count from the response', async () => {
    mockApiFetch.mockResolvedValue({ results: [], count: 0, unassigned_count: 2, unassigned_item_count: 6 });
    const { result } = renderHook(() => useAreaList('loc-1'));
    await waitFor(() => expect(result.current.unassignedItemCount).toBe(6));
    expect(result.current.unassignedCount).toBe(2);
  });

  it('falls back to 0 when the server omits it', async () => {
    mockApiFetch.mockResolvedValue({ results: [], count: 0, unassigned_count: 2 });
    const { result } = renderHook(() => useAreaList('loc-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.unassignedItemCount).toBe(0);
  });
});

describe('sumLooseItems', () => {
  it('adds the loose items of the area and all its sub-areas', () => {
    const [root] = buildAreaTree([area('a', null, 1), area('b', 'a', 2), area('c', 'b', 4)]);
    expect(sumLooseItems(root)).toBe(7);
  });
});
