import { Printer } from 'lucide-react';
import type { TourDefinition } from '../tourRegistry';
import { scanButtonSelector, type TourContext, type TourStep } from '../tourSteps';

const steps: TourStep[] = [
  {
    id: 'print-bin-selector',
    selector: '[data-tour="print-bin-selector"]',
    placement: 'right',
    title: (ctx) =>
      ctx.t('tour:printScan.printBinSelector.title', { defaultValue: 'Pick which {{bins}} to print', bins: ctx.terminology.bins }),
    body: (ctx) =>
      ctx.t('tour:printScan.printBinSelector.body', {
        defaultValue: 'Print labels for a handful of {{bins}} or for everything. Deep-link here from any list.',
        bins: ctx.terminology.bins,
      }),
    route: (ctx: TourContext) => {
      const ids = ctx.binIds.slice(0, 6);
      return ids.length > 0 ? `/print?ids=${ids.join(',')}` : '/print';
    },
    mobilePlacement: 'bottom',
  },
  {
    id: 'print-mode',
    selector: '[data-tour="print-mode"]',
    placement: 'bottom',
    title: (ctx) => ctx.t('tour:printScan.printMode.title', { defaultValue: 'Labels, names, or item lists' }),
    body: (ctx) =>
      ctx.t('tour:printScan.printMode.body', {
        defaultValue: 'Pick a format: QR labels for scanning, name cards, or a full item checklist for inventory counts.',
      }),
    route: '/print',
    mobilePlacement: 'bottom',
  },
  {
    id: 'print-preset',
    selector: '[data-tour="print-preset"]',
    placement: 'bottom',
    title: (ctx) => ctx.t('tour:printScan.printPreset.title', { defaultValue: 'Customize and save presets' }),
    body: (ctx) =>
      ctx.t('tour:printScan.printPreset.body', {
        defaultValue: 'Turn on Customize dimensions to tweak any margin, then save your tweaks as a reusable preset — next print job is one click.',
      }),
    route: '/print',
    mobilePlacement: 'bottom',
  },
  {
    id: 'scan-qr',
    selector: scanButtonSelector,
    placement: 'bottom',
    title: (ctx) => ctx.t('tour:printScan.scanQr.title', { defaultValue: 'Scan the printed label' }),
    body: (ctx) =>
      ctx.t('tour:printScan.scanQr.body', {
        defaultValue: 'Point your camera at any printed label to jump to its bin — no typing needed.',
      }),
    route: '/',
    mobilePlacement: 'bottom',
    buttonLabel: (ctx) => ctx.t('tour:shared.gotIt', { defaultValue: 'Got it' }),
  },
];

export const printScan: TourDefinition = {
  id: 'print-scan',
  title: 'Print & scan',
  summary: 'Label formats, presets, and QR scanning',
  icon: Printer,
  steps,
};
