import { render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/lib/auth';
import { AuthGuard } from '../AuthGuard';

vi.mock('@/lib/auth', () => ({ useAuth: vi.fn() }));
vi.mock('@/lib/qrConfig', () => ({
  isSelfHostedInstance: () => true,
  useAuthStatusConfig: () => ({
    config: {
      registrationMode: 'open',
      registrationEnabled: true,
      oauthProviders: [],
      demoMode: false,
      tosVersion: null,
      privacyVersion: null,
      marketingOptInVisible: false,
    },
    loaded: true,
  }),
}));

vi.mock('@/features/bins/PublicBinPage', () => ({
  PublicBinPage: ({ binId }: { binId: string }) => <div data-testid="public-bin-page">{binId}</div>,
}));

const mockedUseAuth = vi.mocked(useAuth);

function renderWithRouter() {
  return render(
    <MemoryRouter initialEntries={['/protected']}>
      <Routes>
        <Route
          path="/protected"
          element={
            <AuthGuard>
              <div data-testid="child-content">Protected content</div>
            </AuthGuard>
          }
        />
        <Route path="/login" element={<div data-testid="login-page">Login</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AuthGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders spinner while loading', () => {
    mockedUseAuth.mockReturnValue({ user: null, loading: true } as ReturnType<typeof useAuth>);
    renderWithRouter();
    expect(document.querySelector('.animate-spin')).toBeTruthy();
    expect(screen.queryByTestId('child-content')).toBeNull();
  });

  it('navigates to /login when unauthenticated', () => {
    mockedUseAuth.mockReturnValue({ user: null, loading: false } as ReturnType<typeof useAuth>);
    renderWithRouter();
    expect(screen.queryByTestId('child-content')).toBeNull();
    expect(screen.getByTestId('login-page')).toBeTruthy();
  });

  it('renders children when authenticated', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: '1', email: 'test@example.com' },
      loading: false,
    } as ReturnType<typeof useAuth>);
    renderWithRouter();
    expect(screen.getByTestId('child-content')).toBeTruthy();
  });

  it('does not show spinner when authenticated', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: '1', email: 'test@example.com' },
      loading: false,
    } as ReturnType<typeof useAuth>);
    renderWithRouter();
    expect(document.querySelector('.animate-spin')).toBeNull();
  });
});

// Mirrors App.tsx: AuthGuard wraps a pathless layout route that holds every protected page.
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AuthGuard><Outlet /></AuthGuard>}>
          <Route path="/bin/:id" element={<div data-testid="bin-page">Bin</div>} />
          <Route path="/bins" element={<div data-testid="bins-page">Bins</div>} />
        </Route>
        <Route path="/login" element={<div data-testid="login-page">Login</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AuthGuard — public QR view', () => {
  const anonymous = { user: null, loading: false } as ReturnType<typeof useAuth>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the public page for an anonymous visitor on /bin/:id, with the id', async () => {
    mockedUseAuth.mockReturnValue(anonymous);
    renderAt('/bin/abc-123');

    expect((await screen.findByTestId('public-bin-page')).textContent).toBe('abc-123');
    expect(screen.queryByTestId('login-page')).toBeNull();
    expect(screen.queryByTestId('bin-page')).toBeNull();
  });

  it('still redirects anonymous visitors from every other protected path', () => {
    mockedUseAuth.mockReturnValue(anonymous);
    renderAt('/bins');
    expect(screen.getByTestId('login-page')).toBeTruthy();
    expect(screen.queryByTestId('public-bin-page')).toBeNull();
  });

  it('does not treat deeper paths under /bin/:id as the public page', () => {
    mockedUseAuth.mockReturnValue(anonymous);
    renderAt('/bin/abc/extra');
    expect(screen.queryByTestId('public-bin-page')).toBeNull();
  });

  it('gives logged-in users the normal page, not the public one', () => {
    mockedUseAuth.mockReturnValue({ user: { id: '1', email: 'a@test.local' }, loading: false } as ReturnType<typeof useAuth>);
    renderAt('/bin/abc-123');
    expect(screen.getByTestId('bin-page')).toBeTruthy();
    expect(screen.queryByTestId('public-bin-page')).toBeNull();
  });

  it('waits for the session check before deciding, so a member is never shown the public page', () => {
    mockedUseAuth.mockReturnValue({ user: null, loading: true } as ReturnType<typeof useAuth>);
    renderAt('/bin/abc-123');
    expect(document.querySelector('.animate-spin')).toBeTruthy();
    expect(screen.queryByTestId('public-bin-page')).toBeNull();
    expect(screen.queryByTestId('login-page')).toBeNull();
  });
});
