import '@/components/ui/animations.css';
import { PackagePlus, Printer, QrCode, Settings, X } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BrandIcon } from '@/components/BrandIcon';
import { AnimatedHeight } from '@/components/ui/animated-height';
import { closeButton, cn, focusRing } from '@/lib/utils';
import type { OnboardingActions } from './onboardingConstants';
import { markDemoTourDone } from './onboardingConstants';
import type { CompletionAction } from './steps/CompletionStep';
import { CompletionStep } from './steps/CompletionStep';
import { DemoAiShowcase } from './steps/DemoAiShowcase';
import { DemoBrowseStep } from './steps/DemoBrowseStep';
import { DemoWelcomeStep } from './steps/DemoWelcomeStep';
import { useOnboardingActions } from './useOnboardingActions';

export function OnboardingOverlay(props: OnboardingActions) {
  const { step, totalSteps, advanceWithLocation, advanceStep, complete, demoMode, activeLocationId } = props;
  const { t } = useTranslation('onboarding');
  const state = useOnboardingActions(props);
  const { displayedStep, transitioning, navigate } = state;
  const dots = Array.from({ length: totalSteps });

  const demoCompletionActions: CompletionAction[] = [
    {
      icon: PackagePlus,
      label: t('demoCompletion.browseBins.label', { defaultValue: 'Browse all bins' }),
      description: t('demoCompletion.browseBins.description', { defaultValue: 'Explore the 40+ pre-built demo bins' }),
      path: '/bins',
    },
    {
      icon: Printer,
      label: t('demoCompletion.printLabels.label', { defaultValue: 'Print labels' }),
      description: t('demoCompletion.printLabels.description', { defaultValue: 'Generate QR labels for your bins' }),
      path: '/print',
    },
    {
      icon: QrCode,
      label: t('demoCompletion.scanQr.label', { defaultValue: 'Scan a QR code' }),
      description: t('demoCompletion.scanQr.description', { defaultValue: 'Try scanning a label with your camera' }),
      path: '/scan',
    },
    {
      icon: Settings,
      label: t('demoCompletion.exploreSettings.label', { defaultValue: 'Explore settings' }),
      description: t('demoCompletion.exploreSettings.description', { defaultValue: 'Customize terminology, AI, and more' }),
      path: '/settings',
    },
  ];

  function handleAction(action: CompletionAction) {
    if (demoMode) markDemoTourDone();
    complete();
    if ('path' in action) navigate(action.path);
    else action.onSelect();
  }

  function handleDashboard() {
    if (demoMode) markDemoTourDone();
    complete();
    navigate('/');
  }

  useEffect(() => {
    if (!demoMode) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') state.handleSkipSetup();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [demoMode, state.handleSkipSetup]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismisses demo only; Escape provides keyboard equivalent
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard equivalent handled via document-level Escape listener above
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop)]"
      onClick={demoMode ? state.handleSkipSetup : undefined}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: card swallows backdrop clicks so only the backdrop dismisses */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only — no keyboard equivalent needed */}
      <div
        className="flat-heavy rounded-[var(--radius-xl)] w-full max-w-sm mx-5 px-8 py-8 relative max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={state.handleSkipSetup}
          aria-label={t('overlay.closeSetup', { defaultValue: 'Close setup' })}
          className={cn(closeButton, focusRing)}
        >
          <X className="h-4 w-4" />
        </button>
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-8">
          {dots.map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static progress dots
            <div key={i}
              className={cn(
                'h-2 w-2 rounded-full transition-all duration-300',
                i <= step ? 'bg-[var(--accent)]' : 'bg-[var(--bg-active)]',
                i === step
                  ? 'scale-125'
                  : i < step
                    ? 'opacity-40'
                    : ''
              )}
            />
          ))}
        </div>

        {/* Step content */}
        <AnimatedHeight className="overflow-y-auto scrollbar-hide min-h-0 -mx-2 px-2">
          <div
            key={displayedStep}
            className={cn(
              'onboarding-step-enter',
              transitioning && 'onboarding-step-exit',
            )}
          >
          {displayedStep === 0 && demoMode && activeLocationId && (
            <DemoWelcomeStep activeLocationId={activeLocationId} onAdvance={advanceWithLocation} />
          )}
          {displayedStep === 1 && demoMode && (
            <DemoAiShowcase onNext={advanceStep} />
          )}
          {displayedStep === 2 && demoMode && (
            <DemoBrowseStep onNext={advanceStep} />
          )}
          {displayedStep === 3 && demoMode && (
            <CompletionStep
              icon={<BrandIcon className="h-16 w-16 text-[var(--accent)] mb-5" />}
              title={t('completion.tourCompleteTitle', { defaultValue: 'Tour complete' })}
              subtitle={t('completion.tourCompleteSubtitle', { defaultValue: "That's the essentials. Dive in and explore." })}
              actions={demoCompletionActions}
              onAction={handleAction}
              onDashboard={handleDashboard}
            />
          )}
          </div>
        </AnimatedHeight>

      </div>
    </div>
  );
}
