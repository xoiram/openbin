import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BulkDialog } from '@/features/bins/useBulkDialogs';
import { DEFAULT_TERMINOLOGY } from '@/lib/terminology';
import type { Bin } from '@/types';

vi.mock('@/lib/terminology', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/terminology')>();
  return { ...actual, useTerminology: () => actual.DEFAULT_TERMINOLOGY };
});
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ token: 't', activeLocationId: 'loc-1' }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/features/bins/useBins', () => ({
  updateBin: vi.fn(() => Promise.resolve()),
  moveBin: vi.fn(() => Promise.resolve()),
  useBinList: () => ({ bins: [], isLoading: false }),
}));
vi.mock('@/features/areas/AreaPicker', () => ({ AreaPicker: () => <div>area picker</div> }));
vi.mock('@/features/locations/useLocations', () => ({
  useLocationList: () => ({ locations: [{ id: 'loc-1', name: 'Home' }, { id: 'loc-2', name: 'Cabin' }] }),
}));

import { DashboardDialogs } from '../DashboardDialogs';

function bin(id: string, name: string, extra: Partial<Bin> = {}): Bin {
  return {
    id, short_code: id.toUpperCase(), location_id: 'loc-1', name, area_id: null, area_name: '', items: [], notes: '', tags: [],
    icon: '', color: '', card_style: '', created_by: 'u1', created_by_name: 'U', visibility: 'location', custom_fields: {},
    created_at: '', updated_at: '', ...extra,
  };
}

const bits = bin('bits', 'Drill bits', { parent_bin_id: 'toolbox', parent_bin_name: 'Toolbox' });
const cables = bin('cables', 'Cables');

function renderDialogs(open: BulkDialog | null, selected: string[], extra: Record<string, unknown> = {}) {
  return render(
    <MemoryRouter>
      <DashboardDialogs
        createOpen={false}
        setCreateOpen={vi.fn()}
        createInitialPhotos={null}
        createInitialGroups={null}
        onCreateInitialPhotosConsumed={vi.fn()}
        bulk={{ isOpen: (d) => d === open, open: vi.fn(), close: vi.fn() }}
        selectedIds={new Set(selected)}
        clearSelection={vi.fn()}
        allTags={[]}
        selectable
        isAdmin
        canWrite={false}
        bulkDelete={vi.fn(() => Promise.resolve())}
        bulkPinToggle={vi.fn(() => Promise.resolve())}
        bulkDuplicate={vi.fn(() => Promise.resolve())}
        pinLabel="Pin"
        bins={[bits, cables]}
        term={DEFAULT_TERMINOLOGY}
        {...extra}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('dashboard bulk dialogs and nested boxes', () => {
  it('the area dialog skips selected child boxes (it is given the bins)', async () => {
    renderDialogs('area', ['bits', 'cables']);
    expect(await screen.findByText('1 bin inside another bin follows its parent and was skipped')).toBeInTheDocument();
  });

  it('the location dialog skips selected child boxes', async () => {
    renderDialogs('location', ['bits', 'cables']);
    await waitFor(() => expect(screen.getByText(/follows its parent and was skipped/)).toBeInTheDocument());
  });
});
