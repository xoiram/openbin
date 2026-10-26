import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: vi.fn() }));

import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useBinSearch, useChildBins } from '../useBins';

const mockApiFetch = vi.mocked(apiFetch);

function paramsOf(call: unknown[]): URLSearchParams {
  return new URL(String(call[0]), 'http://localhost').searchParams;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useAuth).mockReturnValue({ token: 'tok', activeLocationId: 'loc-1', user: null } as ReturnType<typeof useAuth>);
  mockApiFetch.mockResolvedValue({ results: [], count: 0 });
});

// GET /api/bins returns at most 200 boxes, so pickers and the "inside this box" section must ask the
// server for what they need instead of filtering the (possibly truncated) full list in the browser.
describe('useBinSearch', () => {
  it('asks the server for a name-sorted page, searching and limiting there', async () => {
    renderHook(() => useBinSearch({ search: '  tool ', topLevelOnly: true, limit: 25 }));
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

    const p = paramsOf(mockApiFetch.mock.calls[0]);
    expect(p.get('location_id')).toBe('loc-1');
    expect(p.get('q')).toBe('tool');
    expect(p.get('top_level')).toBe('true');
    expect(p.get('limit')).toBe('25');
    expect(p.get('sort')).toBe('name');
    expect(p.get('sort_dir')).toBe('asc');
  });

  it('omits q and top_level when not asked for, and defaults to a page of 50', async () => {
    renderHook(() => useBinSearch());
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

    const p = paramsOf(mockApiFetch.mock.calls[0]);
    expect(p.has('q')).toBe(false);
    expect(p.has('top_level')).toBe(false);
    expect(p.get('limit')).toBe('50');
  });

  it('fetches nothing while skipped', async () => {
    renderHook(() => useBinSearch({ skip: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

describe('useChildBins', () => {
  it('fetches the boxes inside a box by parent id', async () => {
    renderHook(() => useChildBins('parent-1'));
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

    const p = paramsOf(mockApiFetch.mock.calls[0]);
    expect(p.get('parent')).toBe('parent-1');
    expect(p.get('location_id')).toBe('loc-1');
    expect(p.get('limit')).toBe('200');
  });

  it('fetches nothing without a parent or while skipped', async () => {
    renderHook(() => useChildBins(undefined));
    renderHook(() => useChildBins('parent-1', true));
    await new Promise((r) => setTimeout(r, 20));
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});
