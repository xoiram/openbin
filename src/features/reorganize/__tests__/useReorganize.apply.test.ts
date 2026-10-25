import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bin } from '@/types';

const mockUpdateBin = vi.fn();
const mockDeleteBin = vi.fn();
const mockAddBin = vi.fn();
let mockResult: unknown = null;

vi.mock('@/features/bins/useBins', () => ({
  updateBin: (...a: unknown[]) => mockUpdateBin(...a),
  deleteBin: (...a: unknown[]) => mockDeleteBin(...a),
  addBin: (...a: unknown[]) => mockAddBin(...a),
}));
vi.mock('@/features/ai/useAiStream', () => ({
  useAiStream: () => ({
    result: mockResult,
    isStreaming: false,
    error: null,
    partialText: '',
    retryCount: 0,
    stream: vi.fn(),
    cancel: vi.fn(),
    clear: vi.fn(),
  }),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ activeLocationId: 'loc-1', token: 't' }) }));

const { useReorganize } = await import('../useReorganize');

function makeBin(overrides: Partial<Bin>): Bin {
  return {
    id: 'b', short_code: 'b', location_id: 'loc-1', name: 'B', area_id: null, area_name: '', items: [], notes: '',
    tags: [], icon: 'Package', color: '', card_style: '', created_by: 'u', created_by_name: 'U',
    visibility: 'location', custom_fields: {}, created_at: '', updated_at: '', ...overrides,
  };
}

describe('useReorganize apply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateBin.mockResolvedValue(undefined);
    mockDeleteBin.mockResolvedValue(undefined);
    mockAddBin.mockResolvedValue({ id: 'new-1' });
  });

  it('deletes unmatched plain boxes but keeps and empties a box that contains boxes', async () => {
    const parent = makeBin({ id: 'parent', name: 'Toolbox', child_count: 2, items: [{ id: 'i1', name: 'Hammer', quantity: null }] });
    const plain = makeBin({ id: 'plain', name: 'Misc', items: [{ id: 'i2', name: 'Tape', quantity: null }] });
    const keep = makeBin({ id: 'keep', name: 'Garage' });
    mockResult = { bins: [{ name: 'Garage', items: ['Hammer', 'Tape'] }], summary: '' };

    const { result } = renderHook(() => useReorganize());
    let outcome: Awaited<ReturnType<typeof result.current.apply>> | undefined;
    await act(async () => {
      outcome = await result.current.apply([parent, plain, keep]);
    });

    expect(mockDeleteBin).toHaveBeenCalledTimes(1);
    expect(mockDeleteBin).toHaveBeenCalledWith('plain');
    expect(mockDeleteBin).not.toHaveBeenCalledWith('parent');
    expect(mockUpdateBin).toHaveBeenCalledWith('parent', { items: [] });
    expect(outcome).toEqual({ success: true, newBinIds: ['keep'], emptiedCount: 1 });
  });

  it('never deletes a parent even when every source is unmatched', async () => {
    const parent = makeBin({ id: 'parent', name: 'Toolbox', child_count: 1 });
    mockResult = { bins: [{ name: 'Else', items: [] }], summary: '' };
    const { result } = renderHook(() => useReorganize());
    await act(async () => {
      await result.current.apply([parent]);
    });
    expect(mockDeleteBin).not.toHaveBeenCalled();
    expect(mockAddBin).toHaveBeenCalledTimes(1);
  });
});
