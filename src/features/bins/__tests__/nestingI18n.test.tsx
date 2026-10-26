import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.unmock('react-i18next');
vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: vi.fn(() => ({ activeLocationId: 'loc-1', token: 't' })) }));
vi.mock('@/lib/terminology', () => ({
  useTerminology: () => ({
    bin: 'boks', bins: 'bokser', Bin: 'Boks', Bins: 'Bokser', area: 'område', areas: 'områder', Area: 'Område', Areas: 'Områder',
    location: 'sted', locations: 'steder', Location: 'Sted', Locations: 'Steder',
  }),
}));
vi.mock('../useBins', () => ({ useBinList: () => ({ bins: [], isLoading: false }),
  useBinSearch: () => ({ bins: [], isLoading: false }),
  useChildBins: () => ({ bins: [], isLoading: false }),
  useBin: () => ({ bin: undefined, isLoading: false }) }));

const { renderWithI18n } = await import('@/test/i18nTestUtils');
const { DeleteBinDialog } = await import('../DeleteBinDialog');
const { ChildBinsSection } = await import('../ChildBinsSection');
const { BinBreadcrumb } = await import('../BinBreadcrumb');

describe('nested boxes, Norwegian', () => {
  it('renders the delete note with plural forms', () => {
    renderWithI18n(<DeleteBinDialog open onOpenChange={() => {}} binName="Verktøykasse" onConfirm={() => {}} childCount={3} />, { language: 'nb' });
    expect(screen.getByText('3 bokser inni det flyttes også til papirkurven.')).toBeTruthy();
  });

  it('renders the child section empty state and add button', () => {
    renderWithI18n(
      <MemoryRouter><ChildBinsSection bin={{ id: 'b', parent_bin_id: null, child_count: 0 }} canEdit onAddInside={() => {}} /></MemoryRouter>,
      { language: 'nb' },
    );
    expect(screen.getByText('Inni boks')).toBeTruthy();
    expect(screen.getByText('Ingen bokser her ennå.')).toBeTruthy();
    expect(screen.getByText('Legg til boks inni')).toBeTruthy();
  });

  it('labels the breadcrumb', () => {
    renderWithI18n(
      <MemoryRouter><BinBreadcrumb bin={{ name: 'B', area_name: 'Garasje', parent_bin_id: 'p', parent_bin_name: 'P' }} /></MemoryRouter>,
      { language: 'nb' },
    );
    expect(screen.getByRole('navigation', { name: 'Plassering' })).toBeTruthy();
  });
});
