import type { TFunction } from 'i18next';

export function formatApplyDescription(
  counts: { kept: number; deleted: number; created: number },
  binWord: string,
  binsWord: string,
  t: TFunction<'reorganize'>,
): string {
  const terms = { bin: binWord, bins: binsWord };
  const parts: string[] = [];
  if (counts.kept > 0) {
    parts.push(
      t('applyDescription.update', {
        count: counts.kept,
        ...terms,
        defaultValue_one: 'update {{count}} existing {{bin}} in place',
        defaultValue_other: 'update {{count}} existing {{bins}} in place',
      }),
    );
  }
  if (counts.deleted > 0) {
    parts.push(
      t('applyDescription.delete', {
        count: counts.deleted,
        ...terms,
        defaultValue_one: 'delete {{count}} {{bin}}',
        defaultValue_other: 'delete {{count}} {{bins}}',
      }),
    );
  }
  if (counts.created > 0) {
    parts.push(
      t('applyDescription.create', {
        count: counts.created,
        ...terms,
        defaultValue_one: 'create {{count}} new {{bin}}',
        defaultValue_other: 'create {{count}} new {{bins}}',
      }),
    );
  }
  if (parts.length === 0) return t('applyDescription.none', { defaultValue: 'This will apply the reorganization.' });
  if (parts.length === 1) return t('applyDescription.one', { defaultValue: 'This will {{a}}.', a: parts[0] });
  if (parts.length === 2) {
    return t('applyDescription.two', { defaultValue: 'This will {{a}} and {{b}}.', a: parts[0], b: parts[1] });
  }
  return t('applyDescription.three', {
    defaultValue: 'This will {{a}}, {{b}}, and {{c}}.',
    a: parts[0],
    b: parts[1],
    c: parts[2],
  });
}
