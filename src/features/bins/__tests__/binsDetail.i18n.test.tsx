import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/terminology', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/terminology')>();
  return { ...actual, useTerminology: () => actual.DEFAULT_TERMINOLOGY };
});

// Real react-i18next + real JSON resources (see src/test/i18nTestUtils.tsx).
vi.unmock('react-i18next');

const { renderWithI18n } = await import('@/test/i18nTestUtils');
const { BinCreateSuccess } = await import('../BinCreateSuccess');

function renderSuccess(language: string) {
  return renderWithI18n(
    <MemoryRouter>
      <BinCreateSuccess
        createdBins={[{ id: '1', name: 'Garage', icon: 'package', color: '', itemCount: 3 }]}
        onCreateAnother={vi.fn()}
        onClose={vi.fn()}
      />
    </MemoryRouter>,
    { language },
  );
}

describe('bins namespace (detail/create)', () => {
  it('renders the create-success screen in English', () => {
    renderSuccess('en');
    expect(screen.getByText('Created Garage with 3 items')).toBeTruthy();
    expect(screen.getByText('Create another')).toBeTruthy();
  });

  it('renders the create-success screen in Norwegian', () => {
    renderSuccess('nb');
    expect(screen.getByText('Opprettet Garage med 3 gjenstander')).toBeTruthy();
    expect(screen.getByText('Opprett en til')).toBeTruthy();
  });
});
