import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

import { ApiError, apiFetch } from '@/lib/api';
import { type PublicBin, usePublicBin } from '../usePublicBin';

const mockApiFetch = vi.mocked(apiFetch);

function publicBin(overrides: Partial<PublicBin> = {}): PublicBin {
  return {
    id: 'b1',
    name: 'Toolbox',
    area_name: '',
    notes: '',
    tags: [],
    icon: '',
    color: '',
    card_style: '',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    items: [],
    custom_fields: [],
    photos: [],
    parent: null,
    children: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('usePublicBin', () => {
  it('loads the public view without retrying a 401 as a refresh', async () => {
    mockApiFetch.mockResolvedValue(publicBin());
    const { result } = renderHook(() => usePublicBin('b1'));
    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(mockApiFetch).toHaveBeenCalledWith('/api/public/bins/b1', { skipRefresh: true });
  });

  it('reports a 404 as unavailable', async () => {
    mockApiFetch.mockRejectedValue(new ApiError(404, 'Not found'));
    const { result } = renderHook(() => usePublicBin('b1'));
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
  });

  it('does not mistake a server or network failure for "not public"', async () => {
    mockApiFetch.mockRejectedValue(new ApiError(500, 'boom'));
    const { result, rerender } = renderHook(({ id }) => usePublicBin(id), { initialProps: { id: 'b1' } });
    await waitFor(() => expect(result.current.status).toBe('error'));

    mockApiFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    rerender({ id: 'b2' });
    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('refetches when the id changes, as when following a link to a child box', async () => {
    mockApiFetch.mockImplementation(async (path) =>
      publicBin({ id: String(path).endsWith('child') ? 'child' : 'parent', name: String(path).endsWith('child') ? 'Screws' : 'Toolbox' }),
    );
    const { result, rerender } = renderHook(({ id }) => usePublicBin(id), { initialProps: { id: 'parent' } });
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready', bin: { name: 'Toolbox' } }));

    rerender({ id: 'child' });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready', bin: { name: 'Screws' } }));
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  it('ignores a slow response for a box the visitor has already left', async () => {
    let resolveFirst: (b: PublicBin) => void = () => {};
    mockApiFetch.mockImplementationOnce(() => new Promise<PublicBin>((resolve) => { resolveFirst = resolve; }));
    mockApiFetch.mockResolvedValueOnce(publicBin({ id: 'b2', name: 'Second' }));

    const { result, rerender } = renderHook(({ id }) => usePublicBin(id), { initialProps: { id: 'b1' } });
    rerender({ id: 'b2' });
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready', bin: { name: 'Second' } }));

    resolveFirst(publicBin({ id: 'b1', name: 'First (late)' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toMatchObject({ status: 'ready', bin: { name: 'Second' } });
  });

  it('is unavailable without an id, and makes no request', () => {
    const { result } = renderHook(() => usePublicBin(undefined));
    expect(result.current.status).toBe('unavailable');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});
