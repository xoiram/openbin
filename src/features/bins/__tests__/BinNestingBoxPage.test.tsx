import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bin } from '@/types';

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: vi.fn(() => ({ activeLocationId: 'loc-1', token: 't' })) }));
vi.mock('@/features/areas/AreaPicker', () => ({ AreaPicker: () => <div>area-picker</div> }));
vi.mock('../TagInput', () => ({ TagInput: () => <div>tag-input</div> }));
vi.mock('@/features/tags/useTagStyle', () => ({ useTagStyle: vi.fn(() => () => ({})) }));
vi.mock('@/lib/terminology', () => ({
  useTerminology: () => ({
    bin: 'bin', bins: 'bins', Bin: 'Bin', Bins: 'Bins', area: 'area', areas: 'areas', Area: 'Area', Areas: 'Areas',
    location: 'location', locations: 'locations', Location: 'Location', Locations: 'Locations',
  }),
}));

function mkBin(id: string, name: string, extra: Partial<Bin> = {}): Bin {
  return {
    id, short_code: id.toUpperCase(), location_id: 'loc-1', name, area_id: 'a1', area_name: 'Garage', items: [], notes: '', tags: [],
    icon: 'Package', color: '', card_style: '', created_by: 'u1', created_by_name: 'U', visibility: 'location', custom_fields: {},
    created_at: '', updated_at: '', ...extra,
  };
}

const mockBins: Bin[] = [
  mkBin('toolbox', 'Toolbox', { child_count: 2 }),
  mkBin('bits', 'Drill bits', { parent_bin_id: 'toolbox', parent_bin_name: 'Toolbox', items: [{ id: 'i1', name: 'a', quantity: null }, { id: 'i2', name: 'b', quantity: null }] }),
  mkBin('saws', 'Saws', { parent_bin_id: 'toolbox', parent_bin_name: 'Toolbox' }),
  mkBin('safe', 'Safe', { visibility: 'private', child_count: 1 }),
  mkBin('papers', 'Papers', { parent_bin_id: 'safe', parent_bin_name: 'Safe', visibility: 'private' }),
  mkBin('cables', 'Cables', { area_name: 'Office' }),
];

vi.mock('../useBins', () => ({
  useBinList: () => ({ bins: mockBins, isLoading: false }),
}));

import { BinBreadcrumb } from '../BinBreadcrumb';
import { BinDetailRail } from '../BinDetailRail';
import { ChildBinsSection } from '../ChildBinsSection';
import type { useAutoSaveBin } from '../useAutoSaveBin';

const autoSave = {
  saveAreaId: vi.fn(), saveParentBinId: vi.fn(), saveTags: vi.fn(), saveVisibility: vi.fn(),
  saveName: vi.fn(), saveNotes: vi.fn(), saveIcon: vi.fn(),
  saveColor: vi.fn(), saveCardStyle: vi.fn(), saveCustomFields: vi.fn(),
  savedFields: new Set<string>(), savingFields: new Set<string>(),
} as ReturnType<typeof useAutoSaveBin>;

function rail(bin: Bin, props: Partial<React.ComponentProps<typeof BinDetailRail>> = {}) {
  return render(
    <MemoryRouter>
      <BinDetailRail
        bin={bin} autoSave={autoSave} canEdit canChangeVisibility canChangeCode={false}
        onChangeCode={vi.fn()} allTags={[]} activeLocationId="loc-1" {...props}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('BinBreadcrumb', () => {
  it('shows Area > Parent > This with a link to the parent', () => {
    render(<MemoryRouter><BinBreadcrumb bin={mkBin('bits', 'Drill bits', { parent_bin_id: 'toolbox', parent_bin_name: 'Toolbox' })} /></MemoryRouter>);
    expect(screen.getByText('Garage')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Toolbox' })).toHaveAttribute('href', '/bin/toolbox');
    expect(screen.getByText('Drill bits')).toHaveAttribute('aria-current', 'page');
  });

  it('omits the parent segment for a top-level box', () => {
    render(<MemoryRouter><BinBreadcrumb bin={mkBin('cables', 'Cables')} /></MemoryRouter>);
    expect(screen.getByText('Garage')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('omits the area segment when the box has none, and renders nothing with no path at all', () => {
    const { container, rerender } = render(
      <MemoryRouter><BinBreadcrumb bin={mkBin('bits', 'Drill bits', { area_name: '', parent_bin_id: 'toolbox', parent_bin_name: 'Toolbox' })} /></MemoryRouter>,
    );
    expect(screen.queryByText('Garage')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Toolbox' })).toBeInTheDocument();
    rerender(<MemoryRouter><BinBreadcrumb bin={mkBin('x', 'X', { area_name: '' })} /></MemoryRouter>);
    expect(container.querySelector('nav')).toBeNull();
  });
});

describe('ChildBinsSection', () => {
  it('lists the child boxes and opens the create flow with the add button', () => {
    const onAdd = vi.fn();
    render(<MemoryRouter><ChildBinsSection bin={mkBin('toolbox', 'Toolbox', { child_count: 2 })} canEdit onAddInside={onAdd} /></MemoryRouter>);
    expect(screen.getByText('Inside this bin')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Drill bits/ })).toHaveAttribute('href', '/bin/bits');
    expect(screen.getByText('2 items')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Saws/ })).toBeInTheDocument();
    expect(screen.queryByText('Papers')).not.toBeInTheDocument(); // another parent's child
    fireEvent.click(screen.getByRole('button', { name: /Add bin inside/ }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state with the add button for writers when there are no children', () => {
    render(<MemoryRouter><ChildBinsSection bin={mkBin('cables', 'Cables')} canEdit onAddInside={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText('No bins inside yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add bin inside/ })).toBeInTheDocument();
  });

  it('is hidden for viewers when there are no children, and has no add button for viewers otherwise', () => {
    const { container, rerender } = render(<MemoryRouter><ChildBinsSection bin={mkBin('cables', 'Cables')} canEdit={false} onAddInside={vi.fn()} /></MemoryRouter>);
    expect(container.querySelector('section')).toBeNull();
    rerender(<MemoryRouter><ChildBinsSection bin={mkBin('toolbox', 'Toolbox', { child_count: 2 })} canEdit={false} onAddInside={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText('Drill bits')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add bin inside/ })).not.toBeInTheDocument();
  });

  it('is not shown on a child box', () => {
    const { container } = render(
      <MemoryRouter><ChildBinsSection bin={mkBin('bits', 'Drill bits', { parent_bin_id: 'toolbox' })} canEdit onAddInside={vi.fn()} /></MemoryRouter>,
    );
    expect(container.querySelector('section')).toBeNull();
  });
});

describe('BinDetailRail nesting', () => {
  it('nests a top-level box through the Inside picker', async () => {
    rail(mkBin('cables', 'Cables'));
    fireEvent.click(screen.getByRole('button', { name: /Not inside another bin/ }));
    fireEvent.click(await screen.findByText('Toolbox'));
    expect(autoSave.saveParentBinId).toHaveBeenCalledWith('toolbox');
    // the box itself and existing children are not offered
    expect(screen.queryByText('Drill bits')).not.toBeInTheDocument();
  });

  it('un-nests a child with the picker, and shows its area read-only', async () => {
    rail(mkBin('bits', 'Drill bits', { parent_bin_id: 'toolbox', parent_bin_name: 'Toolbox' }));
    expect(screen.getByTestId('inherited-area')).toHaveTextContent('Garage');
    expect(screen.queryByText('area-picker')).not.toBeInTheDocument();
    expect(screen.getByText('Follows the parent bin.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Toolbox/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Not inside another bin/ }));
    expect(autoSave.saveParentBinId).toHaveBeenCalledWith(null);
  });

  it('disables the picker for a box that has children', () => {
    rail(mkBin('toolbox', 'Toolbox', { child_count: 2 }));
    expect(screen.getByRole('button', { name: /Not inside another bin/ })).toBeDisabled();
    expect(screen.getByText(/contains other bins/)).toBeInTheDocument();
  });

  it('keeps top-level boxes on the normal area picker', () => {
    rail(mkBin('cables', 'Cables'));
    expect(screen.getByText('area-picker')).toBeInTheDocument();
    expect(screen.queryByTestId('inherited-area')).not.toBeInTheDocument();
  });

  it('disables the picker for viewers (and hides it when the box is not nested)', () => {
    const { unmount } = rail(mkBin('bits', 'Drill bits', { parent_bin_id: 'toolbox', parent_bin_name: 'Toolbox' }), { canEdit: false, canChangeVisibility: false });
    expect(screen.getByRole('button', { name: /Toolbox/ })).toBeDisabled();
    unmount();
    rail(mkBin('cables', 'Cables'), { canEdit: false, canChangeVisibility: false });
    expect(screen.queryByRole('button', { name: /Not inside another bin/ })).not.toBeInTheDocument();
  });

  it('cannot pick "Everyone" for a child of a private parent', () => {
    rail(mkBin('papers', 'Papers', { parent_bin_id: 'safe', parent_bin_name: 'Safe', visibility: 'private' }), { parentVisibility: 'private' });
    expect(screen.getByRole('radio', { name: /Everyone/ })).toBeDisabled();
    expect(screen.getByText(/Must stay private while the parent bin is private/)).toBeInTheDocument();
  });

  it('allows "Everyone" for a child of a public parent', () => {
    rail(mkBin('bits', 'Drill bits', { parent_bin_id: 'toolbox', parent_bin_name: 'Toolbox' }), { parentVisibility: 'location' });
    expect(screen.getByRole('radio', { name: /Everyone/ })).not.toBeDisabled();
  });
});
