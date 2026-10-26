import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bin } from '@/types';

vi.mock('@/lib/terminology', () => ({
  useTerminology: () => ({
    bin: 'bin', bins: 'bins', Bin: 'Bin', Bins: 'Bins',
    area: 'area', areas: 'areas', Area: 'Area', Areas: 'Areas',
    location: 'location', locations: 'locations', Location: 'Location', Locations: 'Locations',
  }),
}));

const useBinSearch = vi.fn();
vi.mock('@/features/bins/useBins', () => ({
  useBinSearch: (...args: unknown[]) => useBinSearch(...args),
}));

import { BinPickerList } from '../bin-picker-list';

function bin(id: string, name: string, extra: Partial<Bin> = {}): Bin {
  return {
    id, short_code: id.toUpperCase(), location_id: 'loc-1', name, area_id: null, area_name: '', items: [], notes: '', tags: [],
    icon: '', color: '', card_style: '', created_by: 'u1', created_by_name: 'U', visibility: 'location', custom_fields: {},
    created_at: '', updated_at: '', ...extra,
  };
}

function props(overrides: Partial<React.ComponentProps<typeof BinPickerList>> = {}) {
  return { selectedBinId: null, onSelect: vi.fn(), search: '', onSearchChange: vi.fn(), ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  useBinSearch.mockReturnValue({ bins: [bin('a', 'Alpha'), bin('b', 'Bravo')], isLoading: false });
});

describe('BinPickerList', () => {
  it('searches on the server with the debounced text, not by filtering a loaded list', async () => {
    const { rerender } = render(<BinPickerList {...props()} />);
    expect(useBinSearch).toHaveBeenLastCalledWith(expect.objectContaining({ search: '' }));

    rerender(<BinPickerList {...props({ search: 'tool' })} />);
    await waitFor(() => expect(useBinSearch).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'tool' })));
  });

  it('passes topLevelOnly and the page size to the query, and pauses it', () => {
    render(<BinPickerList {...props({ topLevelOnly: true, paused: true })} />);
    expect(useBinSearch).toHaveBeenLastCalledWith({ search: '', topLevelOnly: true, limit: 50, skip: true });
  });

  it('shows what the server returned, minus the excluded bin and anything the filter rejects', () => {
    render(<BinPickerList {...props({ excludeBinId: 'a', filter: (b) => b.name !== 'Zulu' })} />);
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
    expect(screen.getByText('Bravo')).toBeInTheDocument();
  });

  it('tells the user to search when a full page came back', () => {
    useBinSearch.mockReturnValue({ bins: Array.from({ length: 50 }, (_, i) => bin(`b${i}`, `Bin ${i}`)), isLoading: false });
    render(<BinPickerList {...props()} />);
    expect(screen.getByText('Showing the first 50. Search to narrow the list.')).toBeInTheDocument();
  });

  it('does not show that hint for a short result', () => {
    render(<BinPickerList {...props()} />);
    expect(screen.queryByText(/Search to narrow the list/)).not.toBeInTheDocument();
  });

  it('labels a child bin with its parent', () => {
    useBinSearch.mockReturnValue({
      bins: [bin('c', 'Drill bits', { area_name: 'Garage', parent_bin_id: 't', parent_bin_name: 'Toolbox' })],
      isLoading: false,
    });
    render(<BinPickerList {...props()} />);
    expect(screen.getByText('Garage · inside Toolbox')).toBeInTheDocument();
  });
});
