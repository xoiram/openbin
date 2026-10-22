import { Package } from 'lucide-react';
import type { TourDefinition } from '../tourRegistry';
import type { TourContext, TourStep } from '../tourSteps';

const route = (ctx: TourContext) =>
  ctx.firstBinId ? `/bin/${ctx.firstBinId}` : '/';

const steps: TourStep[] = [
  {
    id: 'bin-qr',
    selector: '[data-tour="bin-qr"]',
    placement: 'top',
    title: (ctx) => ctx.t('tour:binAnatomy.binQr.title', { defaultValue: 'Every {{bin}} has a code', bin: ctx.terminology.bin }),
    body: (ctx) =>
      ctx.t('tour:binAnatomy.binQr.body', {
        defaultValue: 'The 6-character code is a printable QR. Stick it on the {{bin}} — anyone in this {{location}} can scan or type it.',
        bin: ctx.terminology.bin,
        location: ctx.terminology.location,
      }),
    route,
    condition: (ctx) => ctx.firstBinId !== null,
    mobilePlacement: 'top',
  },
  {
    id: 'quick-add',
    selector: '[data-tour="quick-add"]',
    placement: 'top',
    title: (ctx) => ctx.t('tour:binAnatomy.quickAdd.title', { defaultValue: 'Add items fast' }),
    body: (ctx) =>
      ctx.aiEnabled
        ? ctx.t('tour:binAnatomy.quickAdd.bodyAi', {
            defaultValue: 'Type "3 screwdrivers, a tape measure" and tap the spark — AI parses it into items with quantities.',
          })
        : ctx.t('tour:binAnatomy.quickAdd.bodyNoAi', {
            defaultValue: 'Type an item name and press Enter. Paste a comma-separated list for multiple.',
          }),
    route,
    condition: (ctx) => ctx.canWrite && ctx.firstBinId !== null,
    mobilePlacement: 'top',
  },
  {
    id: 'bin-tabs',
    selector: '[data-tour="bin-tabs"]',
    placement: 'bottom',
    title: (ctx) => ctx.t('tour:binAnatomy.binTabs.title', { defaultValue: "See what's happening" }),
    body: (ctx) =>
      ctx.t('tour:binAnatomy.binTabs.body', {
        defaultValue: 'Switch tabs for files, a usage heatmap, and activity — see when this {{bin}} was last opened and what changed.',
        bin: ctx.terminology.bin,
      }),
    route,
    condition: (ctx) => ctx.firstBinId !== null,
    mobilePlacement: 'bottom',
  },
  {
    id: 'bin-appearance',
    selector: '[data-tour="bin-appearance"]',
    placement: 'top',
    title: (ctx) => ctx.t('tour:binAnatomy.binAppearance.title', { defaultValue: 'Tags, area, and appearance' }),
    body: (ctx) =>
      ctx.t('tour:binAnatomy.binAppearance.body', {
        defaultValue: 'Tags filter across {{bins}}, {{areas}} group them, and appearance themes printed labels.',
        bins: ctx.terminology.bins,
        areas: ctx.terminology.areas,
      }),
    route,
    condition: (ctx) => ctx.firstBinId !== null,
    mobilePlacement: 'top',
  },
  {
    id: 'bin-toolbar',
    selector: '[data-tour="bin-toolbar"]',
    placement: 'bottom',
    title: (ctx) => ctx.t('tour:binAnatomy.binToolbar.title', { defaultValue: 'Edit, pin, print, duplicate' }),
    body: (ctx) =>
      ctx.t('tour:binAnatomy.binToolbar.body', {
        defaultValue: 'The toolbar has every action you need: edit contents, pin for quick access, print a label, duplicate, or move.',
      }),
    route,
    condition: (ctx) => ctx.firstBinId !== null,
    mobilePlacement: 'bottom',
    buttonLabel: (ctx) => ctx.t('tour:shared.gotIt', { defaultValue: 'Got it' }),
  },
];

export const binAnatomy: TourDefinition = {
  id: 'bin-anatomy',
  title: 'Inside a bin',
  summary: 'Items, tags, QR, tabs, toolbar',
  icon: Package,
  steps,
};
