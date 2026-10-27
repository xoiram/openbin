import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigate = vi.fn();
let permissions = { isAdmin: true, isViewer: false, canWrite: true };

vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('@/lib/terminology', () => ({
  useTerminology: () => ({
    bin: 'bin', bins: 'bins', Bin: 'Bin', Bins: 'Bins',
    area: 'area', areas: 'areas', Area: 'Area', Areas: 'Areas',
    location: 'location', locations: 'locations', Location: 'Location', Locations: 'Locations',
  }),
}));
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u' }, activeLocationId: 'loc-1', setActiveLocationId: vi.fn() }),
}));
vi.mock('@/lib/usePermissions', () => ({ usePermissions: () => permissions }));
vi.mock('@/lib/usePlan', () => ({ usePlan: () => ({ isGated: () => false, isSelfHosted: true, planInfo: {} }) }));
vi.mock('@/features/locations/useLocations', () => ({
  useLocationList: () => ({
    locations: [{ id: 'loc-1', name: 'Home', member_count: 1, viewer_count: 0, bin_count: 3, area_count: 1 }],
    isLoading: false,
  }),
  leaveLocation: vi.fn(),
}));
vi.mock('@/features/locations/LocationDialogs', () => ({
  LocationCreateDialog: () => null, LocationDeleteDialog: () => null,
  LocationJoinDialog: () => null, LocationRenameDialog: () => null,
}));
vi.mock('@/features/locations/LocationInviteShare', () => ({ LocationInviteShare: () => null }));
vi.mock('@/features/locations/LocationMembersDialog', () => ({ LocationMembersDialog: () => null }));
vi.mock('@/features/locations/LocationRetentionDialog', () => ({ LocationRetentionDialog: () => null }));
vi.mock('@/features/bins/CustomFieldsDialog', () => ({ CustomFieldsDialog: () => null }));
vi.mock('../LocationSettingsMenu', () => ({ LocationSettingsMenu: () => null }));
vi.mock('../AreaDialogs', () => ({
  CreateAreaDialog: () => null,
  DeleteAreaDialog: ({ target }: { target: { looseItemCount?: number } | null }) =>
    target ? <div>delete-loose:{target.looseItemCount}</div> : null,
}));
vi.mock('../useAreas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../useAreas')>();
  const area = (id: string, parent: string | null, extra: object) => ({
    id, location_id: 'loc-1', name: id === 'a1' ? 'Garage' : 'Shelf', parent_id: parent, bin_count: 1, descendant_bin_count: 1,
    item_count: 5, descendant_item_count: 5, loose_item_count: 0, created_by: null, created_at: '', updated_at: '', ...extra,
  });
  const areas = [area('a1', null, { loose_item_count: 2, descendant_item_count: 9 }), area('a2', 'a1', { loose_item_count: 3 })];
  return {
    ...actual,
    updateArea: vi.fn(),
    useAreaList: () => ({
      areas, areaTree: actual.buildAreaTree(areas), unassignedCount: 1, unassignedItemCount: 4, isLoading: false,
    }),
  };
});

import { AreasPage } from '../AreasPage';

beforeEach(() => {
  vi.clearAllMocks();
  permissions = { isAdmin: true, isViewer: false, canWrite: true };
});

describe('AreasPage item links', () => {
  it('links an area item count to its filtered items list', () => {
    render(<AreasPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Show the 5 items in Garage' }));
    expect(navigate).toHaveBeenCalledWith('/items?area_id=a1');
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('links the unassigned card count to the unassigned items list', () => {
    render(<AreasPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Show the 4 items in Unassigned' }));
    expect(navigate).toHaveBeenCalledWith('/items?unassigned=true');
  });

  it('opens the add item dialog for an area from its menu, also for members', () => {
    permissions = { isAdmin: false, isViewer: false, canWrite: true };
    render(<AreasPage />);
    fireEvent.click(screen.getAllByRole('button', { name: 'More actions' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    expect(navigate).toHaveBeenCalledWith('/items?add=1&area_id=a1');
  });

  it('gives viewers no menu', () => {
    permissions = { isAdmin: false, isViewer: true, canWrite: false };
    render(<AreasPage />);
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
  });

  it('passes the loose items of the area and its sub-areas to the delete dialog', () => {
    render(<AreasPage />);
    fireEvent.click(screen.getAllByRole('button', { name: 'More actions' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByText('delete-loose:5')).toBeTruthy();
  });
});
