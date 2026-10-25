import { SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Disclosure } from '@/components/ui/disclosure';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OptionGroup } from '@/components/ui/option-group';
import { Textarea } from '@/components/ui/textarea';
import { useTerminology } from '@/lib/terminology';
import type { ReorganizeTagsForm } from './useReorganizeTagsForm';

interface Props {
  form: ReorganizeTagsForm;
}

export function ReorganizeTagsOptions({ form }: Props) {
  const { t } = useTranslation('reorganize');
  const term = useTerminology();
  const changeLevelHints: Record<string, string> = {
    additive: t('tagsOptions.hints.additive', {
      defaultValue: "Add or remove tags on {{bins}} — don't touch the vocabulary",
      bins: term.bins,
    }),
    moderate: t('tagsOptions.hints.moderate', { defaultValue: 'Also rename and merge duplicates, propose parents' }),
    full: t('tagsOptions.hints.full', { defaultValue: 'Aggressive restructuring — merge broadly and trim mis-tags' }),
  };

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
        <fieldset className="border-0 m-0 px-0 pt-0 pb-2">
          <legend className="text-[12px] text-[var(--text-secondary)] font-medium block p-0">
            {t('tagsOptions.changeLevel', { defaultValue: 'Change level' })}
          </legend>
          <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5 mb-2">
            {changeLevelHints[form.changeLevel]}
          </p>
          <OptionGroup
            options={[
              { key: 'additive', label: t('tagsOptions.levels.additive', { defaultValue: 'Additive' }) },
              { key: 'moderate', label: t('tagsOptions.levels.moderate', { defaultValue: 'Moderate' }) },
              { key: 'full', label: t('tagsOptions.levels.full', { defaultValue: 'Full' }) },
            ]}
            value={form.changeLevel}
            onChange={(v) => form.setChangeLevel(v as ReorganizeTagsForm['changeLevel'])}
            size="sm"
          />
        </fieldset>

        <fieldset className="border-0 m-0 px-0 pt-0 pb-2">
          <legend className="text-[12px] text-[var(--text-secondary)] font-medium block mb-2 p-0">
            {t('tagsOptions.granularity', { defaultValue: 'Tag granularity' })}
          </legend>
          <OptionGroup
            options={[
              { key: 'broad', label: t('binsOptions.grouping.broad', { defaultValue: 'Broad' }) },
              { key: 'medium', label: t('binsOptions.grouping.medium', { defaultValue: 'Medium' }) },
              { key: 'specific', label: t('binsOptions.grouping.specific', { defaultValue: 'Specific' }) },
            ]}
            value={form.granularity}
            onChange={(v) => form.setGranularity(v as ReorganizeTagsForm['granularity'])}
            size="sm"
          />
        </fieldset>

        <div>
          <Label
            htmlFor="tag-max"
            className="text-[12px] text-[var(--text-secondary)] font-medium block mb-2"
          >
            {t('tagsOptions.maxTagsPerBin', { defaultValue: 'Max tags per {{bin}}', bin: term.bin })}
          </Label>
          <Input
            id="tag-max"
            type="number"
            min={1}
            max={10}
            value={form.maxTagsPerBin}
            onChange={(e) => form.setMaxTagsPerBin(e.target.value)}
            placeholder={t('auto', { defaultValue: 'Auto' })}
          />
        </div>

        <div>
          <Label
            htmlFor="tag-notes"
            className="text-[12px] text-[var(--text-secondary)] font-medium block mb-2"
          >
            {t('additionalInstructions', { defaultValue: 'Additional instructions' })}
          </Label>
          <Textarea
            id="tag-notes"
            value={form.userNotes}
            onChange={(e) => form.setUserNotes(e.target.value)}
            placeholder={t('tagsOptions.notesPlaceholder', { defaultValue: 'e.g. emphasize kitchen categories' })}
            rows={2}
          />
        </div>
      </div>
    </Disclosure>
  );
}
