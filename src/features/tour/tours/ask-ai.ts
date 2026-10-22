import { MessageCircle } from 'lucide-react';
import { formatKeys } from '@/lib/shortcuts';
import type { TourDefinition } from '../tourRegistry';
import { delay, type TourStep } from '../tourSteps';

const steps: TourStep[] = [
  {
    id: 'open-palette',
    selector: '[data-tour="ask-composer"]',
    placement: 'bottom',
    title: (ctx) => ctx.t('tour:askAi.openPalette.title', { defaultValue: 'Ask anything' }),
    body: (ctx) => {
      if (ctx.isMobile) {
        return ctx.t('tour:askAi.openPalette.bodyMobile', { defaultValue: 'Ask where something is, or tell AI what to do.' });
      }
      const [shortcut] = formatKeys('mod+j');
      return ctx.t('tour:askAi.openPalette.body', { defaultValue: 'Open Ask AI with {{shortcut}} from anywhere.', shortcut });
    },
    route: '/',
    mobilePlacement: 'bottom',
    // Open the dialog once on entry; subsequent steps rely on it staying open.
    // Tour-level `onEnd` handles the close so we don't flash open/closed between steps.
    beforeShow: async (ctx) => {
      ctx.openCommandInput();
      await delay(400);
    },
  },
  {
    id: 'voice-input',
    selector: '[data-tour="voice-input"]',
    placement: 'top',
    title: (ctx) => ctx.t('tour:askAi.voiceInput.title', { defaultValue: 'Talk instead of type' }),
    body: (ctx) =>
      ctx.t('tour:askAi.voiceInput.body', { defaultValue: 'Tap the mic to dictate — great for hands-busy capture.' }),
    route: '/',
    mobilePlacement: 'top',
  },
  {
    id: 'photo-to-bin',
    selector: '[data-tour="photo-to-bin"]',
    placement: 'top',
    title: (ctx) => ctx.t('tour:askAi.photoToBin.title', { defaultValue: 'Drop a photo into the chat' }),
    body: (ctx) =>
      ctx.t('tour:askAi.photoToBin.body', {
        defaultValue: 'Attach a photo and AI creates a {{bin}} from it — items, tags, notes included.',
        bin: ctx.terminology.bin,
      }),
    route: '/',
    condition: (ctx) => ctx.canWrite,
    mobilePlacement: 'top',
  },
  {
    id: 'try-query',
    selector: '[data-tour="ask-composer"]',
    placement: 'top',
    title: (ctx) => ctx.t('tour:askAi.tryQuery.title', { defaultValue: 'Try a query' }),
    body: (ctx) =>
      ctx.t('tour:askAi.tryQuery.body', {
        defaultValue: 'Ask "where are the batteries?" or "create a kitchen utensils {{bin}}".',
        bin: ctx.terminology.bin,
      }),
    route: '/',
    mobilePlacement: 'top',
    buttonLabel: (ctx) => ctx.t('tour:shared.gotIt', { defaultValue: 'Got it' }),
  },
];

export const askAi: TourDefinition = {
  id: 'ask-ai',
  title: 'Ask AI & voice',
  summary: 'Palette, voice dictation, photo-to-bin',
  icon: MessageCircle,
  steps,
  onEnd: (ctx) => {
    ctx.closeCommandInput();
  },
};
