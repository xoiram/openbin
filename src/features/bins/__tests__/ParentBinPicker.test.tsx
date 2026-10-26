import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bin } from '@/types';
import { ParentBinPicker } from '../ParentBinPicker';

vi.mock('@/lib/terminology', () => ({
  useTerminology: () => ({
    bin: 'bin', bins: 'bins', Bin: 'Bin', Bins: 'Bins',
    area: 'area', areas: 'areas', Area: 'Area', Areas: 'Areas',
    location: 'location', locations: 'locations', Location: 'Location', Locations: 'Locations',
  }),
}));

function bin(id: string, name: string, extra: Partial<Bin> = {}): Bin {
  return {
    id, short_code: id.toUpperCase(), location_id: 'loc-1', name, area_id: null, area_name: '', items: [], notes: '', tags: [],
    icon: '', color: '', card_style: '', created_by: 'u1', created_by_name: 'U', visibility: 'location', custom_fields: {},
    created_at: '', updated_at: '', ...extra,
  };
}

const mockBins: Bin[] = [
  bin('toolbox', 'Toolbox', { area_name: 'Garage', child_count: 1 }),
  bin('bits', 'Drill bits', { parent_bin_id: 'toolbox', parent_bin_name: 'Toolbox', area_name: 'Garage' }),
  bin('cables', 'Cables'),
  bin('self', 'This one'),
];

vi.mock('../useBins', () => ({
  useBinList: () => ({ bins: mockBins, isLoading: false }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ParentBinPicker', () => {
  it('shows the "not inside" label when there is no parent', () => {
    render(<ParentBinPicker value={null} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Not inside another bin/ })).toBeInTheDocument();
  });

  it('shows the name of the current parent', () => {
    render(<ParentBinPicker value="cables" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Cables/ })).toBeInTheDocument();
  });

  it('offers only top-level bins other than the bin itself', () => {
    render(<ParentBinPicker value={null} onChange={vi.fn()} binId="self" />);
    fireEvent.click(screen.getByRole('button', { name: /Not inside another bin/ }));

    expect(screen.getByText('Toolbox')).toBeInTheDocument();
    expect(screen.getByText('Cables')).toBeInTheDocument();
    expect(screen.queryByText('Drill bits')).not.toBeInTheDocument(); // already a child
    expect(screen.queryByText('This one')).not.toBeInTheDocument(); // itself
  });

  it('selects a parent and closes the dialog', async () => {
    const onChange = vi.fn();
    render(<ParentBinPicker value={null} onChange={onChange} binId="self" />);
    fireEvent.click(screen.getByRole('button', { name: /Not inside another bin/ }));
    fireEvent.click(screen.getByText('Toolbox'));

    expect(onChange).toHaveBeenCalledWith('toolbox');
    await waitFor(() => expect(screen.queryByText('Place inside another bin')).not.toBeInTheDocument());
  });

  it('takes the bin out of its parent', () => {
    const onChange = vi.fn();
    render(<ParentBinPicker value="cables" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Cables/ }));
    fireEvent.click(screen.getByRole('button', { name: /Not inside another bin/ }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('is disabled with an explanation when the bin contains other bins', () => {
    render(<ParentBinPicker value={null} onChange={vi.fn()} binId="toolbox" hasChildren />);
    expect(screen.getByRole('button', { name: /Not inside another bin/ })).toBeDisabled();
    expect(screen.getByText(/contains other bins/)).toBeInTheDocument();
  });
});
