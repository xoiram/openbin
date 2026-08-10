import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

// Opt out of the global react-i18next mock (src/test-setup.ts) for this file
// only — renderWithI18n needs the real library + real JSON resources to
// catch broken keys/missing interpolation vars/JSON typos that the mock
// (which just echoes back key/defaultValue) wouldn't.
vi.unmock('react-i18next');

vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(() => ({
    user: {
      id: '1',
      displayName: 'Test User',
      email: 'test@example.com',
      avatarUrl: null,
      createdAt: '2025-01-01T00:00:00Z',
      hasPassword: false,
    },
    updateUser: vi.fn(),
    deleteAccount: vi.fn(),
    recoverAccount: vi.fn(),
  })),
}));
vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(() => Promise.resolve({ results: [] })),
  getAvatarUrl: vi.fn((url: string) => url),
}));
vi.mock('@/features/locations/useLocations', () => ({
  useLocationList: vi.fn(() => ({ locations: [], isLoading: false })),
}));
vi.mock('@/components/ui/toast', () => ({
  useToast: vi.fn(() => ({ showToast: vi.fn() })),
}));
vi.mock('@/lib/usePlan', () => ({
  usePlan: () => ({ isGated: () => false, isSelfHosted: true, planInfo: null }),
}));
vi.mock('../useApiKeys', () => ({
  useApiKeys: vi.fn(() => ({ keys: [], isLoading: false })),
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
}));
vi.mock('@/lib/userPreferences', () => ({
  useUserPreferences: vi.fn(() => ({
    preferences: { dismissed_upgrade_prompts: [] as string[] },
    isLoading: false,
    updatePreferences: vi.fn(),
  })),
}));

const { renderWithI18n } = await import('@/test/i18nTestUtils');
const { AccountSection } = await import('../sections/AccountSection');

function renderAccount(language?: string) {
  global.fetch = vi.fn(() =>
    Promise.resolve({ json: () => Promise.resolve({ oauthProviders: [] }) } as Response),
  );
  return renderWithI18n(
    <MemoryRouter>
      <AccountSection />
    </MemoryRouter>,
    language ? { language } : undefined,
  );
}

describe('AccountSection (real i18n resources)', () => {
  it('renders real English translations', () => {
    renderAccount();
    expect(screen.getByText('Account')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'API Keys' })).toBeTruthy();
    expect(screen.getByText('Danger Zone')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Delete Account/ })).toBeTruthy();
  });

  it('renders the Norwegian resources when a language is requested', () => {
    renderAccount('nb');
    expect(screen.getByText('Konto')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'API-nøkler' })).toBeTruthy();
    expect(screen.getByText('Faresone')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Slett konto/ })).toBeTruthy();
  });
});
