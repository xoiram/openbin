import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { Bin } from '@/types';
import { useBinSelection } from '../useBinSelection';

function makeBin(id: string, overrides: Partial<Bin> = {}): Bin {
  return {
    id,
    short_code: id,
    location_id: 'loc1',
    name: id,
    area_id: null,
    area_name: '',
    items: [],
    notes: '',
    tags: [],
    icon: 'Package',
    color: '',
    card_style: '',
    created_by: 'u1',
    created_by_name: 'U',
    visibility: 'location',
    custom_fields: {},
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    ...overrides,
  };
}

const bins = [
  makeBin('parent', { area_id: 'a1', child_count: 1 }),
  makeBin('child', { area_id: 'a1', parent_bin_id: 'parent' }),
  makeBin('solo', { area_id: 'a1' }),
];

function setup(options?: { topLevelOnly?: boolean }, url = '/') {
  const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>;
  return renderHook(() => useBinSelection(bins, options), { wrapper });
}

const ids = (r: { current: ReturnType<typeof useBinSelection> }) => r.current.selectedBins.map((b) => b.id).sort();

describe('useBinSelection', () => {
  it('default: select all and toggle area include children', () => {
    const { result } = setup();
    act(() => result.current.selectAll());
    expect(ids(result)).toEqual(['child', 'parent', 'solo']);
    act(() => result.current.selectNone());
    act(() => result.current.toggleArea('a1'));
    expect(ids(result)).toEqual(['child', 'parent', 'solo']);
  });

  it('default: ?ids= may include a child', () => {
    const { result } = setup(undefined, '/?ids=child,solo');
    expect(ids(result)).toEqual(['child', 'solo']);
  });

  it('topLevelOnly: select all and toggle area never include children', () => {
    const { result } = setup({ topLevelOnly: true });
    act(() => result.current.selectAll());
    expect(ids(result)).toEqual(['parent', 'solo']);
    expect(result.current.selectedIds.has('child')).toBe(false);
    act(() => result.current.selectNone());
    act(() => result.current.toggleArea('a1'));
    expect(ids(result)).toEqual(['parent', 'solo']);
    expect(result.current.selectedIds.has('child')).toBe(false);
  });

  it('topLevelOnly: toggleBin ignores a child', () => {
    const { result } = setup({ topLevelOnly: true });
    act(() => result.current.toggleBin('child'));
    expect(result.current.selectedIds.size).toBe(0);
    act(() => result.current.toggleBin('solo'));
    expect(ids(result)).toEqual(['solo']);
  });

  it('topLevelOnly: ?ids= containing a child drops the child', () => {
    const { result } = setup({ topLevelOnly: true }, '/?ids=child,solo,unknown');
    expect(ids(result)).toEqual(['solo']);
    expect(result.current.selectedIds.has('child')).toBe(false);
    expect(result.current.selectedIds.has('unknown')).toBe(false);
  });
});
