import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.unmock('react-i18next');

const { renderWithI18n } = await import('@/test/i18nTestUtils');
const { Pagination } = await import('../pagination');

describe('common namespace (shared UI)', () => {
  it('renders Pagination in Norwegian', () => {
    renderWithI18n(
      <Pagination currentPage={1} totalPages={3} onPageChange={() => {}} totalCount={30} pageSize={10} />,
      { language: 'nb' },
    );
    expect(screen.getByLabelText('Neste side')).toBeTruthy();
    expect(screen.getByText(/Viser 1–10 av 30 elementer/)).toBeTruthy();
  });

  it('renders Pagination in English', () => {
    renderWithI18n(<Pagination currentPage={1} totalPages={3} onPageChange={() => {}} />);
    expect(screen.getByLabelText('Next page')).toBeTruthy();
  });
});
