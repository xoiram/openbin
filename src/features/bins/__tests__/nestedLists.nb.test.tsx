import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Real react-i18next + real JSON resources (see src/test/i18nTestUtils.tsx).
vi.unmock('react-i18next');

vi.mock('@/lib/terminology', () => ({
  useTerminology: () => ({
    bin: 'boks', bins: 'bokser', Bin: 'Boks', Bins: 'Bokser', area: 'område', areas: 'områder', Area: 'Område', Areas: 'Områder',
    location: 'sted', locations: 'steder', Location: 'Sted', Locations: 'Steder',
  }),
}));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

const { renderWithI18n } = await import('@/test/i18nTestUtils');
const { ParentBinLabel } = await import('../ParentBinLabel');
const { SkippedChildrenNote } = await import('../bulkNesting');
const { BulkDeleteBinsDialog } = await import('../BulkDeleteBinsDialog');

describe('nested lists (nb)', () => {
  it('renders the parent label in Norwegian', () => {
    renderWithI18n(<ParentBinLabel bin={{ parent_bin_id: 'p', parent_bin_name: 'Verktøykasse' }} />, { language: 'nb' });
    expect(screen.getByText('inni Verktøykasse')).toBeTruthy();
  });

  it('renders the skipped-children note with plurals in Norwegian', () => {
    const { rerender } = renderWithI18n(<SkippedChildrenNote count={1} />, { language: 'nb' });
    expect(screen.getByText('1 boks som ligger inni noe annet følger overordnet og ble hoppet over')).toBeTruthy();
    rerender(<SkippedChildrenNote count={3} />);
    expect(screen.getByText('3 bokser som ligger inni andre bokser følger overordnet og ble hoppet over')).toBeTruthy();
  });

  it('renders the bulk delete note in Norwegian', () => {
    renderWithI18n(<BulkDeleteBinsDialog open onOpenChange={() => {}} selectionLabel="1 boks" childCount={2} onConfirm={() => {}} />, { language: 'nb' });
    expect(screen.getByText('2 bokser inni dem havner også i papirkurven.')).toBeTruthy();
  });
});
