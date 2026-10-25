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
const { BulkDeleteItemsDialog } = await import('../BulkDeleteItemsDialog');
const { BulkReturnOriginalDialog } = await import('@/features/checkouts/BulkReturnOriginalDialog');

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
