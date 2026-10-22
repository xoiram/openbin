import type { ComponentProps } from 'react';
import { Trans } from 'react-i18next';

export type PromptTab = 'analysis' | 'command' | 'query' | 'structure' | 'reorganization' | 'tagSuggestion';

const V = ({ children }: { children: string }) => (
  <code className="text-[var(--text-xs)] px-1 py-0.5 rounded bg-[var(--bg-input)]">{children}</code>
);

const PROMPT_HELP_DEFAULTS: Record<PromptTab, string> = {
  analysis: 'Existing tags and custom fields are passed automatically in the user message. This prompt defines the instructions only.',
  command: 'Inventory context (bins, items, areas, tags, colors, icons) is passed automatically. This prompt defines the instructions only.',
  query: 'Inventory context (bins, items, areas, tags) is passed automatically. This prompt defines the instructions only.',
  structure: 'Bin name and existing items are appended automatically. This prompt defines the extraction rules.',
  reorganization: 'Available variables: <v>{max_bins_instruction}</v> <v>{area_instruction}</v> <v>{strictness_instruction}</v> <v>{granularity_instruction}</v> <v>{duplicates_instruction}</v> <v>{ambiguous_instruction}</v> <v>{outliers_instruction}</v> <v>{items_per_bin_instruction}</v> <v>{notes_instruction}</v>. Existing tags are passed automatically in the user message.',
  tagSuggestion: 'Governs AI tag suggestions (Tags mode on the Reorganize page). The model sees the full tag vocabulary of the location plus a list of bins with items/area/existing tags, and proposes a cleaner taxonomy and per-bin assignments. Available variables: <v>{change_level_instruction}</v> <v>{granularity_instruction}</v> <v>{tag_count_instruction}</v> <v>{notes_instruction}</v>.',
};

/**
 * Renders the help copy for a prompt tab, translated, with `<v>` variable
 * tokens kept as `<V>` chips. `t` is typed `unknown` and cast internally —
 * see aiConstants.ts's Translate comment: i18next's branded TFunction<Ns>
 * doesn't structurally satisfy a plain callable parameter type, so callers
 * scoped to multiple namespaces (e.g. useTranslation(['settings', 'ai']))
 * can pass their `t` straight through regardless of its branding.
 */
export function PromptHelpText({ tab, t }: { tab: PromptTab; t: unknown }) {
  const transT = t as ComponentProps<typeof Trans>['t'];
  return (
    <Trans
      t={transT}
      ns="ai"
      i18nKey={`promptHelp.${tab}`}
      defaults={PROMPT_HELP_DEFAULTS[tab]}
      components={{ v: <V>{''}</V> }}
    />
  );
}
