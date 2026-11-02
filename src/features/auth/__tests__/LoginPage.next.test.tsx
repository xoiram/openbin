import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from '../LoginPage';

const loginMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ login: loginMock, refreshSession: vi.fn() }),
}));
vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {},
}));
vi.mock('@/lib/qrConfig', () => ({
  isSelfHostedInstance: () => true,
  useAuthStatusConfig: () => ({
    config: {
      registrationMode: 'open',
      registrationEnabled: true,
      oauthProviders: [],
      oidcDisplayName: null,
      passwordLoginEnabled: true,
      demoMode: false,
      tosVersion: null,
      privacyVersion: null,
      marketingOptInVisible: false,
    },
    loaded: true,
  }),
}));
vi.mock('@/lib/appSettings', () => ({
  useAppSettings: () => ({ settings: { appName: 'OpenBin' } }),
}));
vi.mock('@/lib/theme', () => ({
  useTheme: () => ({ preference: 'light', setThemePreference: vi.fn() }),
  cycleThemePreference: vi.fn(),
}));
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{`${loc.pathname}${loc.search}`}</div>;
}

async function signInAt(entry: string) {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<div data-testid="landed">Landed</div>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@test.local' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'StrongPass1!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
  await waitFor(() => expect(screen.getByTestId('landed')).toBeTruthy());
  return screen.getByTestId('location').textContent;
}

beforeEach(() => {
  loginMock.mockReset();
  loginMock.mockResolvedValue(undefined);
});

describe('LoginPage — return to the page that sent the user here', () => {
  it('goes to the dashboard by default', async () => {
    expect(await signInAt('/login')).toBe('/');
  });

  it('returns to a valid ?next= path after signing in', async () => {
    expect(await signInAt('/login?next=%2Fbin%2Fb1')).toBe('/bin/b1');
  });

  it.each([
    ['an absolute URL', 'https%3A%2F%2Fevil.example%2F'],
    ['a protocol-relative URL', '%2F%2Fevil.example'],
    ['a backslash host', '%2F%5Cevil.example'],
    ['the login page itself', '%2Flogin'],
  ])('ignores %s and falls back to the dashboard', async (_label, next) => {
    expect(await signInAt(`/login?next=${next}`)).toBe('/');
  });
});
