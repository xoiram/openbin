import { Camera } from 'lucide-react';
import type { TourDefinition } from '../tourRegistry';
import type { TourStep } from '../tourSteps';

const steps: TourStep[] = [
  {
    id: 'capture-camera',
    selector: '[data-tour="capture-camera"]',
    placement: 'bottom',
    title: (ctx) => ctx.t('tour:createAi.captureCamera.title', { defaultValue: 'Snap a photo' }),
    body: (ctx) =>
      ctx.t('tour:createAi.captureCamera.body', {
        defaultValue: "Point your camera at a shelf, drawer, or room — AI names the {{bin}} and lists what's inside.",
        bin: ctx.terminology.bin,
      }),
    route: '/capture',
    mobilePlacement: 'top',
  },
  {
    id: 'capture-grouping',
    selector: '[data-tour="capture-grouping"]',
    placement: 'top',
    title: (ctx) => ctx.t('tour:createAi.captureGrouping.title', { defaultValue: 'Group as you go' }),
    body: (ctx) =>
      ctx.t('tour:createAi.captureGrouping.body', {
        defaultValue: 'Toggle grouping to turn multiple photos into multiple {{bins}} in one pass.',
        bins: ctx.terminology.bins,
      }),
    route: '/capture',
    mobilePlacement: 'top',
  },
  {
    id: 'group-review',
    selector: '[data-tour="group-review"]',
    placement: 'top',
    title: (ctx) => ctx.t('tour:createAi.groupReview.title', { defaultValue: 'Review before confirming' }),
    body: (ctx) =>
      ctx.t('tour:createAi.groupReview.body', { defaultValue: 'Drag photos between groups, rename, or merge before the AI runs.' }),
    route: '/capture',
    condition: (ctx) => ctx.canWrite,
    mobilePlacement: 'top',
  },
  {
    id: 'bulk-add-confirm',
    selector: '[data-tour="bulk-add-confirm"]',
    placement: 'top',
    title: (ctx) => ctx.t('tour:createAi.bulkAddConfirm.title', { defaultValue: 'Create them all at once' }),
    body: (ctx) =>
      ctx.t('tour:createAi.bulkAddConfirm.body', {
        defaultValue: 'AI suggestions are editable. Confirm to create every {{bin}} in one go.',
        bin: ctx.terminology.bin,
      }),
    route: '/capture',
    condition: (ctx) => ctx.canWrite,
    mobilePlacement: 'top',
    buttonLabel: (ctx) => ctx.t('tour:shared.gotIt', { defaultValue: 'Got it' }),
  },
];

export const createAi: TourDefinition = {
  id: 'create-ai',
  title: 'Create bins from photos',
  summary: 'Capture, group, and review AI-generated bins',
  icon: Camera,
  steps,
};
