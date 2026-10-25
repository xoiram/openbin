import { useTranslation } from 'react-i18next';
import { OptionGroup } from '@/components/ui/option-group';
import { useUserPreferences } from '@/lib/userPreferences';
import type { UsageGranularity } from '@/types';

interface GranularitySegmentedProps {
  /** Optional override — if provided, uses local state; otherwise persists to user prefs. */
  value?: UsageGranularity;
  onChange?: (granularity: UsageGranularity) => void;
}

export function GranularitySegmented({ value, onChange }: GranularitySegmentedProps) {
  const { t } = useTranslation('usage');
  const { preferences, updatePreferences } = useUserPreferences();
  const options = [
    { key: 'daily' as const, label: t('granularity.day', { defaultValue: 'Day' }) },
    { key: 'weekly' as const, label: t('granularity.week', { defaultValue: 'Week' }) },
    { key: 'monthly' as const, label: t('granularity.month', { defaultValue: 'Month' }) },
  ];
  const current = value ?? preferences.usage_granularity;

  function handleChange(next: UsageGranularity) {
    if (onChange) {
      onChange(next);
    } else {
      updatePreferences({ usage_granularity: next });
    }
  }

  return (
    <OptionGroup
      options={options}
      value={current}
      onChange={handleChange}
      size="sm"
    />
  );
}
