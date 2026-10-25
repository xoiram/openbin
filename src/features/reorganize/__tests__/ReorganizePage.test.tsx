import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bin } from '@/types';

function makeBin(id: string, overrides: Partial<Bin> = {}): Bin {
  return {
    id, short_code: id, location_id: 'loc-1', name: id, area_id: null, area_name: '', items: [], notes: '', tags: [],
    icon: 'Package', color: '', card_style: '', created_by: 'u', created_by_name: 'U', visibility: 'location',
    custom_fields: {}, created_at: '', updated_at: '', ...overrides,
  };
}

const bins = [makeBin('parent', { child_count: 1 }), makeBin('child', { parent_bin_id: 'parent' }), makeBin('solo')];

vi.mock('@/features/bins/useBins', () => ({ useBinList: () => ({ bins, isLoading: false }) }));
vi.mock('@/features/areas/useAreas', () => ({ useAreaList: () => ({ areas: [] }) }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ activeLocationId: 'loc-1', token: 't' }) }));
vi.mock('@/lib/usePermissions', () => ({ usePermissions: () => ({ canWrite: true, isLoading: false }) }));
vi.mock('@/lib/usePlan', () => ({
  usePlan: () => ({ isGated: () => false, isSelfHosted: true, planInfo: { features: {} } }),
}));
vi.mock('@/lib/terminology', () => ({
  useTerminology: () => ({ bins: 'bins', bin: 'bin', Bin: 'Bin', Bins: 'Bins', location: 'location', area: 'area' }),
}));
vi.mock('@/features/tour/TourLauncher', () => ({ TourLauncher: () => null }));
vi.mock('../ReorganizeBinsPanel', () => ({ ReorganizeBinsActionPanel: () => null }));
vi.mock('../ReorganizeTagsPanel', () => ({ ReorganizeTagsActionPanel: () => null }));
vi.mock('../ReorganizeBinsOptions', () => ({ ReorganizeBinsOptions: () => null }));
vi.mock('../ReorganizeTagsOptions', () => ({ ReorganizeTagsOptions: () => null }));
vi.mock('../useReorganize', () => ({ useReorganize: () => ({ clear: vi.fn() }) }));
vi.mock('../useReorganizeTags', () => ({ useReorganizeTags: () => ({ clear: vi.fn(), result: null }) }));
vi.mock('../useReorganizeBinsForm', () => ({ useReorganizeBinsForm: () => ({}) }));
vi.mock('../useReorganizeTagsForm', () => ({ useReorganizeTagsForm: () => ({}) }));
vi.mock('../useReorganizeMode', () => ({ useReorganizeMode: () => ({ mode: 'bins', setMode: vi.fn() }) }));
vi.mock('@/features/print/BinSelectorCard', () => ({
  BinSelectorCard: (props: { allBins: Bin[]; selectAll: () => void; selectedIds: Set<string> }) => (
    <div>
      <ul data-testid="offered">{props.allBins.map((b) => <li key={b.id}>{b.id}</li>)}</ul>
    </div>
  ),
}));

const { ReorganizePage } = await import('../ReorganizePage');

describe('ReorganizePage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('only offers top-level boxes for selection', () => {
    render(
      <MemoryRouter>
        <ReorganizePage />
      </MemoryRouter>,
    );
    const offered = screen.getByTestId('offered');
    expect(offered.textContent).toContain('parent');
    expect(offered.textContent).toContain('solo');
    expect(offered.textContent).not.toContain('child');
  });
});
