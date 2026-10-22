import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Opt out of the global react-i18next mock (src/test-setup.ts) for this file
// only — renderWithI18n needs the real library + real JSON resources to
// catch broken keys/missing interpolation vars/JSON typos that the mock
// (which just echoes back key/defaultValue) wouldn't.
vi.unmock('react-i18next');

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(() => ({ activeLocationId: null, setActiveLocationId: vi.fn() })),
}));
vi.mock('@/lib/userPreferences', () => ({
  useUserPreferences: vi.fn(() => ({
    preferences: {} as any,
    isLoading: false,
    updatePreferences: vi.fn(),
  })),
}));
vi.mock('@/lib/terminology', () => ({
  useTerminology: () => ({ location: 'location', Location: 'Location' }),
}));

const { renderWithI18n } = await import('@/test/i18nTestUtils');
const { ThinLocationGate } = await import('../ThinLocationGate');

describe('ThinLocationGate (real i18n resources)', () => {
  it('renders real English translations', () => {
    renderWithI18n(<ThinLocationGate />);
    expect(screen.getByRole('heading', { name: 'Name your first location' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create location' })).toBeTruthy();
  });

  it('renders the Norwegian resources when a language is requested', () => {
    renderWithI18n(<ThinLocationGate />, { language: 'nb' });
    expect(screen.getByRole('heading', { name: 'Navngi ditt første location' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Opprett location' })).toBeTruthy();
  });
});
