import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
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

// The picker asks the server for top-level bins; mimic that here.
vi.mock('../useBins', () => ({
  useBinSearch: ({ topLevelOnly }: { topLevelOnly?: boolean } = {}) => ({
    bins: topLevelOnly ? mockBins.filter((b) => !b.parent_bin_id) : mockBins,
    isLoading: false,
  }),
  useBin: (id?: string) => ({ bin: mockBins.find((b) => b.id === id), isLoading: false }),
}));

const fieldButton = (name: RegExp) => screen.getByRole('button', { name });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ParentBinPicker', () => {
  it('shows the "not inside" label when there is no parent', () => {
    render(<ParentBinPicker value={null} onChange={vi.fn()} />);
    expect(fieldButton(/Not inside another bin/)).toBeInTheDocument();
  });

  it('shows the name of the current parent', () => {
    render(<ParentBinPicker value="cables" onChange={vi.fn()} />);
    expect(fieldButton(/Cables/)).toBeInTheDocument();
  });

  it('offers only top-level bins other than the bin itself', async () => {
    render(<ParentBinPicker value={null} onChange={vi.fn()} binId="self" />);
    fireEvent.click(fieldButton(/Not inside another bin/));

    expect(await screen.findByText('Toolbox')).toBeInTheDocument();
    expect(screen.getByText('Cables')).toBeInTheDocument();
    expect(screen.queryByText('Drill bits')).not.toBeInTheDocument(); // already a child
    expect(screen.queryByText('This one')).not.toBeInTheDocument(); // itself
  });

  it('selects a parent and closes the dropdown', async () => {
    const onChange = vi.fn();
    render(<ParentBinPicker value={null} onChange={onChange} binId="self" />);
    fireEvent.click(fieldButton(/Not inside another bin/));
    fireEvent.click(await screen.findByText('Toolbox'));

    expect(onChange).toHaveBeenCalledWith('toolbox');
    expect(screen.queryByText('Cables')).not.toBeInTheDocument();
  });

  it('takes the bin out of its parent', async () => {
    const onChange = vi.fn();
    render(<ParentBinPicker value="cables" onChange={onChange} />);
    fireEvent.click(fieldButton(/Cables/));
    // the field itself shows the parent's name, so the only "not inside" button is the dropdown's row
    fireEvent.click(await screen.findByRole('button', { name: /Not inside another bin/ }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('is disabled with an explanation when the bin contains other bins', () => {
    render(<ParentBinPicker value={null} onChange={vi.fn()} binId="toolbox" hasChildren />);
    expect(fieldButton(/Not inside another bin/)).toBeDisabled();
    expect(screen.getByText(/contains other bins/)).toBeInTheDocument();
  });

  it('closes on an outside click', async () => {
    render(<ParentBinPicker value={null} onChange={vi.fn()} />);
    fireEvent.click(fieldButton(/Not inside another bin/));
    expect(await screen.findByText('Cables')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('Cables')).not.toBeInTheDocument();
  });
});

describe('ParentBinPicker inside a dialog', () => {
  function Host({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
    const [open, setOpen] = useState(true);
    const [parent, setParent] = useState<string | null>(null);
    return (
      <Dialog
        open={open}
        onOpenChange={(v) => {
          onOpenChange(v);
          setOpen(v);
        }}
      >
        <DialogContent>
          <DialogTitle>Create</DialogTitle>
          <ParentBinPicker value={parent} onChange={setParent} />
        </DialogContent>
      </Dialog>
    );
  }

  it('Escape closes only the dropdown, not the dialog around it', async () => {
    const onOpenChange = vi.fn();
    render(<Host onOpenChange={onOpenChange} />);
    fireEvent.click(await screen.findByRole('button', { name: /Not inside another bin/ }));
    const search = await screen.findByPlaceholderText(/Search bins/);

    fireEvent.keyDown(search, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByPlaceholderText(/Search bins/)).not.toBeInTheDocument());
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('Escape with the dropdown closed still closes the dialog', async () => {
    const onOpenChange = vi.fn();
    render(<Host onOpenChange={onOpenChange} />);
    await screen.findByRole('dialog');

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('keeps the dialog open and the choice made after picking a parent', async () => {
    const onOpenChange = vi.fn();
    render(<Host onOpenChange={onOpenChange} />);
    fireEvent.click(await screen.findByRole('button', { name: /Not inside another bin/ }));
    fireEvent.click(await screen.findByText('Toolbox'));

    expect(await screen.findByRole('button', { name: /Toolbox/ })).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
