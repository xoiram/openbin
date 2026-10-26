import { Globe, Lock } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { OptionGroupOption } from '@/components/ui/option-group';
import { OptionGroup } from '@/components/ui/option-group';
import type { BinVisibility } from '@/types';

interface VisibilityPickerProps {
  value: BinVisibility;
  onChange: (value: BinVisibility) => void;
  /** The "everyone" option can't be chosen (a box inside a private box stays private). */
  locationDisabled?: boolean;
  locationDisabledTitle?: string;
}

export function VisibilityPicker({ value, onChange, locationDisabled, locationDisabledTitle }: VisibilityPickerProps) {
  const { t } = useTranslation('bins');
  const options = useMemo<OptionGroupOption<BinVisibility>[]>(
    () => [
      { key: 'location', label: t('visibility.everyone', { defaultValue: 'Everyone' }), icon: Globe, disabled: locationDisabled, disabledTitle: locationDisabledTitle },
      { key: 'private', label: t('visibility.onlyMe', { defaultValue: 'Only Me' }), icon: Lock },
    ],
    [t, locationDisabled, locationDisabledTitle],
  );
  return <OptionGroup options={options} value={value} onChange={onChange} />;
}
