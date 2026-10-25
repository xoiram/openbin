import { SlidersHorizontal } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Disclosure } from '@/components/ui/disclosure';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OptionGroup } from '@/components/ui/option-group';
import { Textarea } from '@/components/ui/textarea';
import { useTerminology } from '@/lib/terminology';
import { cn } from '@/lib/utils';
import type { ReorganizeBinsForm } from './useReorganizeBinsForm';

interface Props {
  form: ReorganizeBinsForm;
  itemCount: number;
}

interface OptionField {
  legend: string;
  options: { key: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}

export function ReorganizeBinsOptions({ form, itemCount }: Props) {
  const { t } = useTranslation('reorganize');
  const term = useTerminology();

  const optionFields: OptionField[] = useMemo(
    () => [
      {
        legend: t('binsOptions.changeLevel.legend', { defaultValue: 'Change level' }),
        options: [
          { key: 'conservative', label: t('binsOptions.changeLevel.conservative', { defaultValue: 'Light' }) },
          { key: 'moderate', label: t('binsOptions.changeLevel.moderate', { defaultValue: 'Moderate' }) },
          { key: 'aggressive', label: t('binsOptions.changeLevel.aggressive', { defaultValue: 'Thorough' }) },
        ],
        value: form.strictness,
        onChange: (v) => form.setStrictness(v as ReorganizeBinsForm['strictness']),
        hint: t('binsOptions.changeLevel.hint', {
          defaultValue: 'How much the AI can restructure your {{bins}}',
          bins: term.bins,
        }),
      },
      {
        legend: t('binsOptions.grouping.legend', { defaultValue: 'Grouping' }),
        options: [
          { key: 'broad', label: t('binsOptions.grouping.broad', { defaultValue: 'Broad' }) },
          { key: 'medium', label: t('binsOptions.grouping.medium', { defaultValue: 'Medium' }) },
          { key: 'specific', label: t('binsOptions.grouping.specific', { defaultValue: 'Specific' }) },
        ],
        value: form.granularity,
        onChange: (v) => form.setGranularity(v as ReorganizeBinsForm['granularity']),
        hint: t('binsOptions.grouping.hint', { defaultValue: 'How narrowly items are categorized' }),
      },
      {
        legend: t('binsOptions.unmatched.legend', { defaultValue: 'Unmatched items' }),
        options: [
          { key: 'best-fit', label: t('binsOptions.unmatched.bestFit', { defaultValue: 'Best match' }) },
          { key: 'multi-bin', label: t('binsOptions.unmatched.multiBin', { defaultValue: 'Place in multiple' }) },
          {
            key: 'misc-bin',
            label: t('binsOptions.unmatched.miscBin', { defaultValue: 'Misc {{bin}}', bin: term.bin }),
          },
        ],
        value: form.ambiguousPolicy,
        onChange: (v) => form.setAmbiguousPolicy(v as ReorganizeBinsForm['ambiguousPolicy']),
        hint: t('binsOptions.unmatched.hint', { defaultValue: "What happens to items that don't fit neatly" }),
      },
      {
        legend: t('binsOptions.duplicates.legend', { defaultValue: 'Duplicate items' }),
        options: [
          {
            key: 'force-single',
            label: t('binsOptions.duplicates.forceSingle', { defaultValue: 'One {{bin}} only', bin: term.bin }),
          },
          { key: 'allow', label: t('binsOptions.duplicates.allow', { defaultValue: 'Allow copies' }) },
        ],
        value: form.duplicates,
        onChange: (v) => form.setDuplicates(v as ReorganizeBinsForm['duplicates']),
      },
      {
        legend: t('binsOptions.outliers.legend', { defaultValue: 'Outlier items' }),
        options: [
          { key: 'force-closest', label: t('binsOptions.outliers.forceClosest', { defaultValue: 'Nearest match' }) },
          {
            key: 'dedicated',
            label: t('binsOptions.outliers.dedicated', { defaultValue: 'Separate {{bin}}', bin: term.bin }),
          },
        ],
        value: form.outliers,
        onChange: (v) => form.setOutliers(v as ReorganizeBinsForm['outliers']),
      },
    ],
    [form, term.bin, term.bins, t],
  );

  return (
    <Disclosure
      label={
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-[var(--text-tertiary)]" />
          <Label className="text-[15px] font-semibold text-[var(--text-primary)] pointer-events-none">
            {t('options', { defaultValue: 'Options' })}
          </Label>
        </span>
      }
    >
      <div className="space-y-5">
        <div>
          <Label
            htmlFor="reorg-max-bins"
            className="text-[12px] text-[var(--text-secondary)] font-medium block mb-2"
          >
            {t('binsOptions.maxBins', { defaultValue: 'Number of {{bins}}', bins: term.bins })}
          </Label>
          <Input
            id="reorg-max-bins"
            type="number"
            min={1}
            value={form.maxBins}
            onChange={(e) => form.setMaxBins(e.target.value)}
            placeholder={t('auto', { defaultValue: 'Auto' })}
            aria-describedby={form.maxBinsError ? 'reorg-max-bins-error' : undefined}
            aria-invalid={!!form.maxBinsError}
          />
          {form.maxBinsError && (
            <p
              id="reorg-max-bins-error"
              className="text-[12px] text-[var(--destructive)] mt-1"
              role="alert"
            >
              {form.maxBinsError}
            </p>
          )}
        </div>

        <div>
          <Label
            htmlFor="reorg-min-items"
            className="text-[12px] text-[var(--text-secondary)] font-medium block mb-2"
          >
            {t('binsOptions.itemsPerBin', { defaultValue: 'Items per {{bin}}', bin: term.bin })}
          </Label>
          <div className="flex gap-2">
            <Input
              id="reorg-min-items"
              type="number"
              min={1}
              value={form.minItemsPerBin}
              onChange={(e) => form.setMinItemsPerBin(e.target.value)}
              placeholder={t('binsOptions.min', { defaultValue: 'Min' })}
              aria-invalid={!!form.rangeError}
            />
            <Input
              id="reorg-max-items"
              type="number"
              min={1}
              value={form.maxItemsPerBin}
              onChange={(e) => form.setMaxItemsPerBin(e.target.value)}
              placeholder={t('binsOptions.max', { defaultValue: 'Max' })}
              aria-label={t('binsOptions.maxItemsPerBin', { defaultValue: 'Max items per {{bin}}', bin: term.bin })}
              aria-invalid={!!form.rangeError}
            />
          </div>
          {form.rangeError && (
            <p className="text-[12px] text-[var(--destructive)] mt-1" role="alert">
              {form.rangeError}
            </p>
          )}
        </div>

        <div>
          <Label
            htmlFor="reorg-notes"
            className="text-[12px] text-[var(--text-secondary)] font-medium block mb-2"
          >
            {t('additionalInstructions', { defaultValue: 'Additional instructions' })}
          </Label>
          <Textarea
            id="reorg-notes"
            value={form.userNotes}
            onChange={(e) => form.setUserNotes(e.target.value)}
            placeholder={t('binsOptions.notesPlaceholder', {
              defaultValue: 'e.g. Keep kitchen items separate from garage tools',
            })}
            rows={2}
          />
        </div>

        {optionFields.map((field) => (
          <fieldset key={field.legend} className="border-0 m-0 px-0 pt-0 pb-2">
            <legend
              className={cn(
                'text-[12px] text-[var(--text-secondary)] font-medium block p-0',
                !field.hint && 'mb-2',
              )}
            >
              {field.legend}
            </legend>
            {field.hint && (
              <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5 mb-2">{field.hint}</p>
            )}
            <OptionGroup
              options={field.options}
              value={field.value}
              onChange={field.onChange}
              size="sm"
            />
          </fieldset>
        ))}

        <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] text-[12px] text-[var(--text-tertiary)]">
          {t('binsOptions.itemsAcrossSelected', {
            count: itemCount,
            bins: term.bins,
            defaultValue_one: '{{count}} item across selected {{bins}}',
            defaultValue_other: '{{count}} items across selected {{bins}}',
          })}
        </div>
      </div>
    </Disclosure>
  );
}
