import { screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

// Opt out of the global react-i18next mock (src/test-setup.ts) for this file
// only — renderWithI18n needs the real library + real JSON resources to
// catch broken keys/missing interpolation vars/JSON typos that the mock
// (which just echoes back key/defaultValue) wouldn't. This specifically
// guards the dynamic `categories.${cat.id}.label` lookup in
// settingsCategories.ts's localizeCategory() — a key mismatch would
// silently fall back to the English defaultValue under the mocked tests
// but fail here for `nb`.
vi.unmock('react-i18next');

vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(() => ({ user: { id: '1', email: 'test@example.com', isAdmin: true } })),
}));
vi.mock('@/lib/usePermissions', () => ({
  usePermissions: vi.fn(() => ({ isAdmin: true, canWrite: true })),
}));

const { renderWithI18n } = await import('@/test/i18nTestUtils');
// SettingsLayout wires useSettingsCategories() (which calls localizeCategory
// with a real, namespace-bound `t`) into SettingsCategoryList's rendering —
// rendering SettingsCategoryList directly with hand-built category props
// would bypass localizeCategory entirely and not exercise the dynamic key.
const { SettingsLayout } = await import('../SettingsLayout');

function setDesktop(desktop: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: desktop,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function renderMobileCategoryList(language?: string) {
  setDesktop(false);
  return renderWithI18n(
    <MemoryRouter initialEntries={['/settings']}>
      <Routes>
        <Route path="/settings/*" element={<SettingsLayout />} />
      </Routes>
    </MemoryRouter>,
    language ? { language } : undefined,
  );
}

describe('SettingsCategoryList via SettingsLayout (real i18n resources)', () => {
  it('renders real English category labels', () => {
    renderMobileCategoryList();
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByText('Account')).toBeTruthy();
    expect(screen.getByText('Profile, security, API keys')).toBeTruthy();
    expect(screen.getByText('Admin Dashboard')).toBeTruthy();
  });

  it('renders the Norwegian resources when a language is requested', () => {
    renderMobileCategoryList('nb');
    expect(screen.getByText('Innstillinger')).toBeTruthy();
    expect(screen.getByText('Konto')).toBeTruthy();
    expect(screen.getByText('Profil, sikkerhet, API-nøkler')).toBeTruthy();
    expect(screen.getByText('Adminpanel')).toBeTruthy();
  });
});
