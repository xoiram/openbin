import { AlignCenter, AlignLeft, ChevronDown, Columns2, Hash, Palette, QrCode, Rows2, Smile, Tag, Type } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { OptionGroup } from '@/components/ui/option-group';
import { useTerminology } from '@/lib/terminology';
import { cn } from '@/lib/utils';
import { CopiesStepper } from './CopiesStepper';
import type { LabelDirection, LabelOptions } from './usePrintSettings';

/** Font-scale presets shared by the label and name-card option cards. */
export function useFontScaleOptions(): { key: string; label: string }[] {
  const { t } = useTranslation('print');
  return [
    { key: '0.75', label: t('fontScale.compact', { defaultValue: 'Compact' }) },
    { key: '1', label: t('fontScale.normal', { defaultValue: 'Normal' }) },
    { key: '1.25', label: t('fontScale.large', { defaultValue: 'Large' }) },
    { key: '1.5', label: t('fontScale.xLarge', { defaultValue: 'X-Large' }) },
  ];
}

interface LabelOptionsCardProps {
  labelOptions: LabelOptions;
  onUpdateOption: <K extends keyof LabelOptions>(key: K, value: LabelOptions[K]) => void;
  copies: number;
  onUpdateCopies: (copies: number) => void;
  expanded: boolean;
  onExpandedChange: (v: boolean) => void;
}

export function LabelOptionsCard({ labelOptions, onUpdateOption, copies, onUpdateCopies, expanded, onExpandedChange }: LabelOptionsCardProps) {
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
            <Tag className="h-4 w-4 text-[var(--text-tertiary)]" />
            <Label className="text-[15px] font-semibold text-[var(--text-primary)] pointer-events-none">{t('labelOptions.title', { defaultValue: 'Label Options' })}</Label>
          </div>
          <ChevronDown className={cn(
            'h-5 w-5 text-[var(--text-tertiary)] transition-transform duration-200',
            expanded && 'rotate-180'
          )} />
        </button>

        {expanded && (
          <div className="mt-3 space-y-4">
            <div className="px-1">
              <span className="text-[12px] text-[var(--text-secondary)] font-medium block mb-2">{t('labelOptions.fontSize', { defaultValue: 'Font Size' })}</span>
              <OptionGroup
                options={fontScaleOptions}
                value={String(labelOptions.fontScale)}
                onChange={(v) => onUpdateOption('fontScale', Number(v))}
                size="sm"
              />
            </div>

            <div className="px-1">
              <span className="text-[12px] text-[var(--text-secondary)] font-medium block mb-2">{t('labelOptions.textAlignment', { defaultValue: 'Text Alignment' })}</span>
              <OptionGroup
                options={[
                  { key: 'left' as const, label: t('labelOptions.alignLeft', { defaultValue: 'Left' }), icon: AlignLeft },
                  { key: 'center' as const, label: t('labelOptions.alignCenter', { defaultValue: 'Center' }), icon: AlignCenter },
                ]}
                value={labelOptions.textAlign}
                onChange={(v) => onUpdateOption('textAlign', v)}
                size="sm"
              />
            </div>

            <div className="px-1">
              <span className="text-[12px] text-[var(--text-secondary)] font-medium block mb-2">{t('labelOptions.direction', { defaultValue: 'Label Direction' })}</span>
              <OptionGroup
                options={[
                  { key: 'auto' as const, label: t('labelOptions.directionAuto', { defaultValue: 'Auto' }) },
                  { key: 'horizontal' as const, label: t('labelOptions.directionHorizontal', { defaultValue: 'Horizontal' }), icon: Columns2 },
                  { key: 'vertical' as const, label: t('labelOptions.directionVertical', { defaultValue: 'Vertical' }), icon: Rows2 },
                ]}
                value={labelOptions.labelDirection ?? 'auto'}
                onChange={(v) => onUpdateOption('labelDirection', v as LabelDirection)}
                size="sm"
              />
            </div>

            <div className="space-y-1 px-1">
              <span className="text-[12px] text-[var(--text-secondary)] font-medium block mb-1">{t('labelOptions.visibleElements', { defaultValue: 'Visible Elements' })}</span>
              {([
                { key: 'showQrCode' as const, label: t('labelOptions.showQrCode', { defaultValue: 'QR Code' }), icon: QrCode },
                { key: 'showBinName' as const, label: t('labelOptions.showBinName', { defaultValue: '{{bin}} Name', bin: term.Bin }), icon: Type },
                { key: 'showIcon' as const, label: t('labelOptions.showIcon', { defaultValue: '{{bin}} Icon', bin: term.Bin }), icon: Smile },
                { key: 'showBinCode' as const, label: t('labelOptions.showBinCode', { defaultValue: '{{bin}} Code', bin: term.Bin }), icon: Hash },
                { key: 'showColorSwatch' as const, label: t('labelOptions.showColorSwatch', { defaultValue: 'Color Background' }), icon: Palette },
              ] as const).map(({ key, label, icon: Icon }) => (
                <label key={key} htmlFor={`label-opt-${key}`} className="flex items-center gap-3 px-2 py-1.5 cursor-pointer rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] transition-colors">
                  <Checkbox
                    id={`label-opt-${key}`}
                    checked={labelOptions[key]}
                    onCheckedChange={(checked) => onUpdateOption(key, !!checked)}
                  />
                  <Icon className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
                  <span className="text-[15px] text-[var(--text-primary)]">{label}</span>
                </label>
              ))}
            </div>

            <CopiesStepper label={t('labelOptions.copies', { defaultValue: 'Copies per label' })} value={copies} onChange={onUpdateCopies} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
