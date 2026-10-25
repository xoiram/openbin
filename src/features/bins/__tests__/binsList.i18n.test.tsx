import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Real react-i18next + real JSON resources (see src/test/i18nTestUtils.tsx).
vi.unmock('react-i18next');

const { renderWithI18n } = await import('@/test/i18nTestUtils');
const { DEFAULT_TERMINOLOGY } = await import('@/lib/terminology');
const { EMPTY_FILTERS } = await import('../useBins');
const { BinSearchBar } = await import('../BinSearchBar');


function renderSearchBar(language: string) {
  return renderWithI18n(
    <BinSearchBar
      search=""
      setSearch={vi.fn()}
      filters={{ ...EMPTY_FILTERS, hasItems: true }}
      setFilters={vi.fn()}
      clearAll={vi.fn()}
      areas={[]}
      getTagStyle={() => undefined}
      activeCount={1}
      hasBadges
      onOpenFilter={vi.fn()}
      term={DEFAULT_TERMINOLOGY}
    />,
    { language },
  );
}

describe('bins namespace (list)', () => {
  it('renders the bin search bar in English', () => {
    renderSearchBar('en');
    expect(screen.getByPlaceholderText('Search bins...')).toBeTruthy();
    expect(screen.getByText('Has items')).toBeTruthy();
    expect(screen.getByLabelText('Remove has items filter')).toBeTruthy();
  });

  it('renders the bin search bar in Norwegian', () => {
    renderSearchBar('nb');
    expect(screen.getByPlaceholderText('Søk i bins...')).toBeTruthy();
    expect(screen.getByText('Har gjenstander')).toBeTruthy();
    expect(screen.getByLabelText('Filtrer bins')).toBeTruthy();
  });

});
