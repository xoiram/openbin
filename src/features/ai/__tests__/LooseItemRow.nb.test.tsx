import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithI18n } from '@/test/i18nTestUtils';
import { LooseItemRow } from '../LooseItemRow';
import type { LooseItemQueryMatch } from '../useInventoryQuery';

vi.unmock('react-i18next');
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ activeLocationId: 'loc1' }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

const match: LooseItemQueryMatch = {
  kind: 'loose_item',
  bin_id: null,
  item_id: 'l1',
  name: 'Tape',
  quantity: null,
  area_id: null,
  area_name: '',
  bin_path: '',
  items: [],
  total_item_count: 1,
  tags: [],
  relevance: '',
  is_trashed: false,
  icon: '',
  color: '',
};

describe('LooseItemRow (nb)', () => {
  it('renders actions and the remove confirmation in Norwegian', async () => {
    renderWithI18n(<LooseItemRow match={match} canWrite />, { language: 'nb' });
    expect(screen.getByText('Ikke tildelt')).toBeDefined();
    await userEvent.click(screen.getByRole('button', { name: /gjenstand/i }));
    const items = screen.getAllByRole('menuitem');
    const remove = items[items.length - 1];
    await userEvent.click(remove);
    expect(screen.getByText('Dette fjerner "Tape" permanent.')).toBeDefined();
  });
});
