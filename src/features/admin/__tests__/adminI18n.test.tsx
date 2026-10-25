import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Real react-i18next + real JSON resources (see src/test/i18nTestUtils.tsx).
vi.unmock('react-i18next');

const { renderWithI18n } = await import('@/test/i18nTestUtils');
const { AdminUserIdentityCard } = await import('../AdminUserIdentityCard');
const { AdminUserDialogs } = await import('../AdminUserDialogs');

type Detail = import('../useAdminUsers').AdminUserDetail;
type Actions = import('../useAdminUserActions').AdminUserActions;

const detail = {
  id: 'u1',
  displayName: 'Kari',
  email: 'kari@example.com',
  isAdmin: true,
  plan: 'free',
  status: 'trial',
  activeUntil: null,
  suspendedAt: null,
  deletedAt: null,
  deletionScheduledAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
  lastActiveAt: null,
} as unknown as Detail;

const suspendDialogActions = {
  suspendOpen: true,
  setSuspendOpen: vi.fn(),
  revokeSessionsOpen: false,
  revokeKeysOpen: false,
  deleteOpen: false,
  regenKeyOpen: false,
  editOpen: false,
  pendingPlan: null,
  pendingStatus: null,
  editForm: { email: '', displayName: '', password: '' },
} as unknown as Actions;

describe('admin i18n', () => {
  it('renders the identity card in Norwegian', () => {
    renderWithI18n(<AdminUserIdentityCard detail={detail} showActiveUntil={false} />, { language: 'nb' });
    expect(screen.getByText('Identitet')).toBeTruthy();
    expect(screen.getByText('Gratis')).toBeTruthy();
    expect(screen.getByText('Prøveperiode')).toBeTruthy();
  });

  it('interpolates the email into a Norwegian confirm dialog', () => {
    renderWithI18n(<AdminUserDialogs detail={detail} actions={suspendDialogActions} />, { language: 'nb' });
    expect(screen.getByText('Suspender bruker')).toBeTruthy();
    expect(screen.getByText('kari@example.com').tagName).toBe('STRONG');
    expect(screen.getByText('Avbryt')).toBeTruthy();
  });
});
