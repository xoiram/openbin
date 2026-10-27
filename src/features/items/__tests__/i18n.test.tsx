import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Real react-i18next + real locale JSON (see src/test/__tests__/i18n.test.tsx).
vi.unmock('react-i18next');
vi.mock('@/lib/terminology', () => ({
  useTerminology: () => ({
    bin: 'boks', bins: 'bokser', Bin: 'Boks', Bins: 'Bokser',
    area: 'area', areas: 'areas', Area: 'Area', Areas: 'Areas',
    location: 'location', locations: 'locations', Location: 'Location', Locations: 'Locations',
  }),
}));

const { renderWithI18n } = await import('@/test/i18nTestUtils');
const { AddItemDialog } = await import('../AddItemDialog');
const { ItemFilterBar } = await import('../ItemFilterBar');
const { ItemTableView } = await import('../ItemTableView');
const { MemoryRouter } = await import('react-router-dom');
const { BulkDeleteItemsDialog } = await import('../BulkDeleteItemsDialog');
const { BulkReturnOriginalDialog } = await import('@/features/checkouts/BulkReturnOriginalDialog');

vi.mock('@/lib/auth', () => ({ useAuth: () => ({ activeLocationId: 'loc-1', token: 't', user: { id: 'u' } }) }));
vi.mock('@/features/areas/useAreas', async () => {
  const actual = await vi.importActual<typeof import('@/features/areas/useAreas')>('@/features/areas/useAreas');
  return { ...actual, useAreaList: () => ({ areas: [], unassignedCount: 0, unassignedItemCount: 0, isLoading: false }) };
});
vi.mock('@/features/bins/useBins', () => ({
  addItemsToBin: vi.fn(),
  useBin: () => ({ bin: undefined, isLoading: false }),
  useBinSearch: () => ({ bins: [], isLoading: false }),
}));

describe('looseItems i18n (nb)', () => {
  it('renders the Add item dialog in Norwegian with interpolated nouns', () => {
    renderWithI18n(<AddItemDialog open onOpenChange={vi.fn()} />, { language: 'nb' });
    expect(screen.getAllByText('Legg til gjenstand').length).toBeGreaterThan(0);
    expect(screen.getByText('Legg gjenstanden i boks eller area, eller la den være uplassert.')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'I boks' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Ikke plassert' })).toBeTruthy();
  });

  it('renders the filter bar in Norwegian', () => {
    renderWithI18n(
      <ItemFilterBar filters={{ loose: true }} hasFilters onAreaChange={vi.fn()} onUnassignedChange={vi.fn()} onLooseChange={vi.fn()} onClear={vi.fn()} />,
      { language: 'nb' },
    );
    expect(screen.getByRole('button', { name: 'Ikke i boks' })).toBeTruthy();
    expect(screen.getByText('Fjern filtre')).toBeTruthy();
  });

  it('renders the location column header and row menu in Norwegian', () => {
    const entry = { id: 'i', name: 'Hammer', quantity: null, bin_id: null, bin_name: null, bin_icon: null, bin_color: null, area_id: null, area_name: null };
    renderWithI18n(
      <MemoryRouter>
        <ItemTableView
          items={[entry]} sortColumn="alpha" sortDirection="asc" onSortChange={vi.fn()} searchQuery="" hasMore={false}
          isLoadingMore={false} loadMore={vi.fn()} rowActions={{ onEdit: vi.fn(), onCheckout: vi.fn(), onMove: vi.fn(), onDelete: vi.fn() }}
        />
      </MemoryRouter>,
      { language: 'nb' },
    );
    expect(screen.getByRole('button', { name: 'Sorter etter Oppbevares i' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Handlinger for gjenstand' })).toBeTruthy();
    expect(screen.getByText('Ikke tildelt')).toBeTruthy();
  });
});

describe('items/checkouts i18n', () => {
  it('renders the bulk delete dialog in English with plurals', () => {
    renderWithI18n(<BulkDeleteItemsDialog open onOpenChange={vi.fn()} count={1} onConfirm={vi.fn()} />);
    expect(screen.getByText('Delete 1 item?')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
  });

  it('renders the bulk delete dialog in Norwegian', () => {
    renderWithI18n(<BulkDeleteItemsDialog open onOpenChange={vi.fn()} count={3} onConfirm={vi.fn()} />, {
      language: 'nb',
    });
    expect(screen.getByText('Slette 3 gjenstander?')).toBeTruthy();
    expect(screen.getByText('Du kan angre dette rett etterpå.')).toBeTruthy();
    expect(screen.getByText('Avbryt')).toBeTruthy();
  });

  it('renders the bulk return dialog in Norwegian', () => {
    renderWithI18n(<BulkReturnOriginalDialog open onOpenChange={vi.fn()} count={1} onConfirm={vi.fn()} />, {
      language: 'nb',
    });
    expect(screen.getByText('Returnere 1 gjenstand til opprinnelig boks?')).toBeTruthy();
    expect(screen.getByText('Returner')).toBeTruthy();
  });
});
