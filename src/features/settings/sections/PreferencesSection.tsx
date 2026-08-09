import { Monitor, Moon, Sun } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import type { OptionGroupOption } from '@/components/ui/option-group';
import { OptionGroup } from '@/components/ui/option-group';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import {
  ITEM_PAGE_SIZE_OPTIONS,
  type PageSizeValue,
  setItemPageSize,
  useItemPageSize,
} from '@/features/bins/useItemPageSize';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { SUPPORTED_LANGUAGES, setLanguage, useLanguage } from '@/lib/language';
import { useTerminology } from '@/lib/terminology';
import type { ThemePreference } from '@/lib/theme';
import { useTheme } from '@/lib/theme';
import { useUserPreferences } from '@/lib/userPreferences';
import { SettingsPageHeader } from '../SettingsPageHeader';
import { SettingsRow } from '../SettingsRow';
import { SettingsSection } from '../SettingsSection';

const themeOptions: OptionGroupOption<ThemePreference>[] = [
  { key: 'light', label: 'Light', icon: Sun },
  { key: 'dark', label: 'Dark', icon: Moon },
  { key: 'auto', label: 'Auto', icon: Monitor },
];

export function PreferencesSection() {
  const { preference, setThemePreference } = useTheme();
  const { preferences, updatePreferences } = useUserPreferences();
  const { pageSize: itemPageSize } = useItemPageSize();
  const term = useTerminology();
  const { user, updateUser } = useAuth();
  const { language } = useLanguage();
  const { showToast } = useToast();
  const { t } = useTranslation('settings');

  function formatPageSizeLabel(v: PageSizeValue): string {
    return v === 'all'
      ? t('pageSize.allOnOnePage', { defaultValue: 'All on one page' })
      : `${v} ${t('pageSize.perPageSuffix', { defaultValue: 'per page' })}`;
  }

  const itemPageSizeSelectOptions = ITEM_PAGE_SIZE_OPTIONS.map((v) => ({
    value: v,
    label: formatPageSizeLabel(v),
  }));

  function handleLanguageChange(code: string) {
    const previousLanguage = language;
    const previousUserLanguage = user?.language ?? null;
    setLanguage(code);
    if (user) updateUser({ ...user, language: code });
    apiFetch('/api/auth/profile', { method: 'PUT', body: { language: code } }).catch((err) => {
      console.error('Failed to persist language preference', err);
      setLanguage(previousLanguage);
      if (user) updateUser({ ...user, language: previousUserLanguage });
      showToast({
        message: t('preferences.languageSaveFailed', { defaultValue: 'Failed to save language preference' }),
        variant: 'error',
      });
    });
  }

  return (
    <>
      <SettingsPageHeader
        title={t('preferences.title', { defaultValue: 'Preferences' })}
        description={t('preferences.description', { defaultValue: 'Customize your experience.' })}
      />

      <SettingsSection label={t('preferences.appearanceSection', { defaultValue: 'Appearance' })}>
        <SettingsRow
          label={t('preferences.themeLabel', { defaultValue: 'Theme' })}
          control={
            <OptionGroup
              options={themeOptions}
              value={preference}
              onChange={setThemePreference}
              iconOnly
            />
          }
        />
        <SettingsRow
          label={t('preferences.languageLabel', { defaultValue: 'Language' })}
          control={
            <Select<string>
              value={language}
              options={SUPPORTED_LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
              onChange={handleLanguageChange}
              ariaLabel={t('preferences.languageLabel', { defaultValue: 'Language' })}
              size="sm"
              align="right"
            />
          }
        />
      </SettingsSection>

      <SettingsSection label={t('preferences.displaySection', { defaultValue: 'Display' })} dividerAbove>
        <SettingsRow
          label={`${t('preferences.itemsPerPagePrefix', { defaultValue: 'Items per' })} ${term.bin} ${t('preferences.itemsPerPageSuffix', { defaultValue: 'page' })}`}
          description={t('preferences.itemsDescription', {
            defaultValue: 'Number of items shown before pagination. Select "All on one page" to disable.',
          })}
          control={
            <Select<PageSizeValue>
              value={itemPageSize}
              options={itemPageSizeSelectOptions}
              onChange={setItemPageSize}
              ariaLabel={`${t('preferences.itemsPerPagePrefix', { defaultValue: 'Items per' })} ${term.bin} ${t('preferences.itemsPerPageSuffix', { defaultValue: 'page' })}`}
              size="sm"
              align="right"
            />
          }
        />
      </SettingsSection>

      <SettingsSection label={t('preferences.keyboardSection', { defaultValue: 'Keyboard' })} dividerAbove>
        <SettingsRow
          label={t('preferences.keyboardShortcutsLabel', { defaultValue: 'Keyboard Shortcuts' })}
          description={
            <span>
              <Trans
                t={t}
                i18nKey="preferences.keyboardShortcutsDesc"
                defaults="Press <kbd>?</kbd> to view all shortcuts"
                components={{
                  kbd: (
                    <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-[var(--radius-sm)] bg-[var(--bg-input)] font-mono text-[var(--text-xs)] text-[var(--text-secondary)] leading-none" />
                  ),
                }}
              />
            </span>
          }
          control={
            <Switch
              checked={preferences.keyboard_shortcuts_enabled}
              onCheckedChange={(checked) =>
                updatePreferences({ keyboard_shortcuts_enabled: checked })
              }
            />
          }
        />
      </SettingsSection>

      <SettingsSection label={t('preferences.usageSection', { defaultValue: 'Usage Tracking' })} dividerAbove>
        <SettingsRow
          label={t('preferences.scanQrLabel', { defaultValue: 'Scan QR code' })}
          description={t('preferences.scanQrDesc', { defaultValue: 'Record a usage dot when you scan a QR code' })}
          border={false}
          control={
            <Switch
              checked={preferences.usage_tracking_scan}
              onCheckedChange={(checked) => updatePreferences({ usage_tracking_scan: checked })}
            />
          }
        />
        <SettingsRow
          label={t('preferences.manualLookupLabel', { defaultValue: 'Manual code lookup' })}
          description={t('preferences.manualLookupDesc', {
            defaultValue: 'Record when you look up a {{bin}} by typing its code',
            bin: term.bin,
          })}
          border={false}
          control={
            <Switch
              checked={preferences.usage_tracking_manual_lookup}
              onCheckedChange={(checked) => updatePreferences({ usage_tracking_manual_lookup: checked })}
            />
          }
        />
        <SettingsRow
          label={t('preferences.viewBinLabel', { defaultValue: 'View {{bin}}', bin: term.bin })}
          description={t('preferences.viewBinDesc', {
            defaultValue: 'Record every time you open a {{bin}} detail page',
            bin: term.bin,
          })}
          border={false}
          control={
            <Switch
              checked={preferences.usage_tracking_view}
              onCheckedChange={(checked) => updatePreferences({ usage_tracking_view: checked })}
            />
          }
        />
        <SettingsRow
          label={t('preferences.modifyBinLabel', { defaultValue: 'Modify {{bin}}', bin: term.bin })}
          description={t('preferences.modifyBinDesc', {
            defaultValue: "Record when you edit a {{bin}}'s contents or metadata",
            bin: term.bin,
          })}
          border={false}
          control={
            <Switch
              checked={preferences.usage_tracking_modify}
              onCheckedChange={(checked) => updatePreferences({ usage_tracking_modify: checked })}
            />
          }
        />
        <SettingsRow
          label={t('preferences.granularityLabel', { defaultValue: 'Default granularity' })}
          description={t('preferences.granularityDesc', { defaultValue: 'Initial zoom level for the usage heatmap' })}
          border={false}
          control={
            <OptionGroup
              options={[
                { key: 'daily' as const, label: t('preferences.granularityDay', { defaultValue: 'Day' }) },
                { key: 'weekly' as const, label: t('preferences.granularityWeek', { defaultValue: 'Week' }) },
                { key: 'monthly' as const, label: t('preferences.granularityMonth', { defaultValue: 'Month' }) },
              ]}
              value={preferences.usage_granularity}
              onChange={(v) => updatePreferences({ usage_granularity: v })}
              size="sm"
            />
          }
        />
      </SettingsSection>
    </>
  );
}
