import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.unmock('react-i18next');

vi.mock('@/lib/terminology', () => ({
  useTerminology: () => ({
    bin: 'boks', bins: 'bokser', Bin: 'Boks', Bins: 'Bokser',
    area: 'sone', areas: 'soner', Area: 'Sone', Areas: 'Soner',
    location: 'sted', locations: 'steder', Location: 'Sted', Locations: 'Steder',
  }),
}));
vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));

const { renderWithI18n } = await import('@/test/i18nTestUtils');
const { AreaCard } = await import('../AreaCard');
const { DeleteAreaDialog } = await import('../AreaDialogs');

describe('area items in Norwegian', () => {
  it('renders the item count, its accessible name and the menu entry in nb', () => {
    renderWithI18n(
      <AreaCard
        id="a1" name="Garasje" binCount={2} descendantBinCount={2} itemCount={5} descendantItemCount={8}
        looseItemCount={0} depth={0} hasChildren isAdmin={false} canAddItem
        onNavigate={vi.fn()} onShowItems={vi.fn()} onAddItem={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()}
      />,
      { language: 'nb' },
    );
    expect(screen.getByRole('button', { name: 'Vis 5 gjenstander i Garasje' }).textContent).toBe('5 gjenstander (8 totalt)');
    fireEvent.click(screen.getByRole('button', { name: 'Flere handlinger' }));
    expect(screen.getByRole('button', { name: 'Legg til gjenstand' })).toBeTruthy();
  });

  it('renders the loose item warning in nb', () => {
    renderWithI18n(
      <DeleteAreaDialog target={{ id: 'a', name: 'Garasje', binCount: 0, looseItemCount: 1 }} onOpenChange={vi.fn()} locationId="l" />,
      { language: 'nb' },
    );
    expect(screen.getByText(/1 gjenstand som ligger rett i den blir ikke lenger tilordnet/)).toBeTruthy();
  });
});
