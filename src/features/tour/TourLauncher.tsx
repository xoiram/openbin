import { HelpCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui/tooltip';
import { SettingsRow } from '@/features/settings/SettingsRow';
import { useUserPreferences } from '@/lib/userPreferences';
import { cn, focusRing, iconButton } from '@/lib/utils';
import { useTourContext } from './TourProvider';
import { getTour, type TourId } from './tourRegistry';

interface TourLauncherProps {
  tourId: TourId;
  variant?: 'icon' | 'menu';
  className?: string;
}

export function TourLauncher({ tourId, variant = 'icon', className }: TourLauncherProps) {
  const { t } = useTranslation('tour');
  const tourCtx = useTourContext();
  const { preferences } = useUserPreferences();
  const tour = getTour(tourId);
  if (!tour) return null;
  const seen = (preferences.tours_seen ?? []).includes(tourId);

  // picker.<tourId> keys are looked up dynamically here rather than translated
  // in TourDefinition itself — the extractor can't see this call statically,
  // so i18next.config.ts's preservePatterns keeps these keys from being
  // pruned as unused. Key casing must match TourId exactly (kebab-case).
  const title = t(`picker.${tourId}.title`, { defaultValue: tour.title });
  const summary = t(`picker.${tourId}.summary`, { defaultValue: tour.summary });

  function start() {
    tourCtx?.tour.start(tourId);
  }

  if (variant === 'icon') {
    // Hide the launcher once the user has taken the tour. It remains replayable
    // from Settings → About (the `menu` variant below) for intentional revisits.
    if (seen) return null;
    // Composed with plain JS, not {{title}} interpolation — the shared test
    // mock doesn't interpolate defaultValue vars, and this exact string is
    // asserted on in TourLauncher.test.tsx.
    const ariaLabel = `${t('launcher.tourAriaLabel', { defaultValue: 'Tour:' })} ${title}`;
    return (
      <Tooltip content={ariaLabel} side="bottom">
        <button
          type="button"
          onClick={start}
          aria-label={ariaLabel}
          className={cn(
            iconButton,
            focusRing,
            'rounded-[var(--radius-sm)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]',
            className,
          )}
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </Tooltip>
    );
  }

  const stepCount = t('launcher.stepCount', {
    count: tour.steps.length,
    defaultValue: `${tour.steps.length} step${tour.steps.length === 1 ? '' : 's'}`,
  });
  return (
    <SettingsRow
      icon={tour.icon}
      label={title}
      description={summary}
      onClick={start}
      control={
        <span className="text-[12px] text-[var(--text-tertiary)] tabular-nums">
          {seen ? `✓ ${stepCount}` : stepCount}
        </span>
      }
      border={false}
    />
  );
}
