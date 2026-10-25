import { ChevronDown, Palette, Smile, Type } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { OptionGroup } from '@/components/ui/option-group';
import { useTerminology } from '@/lib/terminology';
import { cn } from '@/lib/utils';
import { CopiesStepper } from './CopiesStepper';
import { useFontScaleOptions } from './LabelOptionsCard';
import type { NameCardOptions } from './usePrintSettings';



interface NameCardOptionsCardProps {
  options: NameCardOptions;
  onUpdate: <K extends keyof NameCardOptions>(key: K, value: NameCardOptions[K]) => void;
  copies: number;
  onUpdateCopies: (copies: number) => void;
  expanded: boolean;
  onExpandedChange: (v: boolean) => void;
}

export function NameCardOptionsCard({ options, onUpdate, copies, onUpdateCopies, expanded, onExpandedChange }: NameCardOptionsCardProps) {
  const { t } = useTranslation('print');
  const term = useTerminology();
  const fontScaleOptions = useFontScaleOptions();

  return (
    <Card>
      <CardContent>
        <button
          type="button"
          className="row-spread w-full"
          aria-expanded={expanded}
          onClick={() => onExpandedChange(!expanded)}
        >
          <div className="row">
            <Type className="h-4 w-4 text-[var(--text-tertiary)]" />
            <Label className="text-[15px] font-semibold text-[var(--text-primary)] pointer-events-none">{t('nameOptions.title', { defaultValue: 'Name Options' })}</Label>
          </div>
          <ChevronDown className={cn(
            'h-5 w-5 text-[var(--text-tertiary)] transition-transform duration-200',
            expanded && 'rotate-180',
          )} />
        </button>

        {expanded && (
          <div className="mt-3 space-y-4">
            <div className="space-y-1 px-1">
              {([
                { key: 'showIcon' as const, label: t('nameOptions.showIcon', { defaultValue: '{{bin}} Icon', bin: term.Bin }), icon: Smile },
                { key: 'showColor' as const, label: t('nameOptions.showColor', { defaultValue: 'Color Background' }), icon: Palette },
              ] as const).map(({ key, label, icon: Icon }) => (
                <label key={key} htmlFor={`name-opt-${key}`} className="flex items-center gap-3 px-2 py-1.5 cursor-pointer rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] transition-colors">
                  <Checkbox
                    id={`name-opt-${key}`}
                    checked={options[key]}
                    onCheckedChange={(checked) => onUpdate(key, !!checked)}
                  />
                  <Icon className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
                  <span className="text-[15px] text-[var(--text-primary)]">{label}</span>
                </label>
              ))}
            </div>

            <div className="px-1">
              <span className="text-[12px] text-[var(--text-secondary)] font-medium block mb-2">{t('nameOptions.fontSizing', { defaultValue: 'Font Sizing' })}</span>
              <OptionGroup
                options={[
                  { key: 'auto', label: t('nameOptions.autoFit', { defaultValue: 'Auto-fit' }) },
                  { key: 'uniform', label: t('nameOptions.uniform', { defaultValue: 'Uniform' }) },
                ]}
                value={options.sizingMode}
                onChange={(v) => onUpdate('sizingMode', v as 'auto' | 'uniform')}
                size="sm"
              />
            </div>

            {options.sizingMode === 'uniform' && (
              <div className="px-1">
                <span className="text-[12px] text-[var(--text-secondary)] font-medium block mb-2">{t('nameOptions.fontSize', { defaultValue: 'Font Size' })}</span>
                <OptionGroup
                  options={fontScaleOptions}
                  value={String(options.fontScale)}
                  onChange={(v) => onUpdate('fontScale', Number(v))}
                  size="sm"
                />
              </div>
            )}

            <CopiesStepper label={t('nameOptions.copies', { defaultValue: 'Copies per card' })} value={copies} onChange={onUpdateCopies} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
