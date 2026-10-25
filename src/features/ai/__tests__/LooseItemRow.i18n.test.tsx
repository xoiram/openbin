import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithI18n } from '@/test/i18nTestUtils';
import { LooseItemRow } from '../LooseItemRow';
import type { LooseItemQueryMatch } from '../useInventoryQuery';

vi.unmock('react-i18next');

const match = (over: Partial<LooseItemQueryMatch> = {}): LooseItemQueryMatch => ({
  kind: 'loose_item',
  bin_id: null,
  item_id: 'l1',
  name: 'Tape',
  quantity: null,
  area_id: 'a1',
  area_name: 'Garage',
  bin_path: 'Garage',
  items: [],
  total_item_count: 1,
  tags: [],
  relevance: '',
  is_trashed: false,
  icon: '',
  color: '',
  ...over,
});

describe('LooseItemRow i18n', () => {
  it.each(['en', 'nb'])('renders an item in an area (%s)', (language) => {
    renderWithI18n(<LooseItemRow match={match({ quantity: 2, bin_path: 'Garage › Shelf' })} />, { language });
    expect(screen.getByText('Tape')).toBeDefined();
    expect(screen.getByText('×2')).toBeDefined();
    expect(screen.getByText('Garage › Shelf')).toBeDefined();
  });

  it('shows a translated Unassigned subtitle in en', () => {
    renderWithI18n(<LooseItemRow match={match({ area_id: null, area_name: '', bin_path: '' })} />, { language: 'en' });
    expect(screen.getByText('Unassigned')).toBeDefined();
  });

  it('shows a translated Unassigned subtitle in nb', () => {
    renderWithI18n(<LooseItemRow match={match({ area_id: null, area_name: '', bin_path: '' })} />, { language: 'nb' });
    expect(screen.getByText('Ikke tildelt')).toBeDefined();
  });
});
