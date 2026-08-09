import { Check } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/** Briefly flashes `saved = true` after calling `flash()`, auto-clears after 1.5 s. */
export function useSavedFlash() {
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const flash = useCallback(() => {
    setSaved(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), 1500);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return { saved, flash } as const;
}

/** Inline "Saved" badge that fades in/out. */
export function SavedBadge({ visible }: { visible: boolean }) {
  const { t } = useTranslation('settings');
  return (
    <span
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-1 text-[var(--text-xs)] font-normal text-[var(--color-success)] transition-opacity duration-300',
        visible ? 'opacity-100' : 'opacity-0',
      )}
    >
      <Check className="h-3 w-3" />
      {visible ? t('savedBadge', { defaultValue: 'Saved' }) : ''}
    </span>
  );
}
