import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Locale-aware compact "time ago" formatter (e.g. "5m ago" / "5 min siden").
 * Translated counterpart of `relativeTime()` in `@/lib/utils`, used by the
 * activity log and dashboard feeds. Uses `n` rather than `count` because the
 * compact unit abbreviations don't inflect.
 */
export function useRelativeTime(): (iso: string | null) => string {
  const { t } = useTranslation('activity');
  return useCallback(
    (iso: string | null) => {
      if (!iso) return '—';
      const ms = Date.now() - new Date(iso).getTime();
      const mins = Math.floor(ms / 60000);
      if (mins < 1) return t('relativeTime.justNow', { defaultValue: 'just now' });
      if (mins < 60) return t('relativeTime.minutes', { defaultValue: '{{n}}m ago', n: mins });
      const hours = Math.floor(mins / 60);
      if (hours < 24) return t('relativeTime.hours', { defaultValue: '{{n}}h ago', n: hours });
      const days = Math.floor(hours / 24);
      if (days < 30) return t('relativeTime.days', { defaultValue: '{{n}}d ago', n: days });
      const months = Math.floor(days / 30);
      if (months < 12) return t('relativeTime.months', { defaultValue: '{{n}}mo ago', n: months });
      return t('relativeTime.years', { defaultValue: '{{n}}y ago', n: Math.floor(months / 12) });
    },
    [t],
  );
}
