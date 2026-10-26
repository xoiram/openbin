import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bin } from '@/types';

vi.mock('@/lib/terminology', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/terminology')>();
  return { ...actual, useTerminology: () => actual.DEFAULT_TERMINOLOGY };
});
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ token: 't', activeLocationId: 'loc-1' }) }));

const showToast = vi.fn();
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ showToast }) }));

const mockBins: Bin[] = [];
vi.mock('../useBins', () => ({
  updateBin: vi.fn(() => Promise.resolve()),
  moveBin: vi.fn(() => Promise.resolve()),
  useBinList: () => ({ bins: mockBins, isLoading: false }),
}));
vi.mock('@/features/areas/AreaPicker', () => ({
  AreaPicker: ({ onChange }: { onChange: (id: string | null) => void }) => (
    <button type="button" onClick={() => onChange('area-1')}>pick area</button>
  ),
}));
vi.mock('@/features/locations/useLocations', () => ({
  useLocationList: () => ({ locations: [{ id: 'loc-1', name: 'Home' }, { id: 'loc-2', name: 'Cabin' }] }),
}));
vi.mock('@/features/locations/LocationSelectList', () => ({
  LocationSelectList: ({ locations, onChange }: { locations: { id: string; name: string }[]; onChange: (id: string) => void }) => (
    <div>{locations.map((l) => <button type="button" key={l.id} onClick={() => onChange(l.id)}>{l.name}</button>)}</div>
  ),
}));

import { BulkAreaDialog } from '../BulkAreaDialog';
import { BulkLocationDialog } from '../BulkLocationDialog';
import { BulkParentDialog } from '../BulkParentDialog';
import { buildBinBulkActions } from '../buildBinBulkActions';
import { moveBin, updateBin } from '../useBins';

function bin(id: string, name: string, extra: Partial<Bin> = {}): Bin {
  return {
    id, short_code: id.toUpperCase(), location_id: 'loc-1', name, area_id: null, area_name: '', items: [], notes: '', tags: [],
    icon: '', color: '', card_style: '', created_by: 'u1', created_by_name: 'U', visibility: 'location', custom_fields: {},
    created_at: '', updated_at: '', ...extra,
  };
}

const toolbox = bin('toolbox', 'Toolbox', { child_count: 1 });
const bits = bin('bits', 'Drill bits', { parent_bin_id: 'toolbox', parent_bin_name: 'Toolbox' });
const cables = bin('cables', 'Cables');
const shelf = bin('shelf', 'Shelf');
const all = [toolbox, bits, cables, shelf];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updateBin).mockImplementation(() => Promise.resolve());
  vi.mocked(moveBin).mockImplementation(() => Promise.resolve());
  mockBins.splice(0, mockBins.length, ...all);
});

describe('BulkAreaDialog with child boxes', () => {
  it('skips children, tells the user, and updates the rest', async () => {
    const onDone = vi.fn();
    render(<BulkAreaDialog open onOpenChange={vi.fn()} binIds={['bits', 'cables']} bins={all} onDone={onDone} />);
    expect(screen.getByText('1 bin inside another bin follows its parent and was skipped')).toBeInTheDocument();
    fireEvent.click(screen.getByText('pick area'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(updateBin).toHaveBeenCalledTimes(1);
    expect(updateBin).toHaveBeenCalledWith('cables', { areaId: 'area-1' });
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ message: '1 moved, 1 skipped' }));
  });

  it('does not let one failure abort the others', async () => {
    vi.mocked(updateBin).mockImplementation((id: string) => (id === 'cables' ? Promise.reject(new Error('Nope')) : Promise.resolve()));
    render(<BulkAreaDialog open onOpenChange={vi.fn()} binIds={['cables', 'shelf']} bins={all} onDone={vi.fn()} />);
    fireEvent.click(screen.getByText('pick area'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(updateBin).toHaveBeenCalledTimes(2);
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ message: '1 moved, 1 failed: Nope', variant: 'warning' }));
  });

  it('disables apply when only children are selected', () => {
    render(<BulkAreaDialog open onOpenChange={vi.fn()} binIds={['bits']} bins={all} onDone={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });
});

describe('BulkLocationDialog with child boxes', () => {
  it('skips children and moves the rest', async () => {
    const onDone = vi.fn();
    render(<BulkLocationDialog open onOpenChange={vi.fn()} binIds={['bits', 'cables', 'toolbox']} bins={all} onDone={onDone} />);
    expect(screen.getByText('1 bin inside another bin follows its parent and was skipped')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cabin'));
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(moveBin).toHaveBeenCalledTimes(2);
    expect(moveBin).toHaveBeenCalledWith('cables', 'loc-2');
    expect(moveBin).toHaveBeenCalledWith('toolbox', 'loc-2');
    expect(moveBin).not.toHaveBeenCalledWith('bits', expect.anything());
  });
});

describe('BulkParentDialog', () => {
  async function chooseParent(name: string) {
    fireEvent.click(screen.getByRole('button', { name: /Not inside another bin/ }));
    fireEvent.click(await screen.findByText(name));
  }

  it('moves the valid boxes into the chosen parent with parentBinId', async () => {
    const onDone = vi.fn();
    render(<BulkParentDialog open onOpenChange={vi.fn()} binIds={['cables', 'shelf']} bins={all} onDone={onDone} />);
    expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled(); // nothing chosen yet
    await chooseParent('Toolbox');
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(updateBin).toHaveBeenCalledTimes(2);
    expect(updateBin).toHaveBeenCalledWith('cables', { parentBinId: 'toolbox' });
    expect(updateBin).toHaveBeenCalledWith('shelf', { parentBinId: 'toolbox' });
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ message: '2 moved', variant: 'success' }));
  });

  it('only offers top-level boxes as targets', async () => {
    render(<BulkParentDialog open onOpenChange={vi.fn()} binIds={['cables']} bins={all} onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Not inside another bin/ }));
    expect(await screen.findByText('Toolbox')).toBeInTheDocument();
    expect(screen.queryByText('Drill bits')).not.toBeInTheDocument();
  });

  it('skips boxes that have children and the chosen parent itself, and says so', async () => {
    const withCrate = [...all, bin('crate', 'Crate', { child_count: 2 })];
    render(<BulkParentDialog open onOpenChange={vi.fn()} binIds={['toolbox', 'crate', 'shelf', 'cables']} bins={withCrate} onDone={vi.fn()} />);
    await chooseParent('Cables');
    expect(screen.getByText(/2 bins contain other bins/)).toBeInTheDocument();
    expect(screen.getByText(/can’t be placed inside itself/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(updateBin).toHaveBeenCalled());
    expect(updateBin).toHaveBeenCalledTimes(1);
    expect(updateBin).toHaveBeenCalledWith('shelf', { parentBinId: 'cables' });
    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ message: '1 moved, 3 skipped', variant: 'warning' })));
  });

  it('reports partial failures with the server message', async () => {
    vi.mocked(updateBin).mockImplementation((id: string) => (id === 'shelf' ? Promise.reject(new Error('Parent is private')) : Promise.resolve()));
    render(<BulkParentDialog open onOpenChange={vi.fn()} binIds={['cables', 'shelf']} bins={all} onDone={vi.fn()} />);
    await chooseParent('Toolbox');
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(updateBin).toHaveBeenCalledTimes(2);
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ message: '1 moved, 1 failed: Parent is private', variant: 'warning' }));
  });

  it('the take-out choice calls updateBin with null and skips top-level boxes', async () => {
    render(<BulkParentDialog open onOpenChange={vi.fn()} binIds={['bits', 'cables']} bins={all} onDone={vi.fn()} />);
    // choose the "none" option explicitly
    fireEvent.click(screen.getByRole('button', { name: /Not inside another bin/ }));
    const none = (await screen.findAllByText(/Not inside another bin/)).pop() as HTMLElement;
    fireEvent.click(none);
    expect(screen.getByText(/1 bin is already there/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(updateBin).toHaveBeenCalled());
    expect(updateBin).toHaveBeenCalledTimes(1);
    expect(updateBin).toHaveBeenCalledWith('bits', { parentBinId: null });
  });
});

describe('buildBinBulkActions move-into', () => {
  const base = {
    isAdmin: true, pinLabel: 'Pin', canCopyStyle: false, canPasteStyle: false,
    onTag: vi.fn(), onMove: vi.fn(), onDelete: vi.fn(), onAppearance: vi.fn(), onVisibility: vi.fn(),
    onMoveLocation: vi.fn(), onPin: vi.fn(), onDuplicate: vi.fn(),
  };

  it('is shown for users who can write', () => {
    const onMoveInto = vi.fn();
    const action = buildBinBulkActions({ ...base, canWrite: true, onMoveInto }).find((a) => a.id === 'moveInto');
    expect(action?.show).toBe(true);
    action?.onClick();
    expect(onMoveInto).toHaveBeenCalled();
  });

  it('is hidden for read-only users', () => {
    const action = buildBinBulkActions({ ...base, canWrite: false, onMoveInto: vi.fn() }).find((a) => a.id === 'moveInto');
    expect(action?.show).toBe(false);
  });
});
