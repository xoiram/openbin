import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bin } from '@/types';

vi.mock('@/lib/terminology', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/terminology')>();
  return { ...actual, useTerminology: () => actual.DEFAULT_TERMINOLOGY };
});
vi.mock('@/lib/auth', () => ({ useAuth: vi.fn(() => ({ activeLocationId: 'loc-1' })) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/features/pins/usePins', () => ({ pinBin: vi.fn(), unpinBin: vi.fn() }));
vi.mock('../useBins', () => ({
  deleteBin: vi.fn(() => Promise.resolve()),
  restoreBin: vi.fn(() => Promise.resolve()),
  addBin: vi.fn(() => Promise.resolve({ id: 'new-1' })),
}));

import { DEFAULT_TERMINOLOGY } from '@/lib/terminology';
import { BulkDeleteBinsDialog } from '../BulkDeleteBinsDialog';
import { addBin, deleteBin, restoreBin } from '../useBins';
import { useBulkActions } from '../useBulkActions';

function bin(id: string, name: string, extra: Partial<Bin> = {}): Bin {
  return {
    id, short_code: id.toUpperCase(), location_id: 'loc-1', name, area_id: null, area_name: '', items: [], notes: '', tags: [],
    icon: '', color: '', card_style: '', created_by: 'u1', created_by_name: 'U', visibility: 'location', custom_fields: {},
    created_at: '', updated_at: '', ...extra,
  };
}

const toolbox = bin('toolbox', 'Toolbox', { child_count: 2 });
const bits = bin('bits', 'Drill bits', { parent_bin_id: 'toolbox', parent_bin_name: 'Toolbox' });
const cables = bin('cables', 'Cables');

beforeEach(() => vi.clearAllMocks());

describe('BulkDeleteBinsDialog', () => {
  it('mentions that boxes inside go to the trash too', () => {
    render(<BulkDeleteBinsDialog open onOpenChange={vi.fn()} selectionLabel="1 bin" childCount={2} onConfirm={vi.fn()} />);
    expect(screen.getByText('2 bins inside them will go to the trash too.')).toBeInTheDocument();
  });

  it('shows no note when nothing is nested', () => {
    render(<BulkDeleteBinsDialog open onOpenChange={vi.fn()} selectionLabel="1 bin" childCount={0} onConfirm={vi.fn()} />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('confirms', async () => {
    const onConfirm = vi.fn();
    render(<BulkDeleteBinsDialog open onOpenChange={vi.fn()} selectionLabel="1 bin" childCount={1} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
  });
});

describe('useBulkActions with nested boxes', () => {
  it('counts boxes that will be trashed with the selection', () => {
    const { result } = renderHook(() => useBulkActions([toolbox, bits, cables], new Set(['toolbox', 'cables']), vi.fn(), vi.fn(), DEFAULT_TERMINOLOGY));
    expect(result.current.selectedChildCount).toBe(2);
  });

  it('does not count children that are selected themselves', () => {
    const { result } = renderHook(() => useBulkActions([toolbox, bits, cables], new Set(['toolbox', 'bits']), vi.fn(), vi.fn(), DEFAULT_TERMINOLOGY));
    expect(result.current.selectedChildCount).toBe(1);
  });

  it('does not delete a child separately when its parent is selected too', async () => {
    const showToast = vi.fn();
    const { result } = renderHook(() => useBulkActions([toolbox, bits, cables], new Set(['toolbox', 'bits', 'cables']), vi.fn(), showToast, DEFAULT_TERMINOLOGY));
    await act(async () => { await result.current.bulkDelete(); });
    expect(deleteBin).toHaveBeenCalledTimes(2);
    expect(deleteBin).toHaveBeenCalledWith('toolbox');
    expect(deleteBin).toHaveBeenCalledWith('cables');
    expect(deleteBin).not.toHaveBeenCalledWith('bits');
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ message: 'Deleted 3 bins' }));
    // Undo restores only what was deleted directly (children come back with their parent)
    await act(async () => { await showToast.mock.calls[0][0].action.onClick(); });
    expect(restoreBin).toHaveBeenCalledTimes(2);
  });

  it('duplicating a child keeps the copy inside the same parent', async () => {
    const { result } = renderHook(() => useBulkActions([bits, cables], new Set(['bits', 'cables']), vi.fn(), vi.fn(), DEFAULT_TERMINOLOGY));
    await act(async () => { await result.current.bulkDuplicate(); });
    expect(addBin).toHaveBeenCalledWith(expect.objectContaining({ name: 'Drill bits (copy)', parentBinId: 'toolbox' }));
    expect(addBin).toHaveBeenCalledWith(expect.objectContaining({ name: 'Cables (copy)', parentBinId: null }));
  });
});
