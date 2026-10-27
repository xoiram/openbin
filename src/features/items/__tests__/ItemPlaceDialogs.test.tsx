import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/terminology', () => ({
  useTerminology: () => ({
    bin: 'bin', bins: 'bins', Bin: 'Bin', Bins: 'Bins',
    area: 'area', areas: 'areas', Area: 'Area', Areas: 'Areas',
    location: 'location', locations: 'locations', Location: 'Location', Locations: 'Locations',
  }),
}));
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ activeLocationId: 'loc-1', token: 'tok', user: { id: 'u1' } }),
}));

const showToast = vi.fn();
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ showToast }) }));

vi.mock('@/features/areas/useAreas', async () => {
  const actual = await vi.importActual<typeof import('@/features/areas/useAreas')>('@/features/areas/useAreas');
  const areas = [
    { id: 'a1', name: 'Garage', parent_id: null, location_id: 'loc-1', bin_count: 0, descendant_bin_count: 0, created_by: null, created_at: '', updated_at: '' },
  ];
  return { ...actual, useAreaList: () => ({ areas, unassignedCount: 0, unassignedItemCount: 0, isLoading: false }) };
});

const mockAddItemsToBin = vi.fn();
const toolbox = { id: 'b1', name: 'Toolbox', icon: '', color: '', area_name: '', items: [], tags: [], notes: '', parent_bin_id: null };
vi.mock('@/features/bins/useBins', () => ({
  addItemsToBin: (...a: unknown[]) => mockAddItemsToBin(...a),
  useBin: (id?: string) => ({ bin: id === 'b1' ? toolbox : undefined, isLoading: false }),
  useBinSearch: () => ({ bins: [toolbox], isLoading: false }),
}));

const mockCreateLoose = vi.fn();
vi.mock('../looseItems', () => ({
  createLooseItem: (...a: unknown[]) => mockCreateLoose(...a),
  notifyItemsChanged: vi.fn(),
}));

import { AddItemDialog } from '../AddItemDialog';
import { BulkMoveItemsDialog } from '../BulkMoveItemsDialog';

const nameInput = () => screen.getByLabelText('Name');
const pickBox = () => fireEvent.click(screen.getByRole('button', { name: /Toolbox/ }));
async function pickArea(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByRole('radio', { name: 'In an area' }));
  fireEvent.click(within(dialog).getByRole('button', { name: /No area/ }));
  fireEvent.mouseDown(await screen.findByText('Garage'));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAddItemsToBin.mockResolvedValue([]);
  mockCreateLoose.mockResolvedValue({});
});

describe('AddItemDialog', () => {
  it('adds to a box with addItemsToBin', async () => {
    const onOpenChange = vi.fn();
    render(<AddItemDialog open onOpenChange={onOpenChange} />);
    fireEvent.change(nameInput(), { target: { value: 'Hammer' } });
    fireEvent.change(screen.getByLabelText('Quantity (optional)'), { target: { value: '4' } });
    pickBox();
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    await waitFor(() => expect(mockAddItemsToBin).toHaveBeenCalledWith('b1', [{ name: 'Hammer', quantity: 4 }]));
    expect(mockCreateLoose).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ message: 'Added Hammer to Toolbox' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('adds to an area with createLooseItem and an areaId', async () => {
    render(<AddItemDialog open onOpenChange={vi.fn()} />);
    fireEvent.change(nameInput(), { target: { value: 'Ladder' } });
    await pickArea(screen.getByRole('dialog'));
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    await waitFor(() => expect(mockCreateLoose).toHaveBeenCalledWith('loc-1', { name: 'Ladder', quantity: undefined, areaId: 'a1' }));
    expect(mockAddItemsToBin).not.toHaveBeenCalled();
  });

  it('"Not placed" creates an unassigned item (no areaId)', async () => {
    render(<AddItemDialog open onOpenChange={vi.fn()} />);
    fireEvent.change(nameInput(), { target: { value: 'Mystery' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Not placed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    await waitFor(() => expect(mockCreateLoose).toHaveBeenCalledWith('loc-1', { name: 'Mystery', quantity: undefined, areaId: null }));
  });

  it('requires a name', () => {
    render(<AddItemDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Not placed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    expect(screen.getByText('Enter a name')).toBeTruthy();
    expect(mockCreateLoose).not.toHaveBeenCalled();
  });

  it('rejects a bad quantity and disables submit until a box is picked', () => {
    render(<AddItemDialog open onOpenChange={vi.fn()} />);
    fireEvent.change(nameInput(), { target: { value: 'Nails' } });
    const submit = screen.getByRole('button', { name: 'Add item' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true); // box mode, no box yet
    pickBox();
    expect(submit.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Quantity (optional)'), { target: { value: '1.5' } });
    expect(screen.getByText('Quantity must be a whole number above zero')).toBeTruthy();
    expect(submit.disabled).toBe(true);
  });

  it('preselects the area when opened with initialAreaId', async () => {
    render(<AddItemDialog open onOpenChange={vi.fn()} initialAreaId="a1" />);
    expect(screen.getByRole('radio', { name: 'In an area' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.change(nameInput(), { target: { value: 'Rake' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    await waitFor(() => expect(mockCreateLoose).toHaveBeenCalledWith('loc-1', { name: 'Rake', quantity: undefined, areaId: 'a1' }));
  });

  it('"Add another" keeps the dialog open and clears the name', async () => {
    const onOpenChange = vi.fn();
    render(<AddItemDialog open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Not placed' }));
    fireEvent.click(screen.getByLabelText('Add another'));
    fireEvent.change(nameInput(), { target: { value: 'One' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    await waitFor(() => expect(mockCreateLoose).toHaveBeenCalledTimes(1));
    await waitFor(() => expect((nameInput() as HTMLInputElement).value).toBe(''));
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('shows the error and stays open when the request fails', async () => {
    mockCreateLoose.mockRejectedValue(new Error('Nope'));
    const onOpenChange = vi.fn();
    render(<AddItemDialog open onOpenChange={onOpenChange} />);
    fireEvent.change(nameInput(), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Not placed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error', message: 'Nope' })));
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe('BulkMoveItemsDialog', () => {
  const moveButton = () => screen.getByRole('button', { name: 'Move' }) as HTMLButtonElement;

  it('is disabled until a box is chosen, then sends exactly { binId } and the box name', async () => {
    const onApply = vi.fn().mockResolvedValue(undefined);
    render(<BulkMoveItemsDialog open onOpenChange={vi.fn()} selectedIds={['i1', 'i2']} onApply={onApply} />);
    expect(moveButton().disabled).toBe(true);
    pickBox();
    expect(moveButton().disabled).toBe(false);
    fireEvent.click(moveButton());
    await waitFor(() => expect(onApply).toHaveBeenCalledWith(['i1', 'i2'], { binId: 'b1' }, 'Toolbox'));
  });

  it('area target: disabled until an area is picked, then sends exactly { areaId }', async () => {
    const onApply = vi.fn().mockResolvedValue(undefined);
    render(<BulkMoveItemsDialog open onOpenChange={vi.fn()} selectedIds={['i1']} onApply={onApply} />);
    fireEvent.click(screen.getByRole('radio', { name: 'In an area' }));
    expect(moveButton().disabled).toBe(true);
    await pickArea(screen.getByRole('dialog'));
    expect(moveButton().disabled).toBe(false);
    fireEvent.click(moveButton());
    await waitFor(() => expect(onApply).toHaveBeenCalledWith(['i1'], { areaId: 'a1' }, 'Garage'));
  });

  it('unassigned target is immediately applicable and sends { unassigned: true }', async () => {
    const onApply = vi.fn().mockResolvedValue(undefined);
    render(<BulkMoveItemsDialog open onOpenChange={vi.fn()} selectedIds={['i1']} onApply={onApply} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Not placed' }));
    expect(moveButton().disabled).toBe(false);
    fireEvent.click(moveButton());
    await waitFor(() => expect(onApply).toHaveBeenCalledWith(['i1'], { unassigned: true }, 'Unassigned'));
  });
});
