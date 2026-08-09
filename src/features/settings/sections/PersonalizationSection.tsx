import { RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { useAppSettings } from '@/lib/appSettings';
import { SettingsPageHeader } from '../SettingsPageHeader';
import { SettingsSection } from '../SettingsSection';
import { SavedBadge, useSavedFlash } from '../useSavedFlash';

export function PersonalizationSection() {
  const { settings, updateSettings, resetSettings } = useAppSettings();
  const { saved, flash } = useSavedFlash();
  const { t } = useTranslation('settings');

  const termRows = [
    {
      key: 'termBin' as const,
      singular: t('personalization.terms.bin.singular', { defaultValue: 'Bin' }),
      plural: t('personalization.terms.bin.plural', { defaultValue: 'Bins' }),
      hint: t('personalization.terms.bin.hint', { defaultValue: 'A container of items' }),
    },
    {
      key: 'termLocation' as const,
      singular: t('personalization.terms.location.singular', { defaultValue: 'Location' }),
      plural: t('personalization.terms.location.plural', { defaultValue: 'Locations' }),
      hint: t('personalization.terms.location.hint', { defaultValue: 'The top-level workspace' }),
    },
    {
      key: 'termArea' as const,
      singular: t('personalization.terms.area.singular', { defaultValue: 'Area' }),
      plural: t('personalization.terms.area.plural', { defaultValue: 'Areas' }),
      hint: t('personalization.terms.area.hint', { defaultValue: 'A section within a location' }),
    },
  ];

  return (
    <>
      <SettingsPageHeader
        title={t('personalization.title', { defaultValue: 'Personalization' })}
        description={t('personalization.description', {
          defaultValue: 'Customize naming and branding for your workspace.',
        })}
        action={<SavedBadge visible={saved} />}
      />

      <SettingsSection label={t('personalization.appNameSection', { defaultValue: 'App Name' })}>
        <FormField
          label={t('personalization.workspaceNameLabel', { defaultValue: 'Workspace name' })}
          htmlFor="app-name"
          hint={t('personalization.workspaceNameHint', { defaultValue: 'Shown in the header and browser tab.' })}
        >
          <Input
            id="app-name"
            value={settings.appName}
            onChange={(e) => updateSettings({ appName: e.target.value })}
            onBlur={flash}
            placeholder={t('personalization.workspaceNamePlaceholder', { defaultValue: 'OpenBin' })}
          />
        </FormField>
      </SettingsSection>

      <SettingsSection
        label={t('personalization.terminologySection', { defaultValue: 'Custom Terminology' })}
        dividerAbove
        description={t('personalization.terminologyDescription', {
          defaultValue: 'Rename core concepts to match your workflow. Singular and plural are used throughout the UI.',
        })}
      >
        <div className="flex flex-col gap-4">
          {termRows.map(({ key, singular, plural, hint }) => {
            const raw = settings[key];
            const parts = raw ? raw.split('|') : ['', ''];
            return (
              <div key={key} className="grid grid-cols-1 gap-2 sm:grid-cols-[160px_1fr_1fr] sm:items-start">
                <div className="flex flex-col gap-0.5 sm:pt-2">
                  <span className="settings-field-label">{singular}</span>
                  <span className="settings-hint">{hint}</span>
                </div>
                <Input
                  value={parts[0] || ''}
                  onChange={(e) => {
                    const newSingular = e.target.value;
                    const newPlural = parts[1] || '';
                    updateSettings({ [key]: newSingular || newPlural ? `${newSingular}|${newPlural}` : '' });
                  }}
                  onBlur={flash}
                  placeholder={singular}
                  aria-label={`${singular} ${t('personalization.singularNameSuffix', { defaultValue: 'singular name' })}`}
                />
                <Input
                  value={parts[1] || ''}
                  onChange={(e) => {
                    const newSingular = parts[0] || '';
                    const newPlural = e.target.value;
                    updateSettings({ [key]: newSingular || newPlural ? `${newSingular}|${newPlural}` : '' });
                  }}
                  onBlur={flash}
                  placeholder={plural}
                  aria-label={`${plural} ${t('personalization.pluralNameSuffix', { defaultValue: 'plural name' })}`}
                />
              </div>
            );
          })}
        </div>
      </SettingsSection>

      <div className="pt-2">
        <Button variant="outline" onClick={resetSettings}>
          <RotateCcw className="h-4 w-4 mr-2" />
          {t('personalization.resetToDefaults', { defaultValue: 'Reset to defaults' })}
        </Button>
      </div>
    </>
  );
}
