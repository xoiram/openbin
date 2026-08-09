import { Sparkles } from 'lucide-react';
import { formatKeys } from '@/lib/shortcuts';
import type { TourDefinition } from '../tourRegistry';
import { scanButtonSelector, type TourStep } from '../tourSteps';

const steps: TourStep[] = [
  {
    id: 'dashboard-overview',
    selector: '[data-tour="dashboard-overview"]',
    placement: 'bottom',
    title: (ctx) => ctx.t('tour:highlights.dashboardOverview.title', { defaultValue: 'Welcome home' }),
    body: (ctx) =>
      ctx.t('tour:highlights.dashboardOverview.body', {
        defaultValue: "Your dashboard surfaces pinned {{bins}}, recent scans, checkouts, and an activity heatmap so you can see what's moving.",
        bins: ctx.terminology.bins,
      }),
    route: '/',
    mobilePlacement: 'bottom',
  },
  {
    id: 'ask-ai',
    selector: (ctx) =>
      ctx.isMobile
        ? 'nav[aria-label="Main navigation"] button[aria-label="Ask AI"]'
        : '[data-tour="ask-ai-button"]',
    placement: 'bottom',
    title: (ctx) =>
      ctx.aiEnabled
        ? ctx.t('tour:highlights.askAi.titleEnabled', { defaultValue: 'Ask AI anything' })
        : ctx.t('tour:highlights.askAi.titleDisabled', { defaultValue: 'Find your {{bins}}', bins: ctx.terminology.bins }),
    body: (ctx) => {
      if (!ctx.aiEnabled) {
        return ctx.t('tour:highlights.askAi.bodyDisabled', {
          defaultValue: 'Use the search bar to find {{bins}} by name, tag, or contents.',
          bins: ctx.terminology.bins,
        });
      }
      const [shortcut] = formatKeys('mod+j');
      return ctx.t('tour:highlights.askAi.body', {
        defaultValue: 'Ask where something is, or tell it what to do — AI can create, edit, and find {{bins}}. Try {{shortcut}}.',
        bins: ctx.terminology.bins,
        shortcut,
      });
    },
    route: '/',
    condition: (ctx) => ctx.aiEnabled,
    mobilePlacement: 'top',
  },
  {
    id: 'scan-qr',
    selector: scanButtonSelector,
    placement: 'bottom',
    title: (ctx) => ctx.t('tour:highlights.scanQr.title', { defaultValue: 'Scan or search' }),
    body: (ctx) =>
      ctx.t('tour:highlights.scanQr.body', {
        defaultValue: 'Point your camera at a label to jump straight to that {{bin}}, or type its 6-character code.',
        bin: ctx.terminology.bin,
      }),
    route: '/',
    mobilePlacement: 'bottom',
  },
  {
    id: 'nav-sidebar',
    selector: '[data-tour="nav-sidebar"]',
    placement: 'right',
    title: (ctx) => ctx.t('tour:highlights.navSidebar.title', { defaultValue: 'Cross-bin views' }),
    body: (ctx) =>
      ctx.t('tour:highlights.navSidebar.body', {
        defaultValue: 'Open Items, Tags, or {{areas}} for cross-{{bin}} views and bulk edits — plus the trash and activity log.',
        areas: ctx.terminology.Areas,
        bin: ctx.terminology.bin,
      }),
    route: '/',
    mobileSelector: 'nav[aria-label="Main navigation"]',
    mobilePlacement: 'top',
  },
  {
    id: 'cta',
    selector: (ctx) => {
      if (ctx.canWrite && ctx.aiEnabled) return '[data-tour="ask-ai-button"]';
      if (ctx.canWrite) return '[data-tour="new-bin-button"]';
      return '[data-shortcut-search]';
    },
    placement: 'bottom',
    title: (ctx) => ctx.t('tour:highlights.cta.title', { defaultValue: 'That was the highlights' }),
    body: (ctx) => {
      if (ctx.canWrite && ctx.aiEnabled) {
        return ctx.t('tour:highlights.cta.bodyWriteAi', {
          defaultValue: 'Try "create a {{bin}} for kitchen utensils" to get started. More tours are available from the "?" button on each page, or from Settings.',
          bin: ctx.terminology.bin,
        });
      }
      if (ctx.canWrite) {
        return ctx.t('tour:highlights.cta.bodyWrite', {
          defaultValue: 'Create your next {{bin}} to get going. More tours are available from the "?" button on each page, or from Settings.',
          bin: ctx.terminology.bin,
        });
      }
      return ctx.t('tour:highlights.cta.bodyReadonly', {
        defaultValue: 'More tours are available from the "?" button on each page, or from Settings.',
      });
    },
    route: '/',
    mobilePlacement: 'bottom',
    buttonLabel: (ctx) => {
      if (ctx.canWrite && ctx.aiEnabled) return ctx.t('tour:highlights.cta.buttonTryIt', { defaultValue: 'Try it' });
      if (ctx.canWrite) {
        return ctx.t('tour:highlights.cta.buttonNewBin', { defaultValue: 'New {{bin}}', bin: ctx.terminology.bin });
      }
      return ctx.t('tour:shared.gotIt', { defaultValue: 'Got it' });
    },
  },
];

export const highlights: TourDefinition = {
  id: 'highlights',
  title: 'Highlights',
  summary: 'Dashboard, Ask AI, scan, and cross-bin views',
  icon: Sparkles,
  steps,
  autoFire: true,
};
