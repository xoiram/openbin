import { Shuffle } from 'lucide-react';
import type { TourDefinition } from '../tourRegistry';
import type { TourStep } from '../tourSteps';

const steps: TourStep[] = [
  {
    id: 'reorganize-mode',
    selector: '[data-tour="reorganize-mode"]',
    placement: 'bottom',
    title: (ctx) => ctx.t('tour:reorganize.reorganizeMode.title', { defaultValue: 'Regroup bins or tags' }),
    body: (ctx) =>
      ctx.t('tour:reorganize.reorganizeMode.body', {
        defaultValue: 'Pick bins mode to split or merge overstuffed {{bins}}; pick tags mode to consolidate tag vocabulary across {{bins}}.',
        bins: ctx.terminology.bins,
      }),
    route: '/reorganize',
    condition: (ctx) => ctx.canWrite && ctx.aiEnabled,
    mobilePlacement: 'bottom',
  },
  {
    id: 'reorganize-selector',
    selector: '[data-tour="reorganize-selector"]',
    placement: 'right',
    title: (ctx) => ctx.t('tour:reorganize.reorganizeSelector.title', { defaultValue: 'Focus the AI' }),
    body: (ctx) =>
      ctx.t('tour:reorganize.reorganizeSelector.body', {
        defaultValue: 'Pick a handful of {{bins}} or tags. The AI does better with focused input than the whole {{location}}.',
        bins: ctx.terminology.bins,
        location: ctx.terminology.location,
      }),
    route: '/reorganize',
    condition: (ctx) => ctx.canWrite && ctx.aiEnabled,
    mobilePlacement: 'bottom',
  },
  {
    id: 'reorganize-submit',
    selector: '[data-tour="reorganize-submit"]',
    placement: 'left',
    title: (ctx) => ctx.t('tour:reorganize.reorganizeSubmit.title', { defaultValue: 'Preview, then apply' }),
    body: (ctx) =>
      ctx.t('tour:reorganize.reorganizeSubmit.body', {
        defaultValue: 'Preview every change before committing. Nothing moves until you say go.',
      }),
    route: '/reorganize',
    condition: (ctx) => ctx.canWrite && ctx.aiEnabled,
    mobilePlacement: 'top',
    buttonLabel: (ctx) => ctx.t('tour:shared.gotIt', { defaultValue: 'Got it' }),
  },
];

export const reorganize: TourDefinition = {
  id: 'reorganize',
  title: 'Reorganize with AI',
  summary: 'Regroup bins or consolidate tags',
  icon: Shuffle,
  steps,
};
