import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Real react-i18next + real locale JSON (see src/test/__tests__/i18n.test.tsx).
vi.unmock('react-i18next');

const { renderWithI18n } = await import('@/test/i18nTestUtils');
const { YearChipPager } = await import('../YearChipPager');

describe('usage i18n', () => {
  it('renders YearChipPager labels in English', () => {
    renderWithI18n(<YearChipPager years={[2024, 2025]} selected={2025} onSelect={() => {}} />);
    expect(screen.getByLabelText('Previous year')).toBeTruthy();
  });

  it('renders YearChipPager labels in Norwegian', () => {
    renderWithI18n(<YearChipPager years={[2024, 2025]} selected={2025} onSelect={() => {}} />, { language: 'nb' });
    expect(screen.getByLabelText('Forrige år')).toBeTruthy();
    expect(screen.getByLabelText('Neste år')).toBeTruthy();
  });
});
