import type { TFunction } from 'i18next';
import { Calendar, Check, Copy, Eye, EyeOff, Key, Link2, Link2Off, Loader2, MapPin, Plus, Trash2 } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PasswordChecklist } from '@/components/ui/password-checklist';
import { useToast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import { useLocationList } from '@/features/locations/useLocations';
import { compressImage } from '@/features/photos/compressImage';
import { apiFetch, getAvatarUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { allChecksPassing, computePasswordChecks } from '@/lib/passwordStrength';
import { useAuthStatusConfig } from '@/lib/qrConfig';
import { usePlan } from '@/lib/usePlan';
import { useUserPreferences } from '@/lib/userPreferences';
import { useWarnOnUnload } from '@/lib/useWarnOnUnload';
import { EMAIL_REGEX, getErrorMessage } from '@/lib/utils';
import type { User } from '@/types';
import { DeleteAccountDialog, DeletionPendingBanner } from '../dialogs/DeleteAccountDialog';
import { SettingsListRow } from '../SettingsListRow';
import { SettingsPageHeader } from '../SettingsPageHeader';
import { SettingsProfileHeader } from '../SettingsProfileHeader';
import { SettingsSection } from '../SettingsSection';
import { createApiKey, revokeApiKey, useApiKeys } from '../useApiKeys';

const UpgradePrompt = __EE__
  ? lazy(() => import('@/ee/UpgradePrompt').then(m => ({ default: m.UpgradePrompt })))
  : (() => null) as React.FC<Record<string, unknown>>;

function formatDate(iso: string | null, t: TFunction<'settings'>): string {
  if (!iso) return t('account.never', { defaultValue: 'Never' });
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function validateDisplayName(value: string, t: TFunction<'settings'>): string | undefined {
  if (!value.trim()) return t('account.displayNameRequired', { defaultValue: 'Display name is required' });
  return undefined;
}

export function AccountSection() {
  const { user, updateUser } = useAuth();
  const { showToast } = useToast();
  const { locations } = useLocationList();
  const { t } = useTranslation('settings');

  // Profile form
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileErrors, setProfileErrors] = useState<{ displayName?: string; email?: string }>({});

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // Avatar
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarKey, setAvatarKey] = useState(() => Date.now());

  // Connected accounts (OAuth)
  const [oauthLinks, setOauthLinks] = useState<{ provider: string; email: string | null; created_at: string }[]>([]);
  const { config: authStatus } = useAuthStatusConfig();
  const oauthProviders = authStatus.oauthProviders;
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const hasPassword = user?.hasPassword !== false;
  const passwordLoginEnabled = authStatus.passwordLoginEnabled;
  const hasUsablePasswordFallback = hasPassword && passwordLoginEnabled;

  // API keys
  const { isGated, isSelfHosted, planInfo } = usePlan();
  const apiKeysGated = !isSelfHosted && isGated('apiKeys');
  const { preferences } = useUserPreferences();
  const apiKeysDismissed = preferences.dismissed_upgrade_prompts.includes('apiKeys');
  const { keys, isLoading: keysLoading } = useApiKeys(!apiKeysGated);
  const [createOpen, setCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  // Delete account
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Dirty state + beforeunload guard
  const profileDirty = user
    ? displayName !== (user.displayName || '') || email !== (user.email || '')
    : false;
  useWarnOnUnload(profileDirty);

  useEffect(() => {
    const abort = new AbortController();
    apiFetch<{ results: { provider: string; email: string | null; created_at: string }[] }>(
      '/api/auth/oauth/links',
      { signal: abort.signal },
    )
      .then((data) => setOauthLinks(data.results))
      .catch((err) => {
        if (abort.signal.aborted) return;
        showToast({
          message: getErrorMessage(err, t('account.connectedAccountsLoadFailed', { defaultValue: 'Failed to load connected accounts' })),
          variant: 'error',
        });
      });
    return () => { abort.abort(); };
  }, [showToast, t]);

  const passwordChecks = useMemo(() => computePasswordChecks(newPassword), [newPassword]);

  // Reset form state when dialog opens (not on close, to avoid flash during exit animation)
  useEffect(() => {
    if (createOpen) {
      setNewKey(null);
      setKeyName('');
      setCopied(false);
    }
  }, [createOpen]);

  if (!user) return null;

  const avatarSrc = user.avatarUrl ? `${getAvatarUrl(user.avatarUrl)}?v=${avatarKey}` : null;

  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
    : t('account.memberSinceUnknown', { defaultValue: 'Unknown' });

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    const nameError = validateDisplayName(displayName, t);
    const trimmedEmail = email.trim();
    const emailError = trimmedEmail && !EMAIL_REGEX.test(trimmedEmail)
      ? t('account.emailInvalid', { defaultValue: 'Enter a valid email address' })
      : undefined;
    if (nameError || emailError) {
      setProfileErrors({ displayName: nameError || undefined, email: emailError });
      return;
    }
    setProfileErrors({});
    setSavingProfile(true);
    try {
      const updated = await apiFetch<User>('/api/auth/profile', {
        method: 'PUT',
        body: { displayName: displayName.trim(), email: email.trim() || null },
      });
      updateUser(updated);
      showToast({ message: t('account.profileUpdated', { defaultValue: 'Profile updated' }), variant: 'success' });
    } catch (err) {
      showToast({ message: getErrorMessage(err, t('account.profileUpdateFailed', { defaultValue: 'Failed to update profile' })), variant: 'error' });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError('');
    if (!allChecksPassing(passwordChecks)) {
      setPasswordError(t('account.passwordRequirementsNotMet', { defaultValue: 'Password does not meet all requirements' }));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t('account.passwordsDoNotMatch', { defaultValue: 'Passwords do not match' }));
      return;
    }
    setSavingPassword(true);
    try {
      await apiFetch('/api/auth/password', {
        method: 'PUT',
        body: { currentPassword, newPassword },
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordError('');
      showToast({ message: t('account.passwordUpdated', { defaultValue: 'Password updated' }), variant: 'success' });
    } catch (err) {
      setPasswordError(getErrorMessage(err, t('account.passwordUpdateFailed', { defaultValue: 'Failed to change password' })));
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleAvatarUpload(file: File) {
    setUploadingAvatar(true);
    try {
      const compressed = await compressImage(file);
      const formData = new FormData();
      formData.append('avatar', compressed, file.name);
      const result = await apiFetch<{ avatarUrl: string }>('/api/auth/avatar', {
        method: 'POST',
        body: formData,
      });
      if (user) updateUser({ ...user, avatarUrl: result.avatarUrl });
      setAvatarKey(Date.now());
      showToast({ message: t('account.avatarUpdated', { defaultValue: 'Avatar updated' }), variant: 'success' });
    } catch (err) {
      showToast({ message: getErrorMessage(err, t('account.avatarUploadFailed', { defaultValue: 'Failed to upload avatar' })), variant: 'error' });
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleRemoveAvatar() {
    setUploadingAvatar(true);
    try {
      await apiFetch('/api/auth/avatar', { method: 'DELETE' });
      if (user) updateUser({ ...user, avatarUrl: null });
      showToast({ message: t('account.avatarRemoved', { defaultValue: 'Avatar removed' }), variant: 'success' });
    } catch (err) {
      showToast({ message: getErrorMessage(err, t('account.avatarRemoveFailed', { defaultValue: 'Failed to remove avatar' })), variant: 'error' });
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleCreateKey(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const result = await createApiKey(keyName.trim());
      setNewKey(result.key);
      setKeyName('');
    } catch (err) {
      showToast({ message: getErrorMessage(err, t('account.createKeyFailed', { defaultValue: 'Failed to create API key' })), variant: 'error' });
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke() {
    if (!revokeId) return;
    setRevoking(true);
    try {
      await revokeApiKey(revokeId);
      showToast({ message: t('account.apiKeyRevoked', { defaultValue: 'API key revoked' }), variant: 'success' });
      setRevokeId(null);
    } catch (err) {
      showToast({ message: getErrorMessage(err, t('account.revokeKeyFailed', { defaultValue: 'Failed to revoke API key' })), variant: 'error' });
    } finally {
      setRevoking(false);
    }
  }

  async function handleCopy() {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast({ message: t('account.copyFailed', { defaultValue: 'Failed to copy' }), variant: 'error' });
    }
  }

  return (
    <>
      <SettingsPageHeader
        title={t('account.title', { defaultValue: 'Account' })}
        description={t('account.description', { defaultValue: 'Manage your profile, password, and access keys.' })}
      />

      <SettingsSection label={t('account.profileSection', { defaultValue: 'Profile' })}>
        <SettingsProfileHeader
          avatarUrl={avatarSrc}
          displayName={user.displayName || user.email}
          email={user.email}
          uploading={uploadingAvatar}
          onAvatarUpload={handleAvatarUpload}
          onAvatarRemove={handleRemoveAvatar}
          meta={
            <>
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {memberSince}
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {t('account.locationCount', { count: locations.length, defaultValue: '{{count}} location' })}
              </span>
            </>
          }
        />

        <form onSubmit={handleSaveProfile} className="flex flex-col gap-3 pt-5">
          <FormField
            label={t('account.displayNameLabel', { defaultValue: 'Display Name' })}
            htmlFor="profile-name"
            hint={t('account.displayNameHint', { defaultValue: 'Shown to other members of shared locations.' })}
            error={profileErrors.displayName}
          >
            <Input
              id="profile-name"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                if (profileErrors.displayName) setProfileErrors((prev) => ({ ...prev, displayName: undefined }));
              }}
              onBlur={() => {
                const err = validateDisplayName(displayName, t);
                if (err) setProfileErrors({ displayName: err });
              }}
              maxLength={100}
              required
              aria-invalid={!!profileErrors.displayName}
            />
          </FormField>
          <FormField
            label={t('account.emailLabel', { defaultValue: 'Email' })}
            htmlFor="profile-email"
            hint={t('account.emailHint', { defaultValue: 'Optional — used for account recovery' })}
            error={profileErrors.email}
          >
            <Input
              id="profile-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (profileErrors.email) setProfileErrors((prev) => ({ ...prev, email: undefined }));
              }}
              placeholder={t('account.emailPlaceholder', { defaultValue: 'you@example.com' })}
              autoComplete="email"
              aria-invalid={!!profileErrors.email}
            />
          </FormField>
          <Button
            type="submit"
            disabled={savingProfile || !displayName.trim() || !profileDirty}
            className="self-start mt-1"
          >
            {savingProfile
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('account.savingProfile', { defaultValue: 'Saving...' })}</>
              : t('account.saveProfile', { defaultValue: 'Save Profile' })}
          </Button>
        </form>
      </SettingsSection>

      {hasPassword && passwordLoginEnabled && (
        <SettingsSection label={t('account.passwordSection', { defaultValue: 'Password' })} dividerAbove>
          <form onSubmit={handleChangePassword} className="flex flex-col gap-3">
            <FormField
              label={t('account.currentPasswordLabel', { defaultValue: 'Current Password' })}
              htmlFor="current-password"
              hint={t('account.currentPasswordHint', { defaultValue: "Required to verify it's you." })}
            >
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </FormField>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <FormField
                label={t('account.newPasswordLabel', { defaultValue: 'New Password' })}
                htmlFor="new-password"
                hint={t('account.newPasswordHint', { defaultValue: 'Must meet the requirements below.' })}
              >
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      if (passwordError) setPasswordError('');
                    }}
                    autoComplete="new-password"
                    className="pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors duration-150"
                    aria-label={
                      showNewPassword
                        ? t('account.hidePassword', { defaultValue: 'Hide password' })
                        : t('account.showPassword', { defaultValue: 'Show password' })
                    }
                    tabIndex={-1}
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </FormField>
              <FormField
                label={t('account.confirmPasswordLabel', { defaultValue: 'Confirm Password' })}
                htmlFor="confirm-password"
                hint={t('account.confirmPasswordHint', { defaultValue: 'Re-type the new password exactly.' })}
              >
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (passwordError) setPasswordError('');
                  }}
                  autoComplete="new-password"
                  required
                />
              </FormField>
            </div>

            {newPassword && <PasswordChecklist checks={passwordChecks} />}

            {passwordError && (
              <p role="alert" className="settings-row-desc text-[var(--destructive)]">{passwordError}</p>
            )}

            <Button
              type="submit"
              disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
              className="self-start mt-1"
            >
              {savingPassword
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('account.updatingPassword', { defaultValue: 'Updating...' })}</>
                : t('account.updatePassword', { defaultValue: 'Update Password' })}
            </Button>
          </form>
        </SettingsSection>
      )}

      {oauthProviders.length > 0 && (
        <SettingsSection label={t('account.connectedAccountsSection', { defaultValue: 'Connected Accounts' })} dividerAbove>
          {oauthProviders.map((provider) => {
            const link = oauthLinks.find((l) => l.provider === provider);
            const providerLabel = provider === 'google'
              ? t('account.googleProvider', { defaultValue: 'Google' })
              : provider === 'apple'
                ? t('account.appleProvider', { defaultValue: 'Apple' })
                : authStatus.oidcDisplayName || t('account.ssoProvider', { defaultValue: 'Single Sign-On' });
            const canUnlink = oauthLinks.length > 1 || hasUsablePasswordFallback;
            const hintId = `${provider}-unlink-hint`;

            return (
              <SettingsListRow
                key={provider}
                icon={Link2}
                title={providerLabel}
                meta={
                  <>
                    {link ? (link.email || t('account.connected', { defaultValue: 'Connected' })) : t('account.notConnected', { defaultValue: 'Not connected' })}
                    {link && !canUnlink && (
                      <span id={hintId} className="block mt-0.5">
                        {passwordLoginEnabled
                          ? t('account.setPasswordToDisconnect', { defaultValue: 'Set a password to disconnect' })
                          : t('account.connectAnotherMethodFirst', { defaultValue: 'Connect another sign-in method first' })}
                      </span>
                    )}
                  </>
                }
                action={
                  link ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!canUnlink || unlinking === provider}
                      aria-describedby={!canUnlink ? hintId : undefined}
                      onClick={async () => {
                        setUnlinking(provider);
                        try {
                          await apiFetch(`/api/auth/oauth/link/${provider}`, { method: 'DELETE' });
                          setOauthLinks((prev) => prev.filter((l) => l.provider !== provider));
                          showToast({
                            message: t('account.disconnectedToast', { defaultValue: '{{provider}} disconnected', provider: providerLabel }),
                            variant: 'success',
                          });
                        } catch (err) {
                          showToast({
                            message: getErrorMessage(
                              err,
                              t('account.disconnectFailedToast', { defaultValue: 'Failed to disconnect {{provider}}', provider: providerLabel }),
                            ),
                            variant: 'error',
                          });
                        } finally {
                          setUnlinking(null);
                        }
                      }}
                    >
                      {unlinking === provider ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2Off className="h-4 w-4 mr-1.5" />}
                      {t('account.disconnect', { defaultValue: 'Disconnect' })}
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => { window.location.href = `/api/auth/oauth/${provider}`; }}
                    >
                      <Link2 className="h-4 w-4 mr-1.5" />
                      {t('account.connect', { defaultValue: 'Connect' })}
                    </Button>
                  )
                }
              />
            );
          })}
        </SettingsSection>
      )}

      {apiKeysGated ? (
        __EE__ && !apiKeysDismissed && (
          <SettingsSection label={t('account.apiKeysSection', { defaultValue: 'API Keys' })} dividerAbove>
            <Suspense fallback={null}>
              <UpgradePrompt
                feature={t('account.apiKeysSection', { defaultValue: 'API Keys' })}
                description={t('account.apiKeysUpgradeDescription', { defaultValue: 'Create API keys to integrate with external tools.' })}
                upgradeAction={planInfo.upgradeAction}
                dismissKey="apiKeys"
              />
            </Suspense>
          </SettingsSection>
        )
      ) : (
        <SettingsSection
          label={t('account.apiKeysSection', { defaultValue: 'API Keys' })}
          dividerAbove
          description={t('account.apiKeysDescription', {
            defaultValue: 'API keys are tied to your account and work across all your locations. Use them for smart home integrations and automation.',
          })}
          action={
            <Tooltip content={t('account.createApiKeyTooltip', { defaultValue: 'Create API key' })} side="bottom">
              <Button
                onClick={() => setCreateOpen(true)}
                size="icon"
                aria-label={t('account.createApiKeyTooltip', { defaultValue: 'Create API key' })}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </Tooltip>
          }
        >
          {keysLoading ? null : keys.length === 0 ? (
            <p className="settings-row-desc py-4 text-center">
              {t('account.noApiKeys', { defaultValue: 'No API keys yet. Create one to connect integrations.' })}
            </p>
          ) : (
            keys.map((k) => (
              <SettingsListRow
                key={k.id}
                icon={Key}
                title={k.name || k.key_prefix}
                meta={
                  <>
                    {k.key_prefix}... &middot; {t('account.keyCreatedPrefix', { defaultValue: 'Created' })} {formatDate(k.created_at, t)}
                    {k.last_used_at
                      ? ` \u00b7 ${t('account.keyLastUsedPrefix', { defaultValue: 'Last used' })} ${formatDate(k.last_used_at, t)}`
                      : ''}
                  </>
                }
                action={
                  <Tooltip content={t('account.revokeApiKeyTooltip', { defaultValue: 'Revoke API key' })} side="bottom">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-[var(--destructive)] shrink-0"
                      onClick={() => setRevokeId(k.id)}
                      aria-label={t('account.revokeApiKeyTooltip', { defaultValue: 'Revoke API key' })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </Tooltip>
                }
              />
            ))
          )}
        </SettingsSection>
      )}

      <SettingsSection
        label={t('account.dangerZoneSection', { defaultValue: 'Danger Zone' })}
        dividerAbove
        status="danger"
        tintLabel
        statusMessage={t('account.dangerZoneMessage', {
          defaultValue: 'Deleting your account removes all locations where you are the only member. Shared locations are preserved. This action cannot be undone.',
        })}
      >
        {user.deletionRequestedAt && user.deletionScheduledAt && (
          <DeletionPendingBanner scheduledAt={user.deletionScheduledAt} />
        )}
        <div className="pt-1">
          <Button
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
            disabled={!!user.deletionRequestedAt}
          >
            <Trash2 className="h-4 w-4 mr-2.5" />
            {t('account.deleteAccountButton', { defaultValue: 'Delete Account' })}
          </Button>
        </div>
      </SettingsSection>

      <DeleteAccountDialog open={deleteOpen} onOpenChange={setDeleteOpen} />

      <Dialog open={createOpen} onOpenChange={(open) => !open && setCreateOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {newKey
                ? t('account.apiKeyCreatedTitle', { defaultValue: 'API Key Created' })
                : t('account.createApiKeyTitle', { defaultValue: 'Create API Key' })}
            </DialogTitle>
            <DialogDescription>
              {newKey
                ? t('account.apiKeyCreatedDesc', { defaultValue: "Copy this key now — it won't be shown again." })
                : t('account.createApiKeyDesc', { defaultValue: 'Give your key a name to help you identify it later.' })}
            </DialogDescription>
          </DialogHeader>
          {newKey ? (
            <div className="space-y-4">
              <div className="row">
                <code className="flex-1 text-[var(--text-sm)] bg-[var(--bg-input)] px-3 py-2 rounded-[var(--radius-sm)] break-all select-all font-mono">
                  {newKey}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={handleCopy}
                  aria-label={copied ? t('account.copied', { defaultValue: 'Copied' }) : t('account.copyApiKey', { defaultValue: 'Copy API key' })}
                >
                  {copied ? <Check className="h-4 w-4 text-[var(--color-success)]" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={() => setCreateOpen(false)}>
                  {t('account.done', { defaultValue: 'Done' })}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleCreateKey} className="space-y-5">
              <FormField
                label={t('account.keyNameLabel', { defaultValue: 'Name' })}
                htmlFor="key-name"
                hint={t('account.keyNameHint', { defaultValue: 'A label to help you recognize this key later.' })}
              >
                <Input
                  id="key-name"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder={t('account.keyNamePlaceholder', { defaultValue: 'e.g., Home Assistant, Alexa' })}
                />
              </FormField>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                  {t('account.cancel', { defaultValue: 'Cancel' })}
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating ? t('account.creating', { defaultValue: 'Creating...' }) : t('account.create', { defaultValue: 'Create' })}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!revokeId} onOpenChange={(open) => !open && setRevokeId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('account.revokeKeyDialogTitle', { defaultValue: 'Revoke API Key?' })}</DialogTitle>
            <DialogDescription>
              {t('account.revokeKeyDialogDesc', { defaultValue: 'Any integrations using this key will stop working immediately. This cannot be undone.' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRevokeId(null)}>
              {t('account.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevoke}
              disabled={revoking}
            >
              {revoking ? t('account.revoking', { defaultValue: 'Revoking...' }) : t('account.revoke', { defaultValue: 'Revoke' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
