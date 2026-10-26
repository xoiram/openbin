import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bin } from '@/types';

vi.mock('@/lib/terminology', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/terminology')>();
  return { ...actual, useTerminology: () => actual.DEFAULT_TERMINOLOGY };
});
vi.mock('@/features/tags/useTagStyle', () => ({ useTagStyle: () => () => undefined }));
vi.mock('@/features/bins/useBinCardInteraction', () => ({
  useBinCardInteraction: () => ({
    handleClick: vi.fn(),
    handleKeyDown: vi.fn(),
    longPress: { onTouchStart: vi.fn(), onTouchEnd: vi.fn(), onTouchMove: vi.fn(), onContextMenu: vi.fn() },
  }),
}));
vi.mock('@/lib/theme', () => ({ useTheme: () => ({ theme: 'light' }) }));
vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ token: 't', activeLocationId: 'loc-1' }),
}));

import { apiFetch } from '@/lib/api';
import { BinCard } from '../BinCard';
import { BinCompactCard } from '../BinCompactCard';
import { BinFilterDialog } from '../BinFilterDialog';
import { BinSearchBar } from '../BinSearchBar';
import { BinTableView } from '../BinTableView';
import { buildViewSearchParams, useBinSearchParams } from '../useBinSearchParams';
import { binMatchesSearch, buildSearchRegex, countActiveFilters, EMPTY_FILTERS, useBinList } from '../useBins';

function bin(id: string, name: string, extra: Partial<Bin> = {}): Bin {
  return {
    id, short_code: id.toUpperCase(), location_id: 'loc-1', name, area_id: null, area_name: '', items: [], notes: '', tags: [],
    icon: 'package', color: '', card_style: '', created_by: 'u1', created_by_name: 'U', visibility: 'location', custom_fields: {},
    created_at: '2024-01-01', updated_at: '2024-01-01', ...extra,
  };
}

const parent = bin('toolbox', 'Toolbox', { child_count: 1, updated_at: '2024-01-03' });
const child = bin('bits', 'Drill bits', { parent_bin_id: 'toolbox', parent_bin_name: 'Toolbox', updated_at: '2024-01-02' });
const other = bin('cables', 'Cables', { updated_at: '2024-01-01' });

describe('"inside {parent}" label', () => {
  it('shows on a child card and not on a top-level card', () => {
    const { rerender } = render(<MemoryRouter><BinCard bin={child} /></MemoryRouter>);
    expect(screen.getByText('inside Toolbox')).toBeInTheDocument();
    rerender(<MemoryRouter><BinCard bin={parent} /></MemoryRouter>);
    expect(screen.queryByTestId('parent-bin-label')).not.toBeInTheDocument();
  });

  it('shows on a child compact card and not on a top-level one', () => {
    const { rerender } = render(<MemoryRouter><BinCompactCard bin={child} index={0} /></MemoryRouter>);
    expect(screen.getByText('inside Toolbox')).toBeInTheDocument();
    rerender(<MemoryRouter><BinCompactCard bin={parent} index={0} /></MemoryRouter>);
    expect(screen.queryByTestId('parent-bin-label')).not.toBeInTheDocument();
  });

  it('updates a memoized card when the parent name changes', () => {
    const { rerender } = render(<MemoryRouter><BinCard bin={child} /></MemoryRouter>);
    rerender(<MemoryRouter><BinCard bin={{ ...child, parent_bin_name: 'Big toolbox' }} /></MemoryRouter>);
    expect(screen.getByText('inside Big toolbox')).toBeInTheDocument();
  });

  it('shows in the table for a child only', () => {
    render(
      <MemoryRouter>
        <BinTableView
          bins={[parent, child]}
          sortColumn="name"
          sortDirection="asc"
          onSortChange={vi.fn()}
          selectable={false}
          selectedIds={new Set()}
          onSelect={vi.fn()}
          searchQuery=""
          onTagClick={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getAllByTestId('parent-bin-label')).toHaveLength(1);
    expect(screen.getByText('inside Toolbox')).toBeInTheDocument();
  });
});

describe('hide nested filter', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockResolvedValue({ results: [parent, child, other], count: 3 });
  });

  it('keeps children by default and removes them when hideNested is on', async () => {
    const { result, rerender } = renderHook(({ f }) => useBinList(undefined, 'name', f), { initialProps: { f: EMPTY_FILTERS } });
    await waitFor(() => expect(result.current.bins).toHaveLength(3));
    rerender({ f: { ...EMPTY_FILTERS, hideNested: true } });
    expect(result.current.bins.map((b) => b.id).sort()).toEqual(['cables', 'toolbox']);
  });

  it('counts as an active filter', () => {
    expect(countActiveFilters({ ...EMPTY_FILTERS, hideNested: true })).toBe(1);
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
  });

  it('the list search matches the parent name', () => {
    const regex = buildSearchRegex('toolbox');
    expect(binMatchesSearch(child, regex)).toBe(true);
    expect(binMatchesSearch(other, regex)).toBe(false);
  });

  it('toggles in the filter dialog and applies', () => {
    const onFiltersChange = vi.fn();
    render(
      <BinFilterDialog
        open
        onOpenChange={vi.fn()}
        filters={EMPTY_FILTERS}
        onFiltersChange={onFiltersChange}
        availableTags={[]}
        areas={[]}
        sort="updated"
        onSortChange={vi.fn()}
        sortDir="desc"
        onSortDirChange={vi.fn()}
        searchQuery=""
        onSaveView={vi.fn()}
      />,
    );
    const toggle = screen.getByRole('switch', { name: 'Hide nested bins' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Apply \(1\)/ }));
    expect(onFiltersChange).toHaveBeenCalledWith(expect.objectContaining({ hideNested: true }));
  });

  it("shows a removable chip in the search bar", async () => {
    const setFilters = vi.fn();
    const filters = { ...EMPTY_FILTERS, hideNested: true };
    render(
      <BinSearchBar
        search=""
        setSearch={vi.fn()}
        filters={filters}
        setFilters={setFilters}
        clearAll={vi.fn()}
        areas={[]}
        getTagStyle={() => undefined}
        activeCount={1}
        hasBadges
        onOpenFilter={vi.fn()}
        term={{ bin: 'bin', bins: 'bins', Bin: 'Bin', Bins: 'Bins', area: 'area', areas: 'areas', Area: 'Area', Areas: 'Areas', location: 'location', locations: 'locations', Location: 'Location', Locations: 'Locations' }}
      />,
    );
    expect(screen.getByText('Top-level only')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Remove hide nested bins filter'));
    await waitFor(() => expect(setFilters).toHaveBeenCalledWith({ ...filters, hideNested: false }));
  });

  it('is sent to the server as top_level when paginating', async () => {
    const { usePaginatedBinList } = await import('../useBins');
    renderHook(() => usePaginatedBinList('', 'name', 'asc', { ...EMPTY_FILTERS, hideNested: true }, 1, 24));
    await waitFor(() => expect(vi.mocked(apiFetch)).toHaveBeenCalled());
    expect(vi.mocked(apiFetch).mock.calls.some(([url]) => String(url).includes('top_level=true'))).toBe(true);
  });
});

describe('hideNested in URL params and saved views', () => {
  function wrapperAt(url: string) {
    return ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>;
  }

  it('reads hide_nested from the URL', () => {
    const { result } = renderHook(() => useBinSearchParams(), { wrapper: wrapperAt('/bins?hide_nested=true') });
    expect(result.current.filters.hideNested).toBe(true);
  });

  it('defaults to false and writes the param to the URL when toggled', async () => {
    const { result } = renderHook(() => ({ params: useBinSearchParams(), loc: useLocation() }), { wrapper: wrapperAt('/bins') });
    expect(result.current.params.filters.hideNested).toBe(false);
    expect(result.current.loc.search).not.toContain('hide_nested');
    act(() => result.current.params.setFilters({ ...EMPTY_FILTERS, hideNested: true }));
    await waitFor(() => expect(result.current.loc.search).toContain('hide_nested=true'));
    act(() => result.current.params.setFilters(EMPTY_FILTERS));
    await waitFor(() => expect(result.current.loc.search).not.toContain('hide_nested'));
  });

  it('builds hide_nested into the URL of an applied saved view', () => {
    const view = { id: 'v', name: 'v', searchQuery: '', sort: 'updated' as const, filters: { ...EMPTY_FILTERS, hideNested: true }, createdAt: '' };
    expect(new URLSearchParams(buildViewSearchParams(view)).get('hide_nested')).toBe('true');
    expect(new URLSearchParams(buildViewSearchParams({ ...view, filters: EMPTY_FILTERS })).has('hide_nested')).toBe(false);
  });

  it('an old saved view without the field still loads, as false', async () => {
    const { useSavedViews } = await import('@/lib/savedViews');
    vi.mocked(apiFetch).mockResolvedValue({
      results: [
        { id: 'old', name: 'Old', search_query: '', sort: 'updated', filters: JSON.stringify({ tags: ['x'], tagMode: 'any', areas: [], hasItems: false, hasNotes: false }), created_at: '' },
        { id: 'new', name: 'New', search_query: '', sort: 'updated', filters: { ...EMPTY_FILTERS, hideNested: true }, created_at: '' },
      ],
      count: 2,
    });
    const { result } = renderHook(() => useSavedViews());
    await waitFor(() => expect(result.current.views).toHaveLength(2));
    expect(result.current.views[0].filters.hideNested).toBe(false);
    expect(result.current.views[0].filters.tags).toEqual(['x']);
    expect(result.current.views[1].filters.hideNested).toBe(true);
    expect(countActiveFilters(result.current.views[0].filters)).toBe(1);
  });
});
