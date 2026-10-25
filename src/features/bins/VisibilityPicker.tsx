import { Globe, Lock } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { OptionGroupOption } from '@/components/ui/option-group';
import { OptionGroup } from '@/components/ui/option-group';
import type { BinVisibility } from '@/types';

interface VisibilityPickerProps {
  value: BinVisibility;
  onChange: (value: BinVisibility) => void;
}

export function VisibilityPicker({ value, onChange }: VisibilityPickerProps) {
  const { t } = useTranslation('bins');
  const options = useMemo<OptionGroupOption<BinVisibility>[]>(
    () => [
      { key: 'location', label: t('visibility.everyone', { defaultValue: 'Everyone' }), icon: Globe },
      { key: 'private', label: t('visibility.onlyMe', { defaultValue: 'Only Me' }), icon: Lock },
    ],
    [t],
  );
  return <OptionGroup options={options} value={value} onChange={onChange} />;
}
