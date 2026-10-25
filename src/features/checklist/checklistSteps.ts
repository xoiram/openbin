import type { TFunction } from 'i18next';
import type { LucideIcon } from 'lucide-react';
import { MessageCircle, PackagePlus, Printer, Sparkles } from 'lucide-react';

export type ChecklistStepId = 'create-bin' | 'add-three-bins' | 'ask-ai' | 'print-label';

export interface ChecklistContext {
  totalBins: number;
  aiAskedAt: string | null;
  printVisitedAt: string | null;
}

export interface ChecklistStep {
  id: ChecklistStepId;
  icon: LucideIcon;
  isComplete: (ctx: ChecklistContext) => boolean;
}

export const CHECKLIST_STEPS: ChecklistStep[] = [
  {
    id: 'create-bin',
    icon: PackagePlus,
    isComplete: (ctx) => ctx.totalBins > 0,
  },
  {
    id: 'add-three-bins',
    icon: Sparkles,
    isComplete: (ctx) => ctx.totalBins >= 3,
  },
  {
    id: 'ask-ai',
    icon: MessageCircle,
    isComplete: (ctx) => ctx.aiAskedAt !== null,
  },
  {
    id: 'print-label',
    icon: Printer,
    isComplete: (ctx) => ctx.printVisitedAt !== null,
  },
];

/** Localized title/description for a step (kept out of the static step data so it follows the active language). */
export function checklistStepText(id: ChecklistStepId, t: TFunction<'checklist'>): { title: string; description: string } {
  switch (id) {
    case 'create-bin':
      return {
        title: t('steps.createBin.title', { defaultValue: 'Add your first bin' }),
        description: t('steps.createBin.description', { defaultValue: 'Snap a photo and let AI fill it in' }),
      };
    case 'add-three-bins':
      return {
        title: t('steps.addThreeBins.title', { defaultValue: 'Build out your shelf' }),
        description: t('steps.addThreeBins.description', { defaultValue: 'Reach 3 bins so AI search has something to work with' }),
      };
    case 'ask-ai':
      return {
        title: t('steps.askAi.title', { defaultValue: 'Ask AI to find something' }),
        description: t('steps.askAi.description', { defaultValue: 'Type a question — AI checks every bin' }),
      };
    case 'print-label':
      return {
        title: t('steps.printLabel.title', { defaultValue: 'Print your first label' }),
        description: t('steps.printLabel.description', { defaultValue: 'A QR sticker turns any bin into a tap-to-open shortcut' }),
      };
  }
}
