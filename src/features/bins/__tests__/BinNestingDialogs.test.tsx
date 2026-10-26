import { fireEvent, render, screen } from '@testing-library/react';
import { Package } from 'lucide-react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { Bin, Location } from '@/types';

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: vi.fn(() => ({ activeLocationId: 'loc-1', token: 't' })) }));
vi.mock('@/lib/terminology', () => ({
  useTerminology: () => ({
    bin: 'bin', bins: 'bins', Bin: 'Bin', Bins: 'Bins', area: 'area', areas: 'areas', Area: 'Area', Areas: 'Areas',
    location: 'location', locations: 'locations', Location: 'Location', Locations: 'Locations',
  }),
}));
vi.mock('@/lib/aiCreditCost', () => ({
  useCreditCostLabel: (label: string) => ({ label, compactSuffix: '' }),
  visionWeight: () => 1,
}));
vi.mock('@/features/locations/LocationSelectList', () => ({ LocationSelectList: () => <div>locations</div> }));

import { BinDetailToolbar } from '../BinDetailToolbar';
import { DeleteBinDialog } from '../DeleteBinDialog';
import { MoveBinDialog } from '../MoveBinDialog';

const locations = [{ id: 'l2', name: 'Cabin' }] as Location[];

describe('DeleteBinDialog with children', () => {
  it('says nothing extra without children', () => {
    render(<DeleteBinDialog open onOpenChange={vi.fn()} binName="Toolbox" onConfirm={vi.fn()} />);
    expect(screen.queryByText(/trash too/)).not.toBeInTheDocument();
  });

  it('uses the singular for one child', () => {
    render(<DeleteBinDialog open onOpenChange={vi.fn()} binName="Toolbox" onConfirm={vi.fn()} childCount={1} />);
    expect(screen.getByText('The 1 bin inside it is moved to the trash too.')).toBeInTheDocument();
  });

  it('uses the plural for several children', () => {
    render(<DeleteBinDialog open onOpenChange={vi.fn()} binName="Toolbox" onConfirm={vi.fn()} childCount={3} />);
    expect(screen.getByText('The 3 bins inside it are moved to the trash too.')).toBeInTheDocument();
  });
});

describe('MoveBinDialog with children', () => {
  it('notes that the boxes inside move along', () => {
    render(<MoveBinDialog open onOpenChange={vi.fn()} binName="Toolbox" locations={locations} onConfirm={vi.fn()} childCount={2} />);
    expect(screen.getByText('The 2 bins inside it move along.')).toBeInTheDocument();
  });

  it('has no note without children', () => {
    render(<MoveBinDialog open onOpenChange={vi.fn()} binName="Toolbox" locations={locations} onConfirm={vi.fn()} />);
    expect(screen.queryByText(/move along/)).not.toBeInTheDocument();
  });
});

function toolbar(bin: Partial<Bin>, onMove = vi.fn()) {
  render(
    <MemoryRouter>
      <BinDetailToolbar
        bin={{ id: 'b', name: 'B', visibility: 'location', icon: '', ...bin } as Bin}
        canEdit canPin canDelete binIcon={Package} showAiButton={false} isAnalyzing={false} isReanalysis={false}
        analyzePhotoCount={0} otherLocations={locations} onClose={vi.fn()} onPrev={null} onNext={null}
        hasBinListContext={false} onAnalyze={vi.fn()} onTogglePin={vi.fn()} onCustomize={vi.fn()} onPrint={vi.fn()}
        onDuplicate={vi.fn()} onMove={onMove} onDelete={vi.fn()} showShareButton={false} onSaveName={vi.fn()} nameSaved={false}
      />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
  return onMove;
}

describe('BinDetailToolbar move action for nested boxes', () => {
  it('offers Move for a top-level box', () => {
    const onMove = toolbar({});
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move' }));
    expect(onMove).toHaveBeenCalled();
  });

  it('disables Move for a child and explains why', () => {
    const onMove = toolbar({ parent_bin_id: 'p', parent_bin_name: 'P' });
    const item = screen.getByRole('menuitem', { name: /Move/ });
    expect(item).toBeDisabled();
    expect(screen.getAllByText('Take it out of its parent bin first to move it to other locations.').length).toBeGreaterThan(0);
    fireEvent.click(item);
    expect(onMove).not.toHaveBeenCalled();
  });
});
