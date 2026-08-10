import { defineConfig } from 'i18next-cli';

// Foundation PR (see docs/i18n.md): only `common` and `auth` exist so far,
// covering src/features/auth/** and src/features/layout/**. The extract/lint
// input glob is deliberately scoped to those two folders rather than all of
// src/** — the other ~25 feature folders (~200 files) still have hardcoded
// English strings by design (see plan §14) and aren't ready to be linted
// until their own follow-up PR adds a namespace for them. Each follow-up PR
// should widen this glob to include the folder(s) it migrates.
//
// `src/features/settings/` is split across multiple PRs (see docs/i18n.md's
// Roadmap): shell + general prefs, then account/security, then data
// export/import, then settings/sections/AiSection.tsx (the AI provider-
// config page) + its direct dependencies, then InlineAiSetup.tsx +
// AiSetupDialog.tsx, then EmptyConversationState.tsx + ConversationScopePill.tsx,
// then CommandInput.tsx's dialog chrome, all under the `ai` namespace — the
// Ask AI chat UI is large enough (~50 files) that it's its own sequence of
// PRs within the roadmap. This one is "chat PR 1 of 7": the composer itself
// (ConversationComposer.tsx, TranscriptionMicButton.tsx) plus
// ConversationUI.tsx (fixes a useTerminology()-as-`t` naming collision in
// useBinNavigate — no translatable strings of its own) and a small fix to
// useAiProviderSetup.ts's two toasts, which were missed when
// InlineAiSetup.tsx (its only real caller) was migrated earlier. "Chat 2"
// covers turn rendering + commandActionUtils.ts's describeAction() (AiTurnThinking,
// AiTurnError, AiTurnCommandPreview, AiTurnExecutionResult, QueryAnswerBody,
// CommandActionList, commandActionUtils.ts — AiTurnQueryResult.tsx, QueryIntroText.tsx,
// and commandSelectedBins.ts have no strings of their own and are omitted). "Chat 3"
// covers streaming/ask-flow hooks: useAiStream.ts, useStreamingAsk.ts (classifyResult()
// takes `t` as a parameter for the same reason describeAction() does — it's a plain
// function, not a hook, and is also called from useAskFlow.ts), and useAskFlow.ts.
// StreamingText.tsx, useCommand.ts, useInventoryQuery.ts, and conversationTurns.ts have
// no strings of their own and are omitted; AiStreamingPreview.tsx belongs to chat 5. "Chat 4"
// covers bin/item display in query results: BinDisclosurePill.tsx, BinGroupHeader.tsx,
// BinItemGroup.tsx, ItemActionMenu.tsx, ItemRow.tsx, ItemQueryResults.tsx,
// ItemSelectionBar.tsx, and matchDisplay.ts (getMatchDisplay() takes an optional `t` —
// omitted, it falls back to the pre-existing plain `pluralize()` behavior verbatim,
// which keeps matchDisplay.test.ts's exact-string assertions untouched; its one call
// site, BinItemGroup.tsx, always passes the real `t`). SelectionCheckbox.tsx and
// useItemQuerySelection.ts have no strings of their own and are omitted. "Chat 5" covers
// photo-analysis + AI suggestions: AiAnalyzeProgress.tsx, analyzeLabel.ts
// (computeAnalyzeLabel() takes the same optional-`t` pattern as getMatchDisplay() — its
// own exact-string test calls it with no `t`), AiSuggestionsPanel.tsx, AiStreamingPreview.tsx
// (both its exports, AiStreamingPreview and AiAnalyzeError), and useTextStructuring.ts.
// parsePartialAnalysis.ts and AiCreditDisplay.tsx have no strings of their own and are
// omitted. "Chat 6" covers aiErrors.ts's mapAiError() (same optional-`t` pattern as
// describeAction()/getMatchDisplay()/computeAnalyzeLabel() — useCommand.test.ts and
// useTextStructuring.test.ts call it directly with no `t`) across its 7 real call
// sites: useAiStream.ts, useAskFlow.ts, useTextStructuring.ts (already had `t` in
// scope from earlier chats — just added as the 3rd arg), useCommandExecution.ts,
// useGroupReviewAi.ts (src/features/bulk-add/ — reaches into the `ai` namespace since
// its two mapAiError calls are the reason it's touched at all, not a bulk-add
// migration), and src/lib/useTranscription.ts (same reasoning — only its mapAiError
// fallback is translated, not its other unrelated hardcoded strings). The planned
// remaining step: finally AiSettingsSection.tsx (chat 7, standalone,
// 523 lines, also retires the legacy PROMPT_HELP_TEXT export once it's the
// only remaining consumer). `useDefaultPrompts.ts` has no user-facing
// strings, so it's omitted. `exportImport.ts`'s own thrown Error messages
// are never surfaced to users as-is (callers either discard them for a
// generic message or re-derive their own from the error `code`),
// so it's omitted too. `useApiKeys.ts` has no user-facing strings either.
//

// CAUTION running `npx i18next-cli extract` locally: `common.json`'s
// `actions.*`/`itemCount_*` keys were added pre-emptively (see docs/i18n.md)
// for future namespace PRs to reuse, ahead of having call sites in the
// current `input` scope — `extract`'s default unused-key removal deletes
// them since nothing here references them yet. `Sidebar.tsx` also builds a
// nav label key dynamically, which the extractor can't resolve and will
// write back as a literal garbage key (e.g. `nav.${...}`). Diff
// `common.json`/`auth.json` after running extract and revert unintended
// changes to files outside the namespace(s) your PR is migrating — CI only
// runs `lint`, not `extract`, so this is a local-workflow hazard, not a
// build break.
export default defineConfig({
  locales: ['en', 'nb'],
  extract: {
    input: [
      'src/features/auth/**/*.{ts,tsx}',
      'src/features/layout/**/*.{ts,tsx}',
      'src/features/onboarding/**/*.{ts,tsx}',
      'src/features/tour/**/*.{ts,tsx}',
      'src/features/settings/SettingsPageHeader.tsx',
      'src/features/settings/SettingsListRow.tsx',
      'src/features/settings/SettingsCategoryList.tsx',
      'src/features/settings/SettingsRow.tsx',
      'src/features/settings/SettingsRadioCard.tsx',
      'src/features/settings/SettingsSidebar.tsx',
      'src/features/settings/SettingsSection.tsx',
      'src/features/settings/SettingsLayout.tsx',
      'src/features/settings/SettingsProfileHeader.tsx',
      'src/features/settings/settingsCategories.ts',
      'src/features/settings/useSettingsCategories.ts',
      'src/features/settings/useSavedFlash.tsx',
      'src/features/settings/sections/AboutSection.tsx',
      'src/features/settings/sections/PersonalizationSection.tsx',
      'src/features/settings/sections/PreferencesSection.tsx',
      'src/features/settings/sections/AccountSection.tsx',
      'src/features/settings/dialogs/DeleteAccountDialog.tsx',
      'src/features/settings/dialogs/RecoverAccountDialog.tsx',
      'src/features/settings/sections/DataSection.tsx',
      'src/features/settings/useDataSectionActions.ts',
      'src/features/settings/sections/AiSection.tsx',
      'src/features/ai/aiConstants.ts',
      'src/features/ai/promptHelpText.tsx',
      'src/features/ai/TaskRoutingSection.tsx',
      'src/features/ai/InlineAiSetup.tsx',
      'src/features/ai/AiSetupDialog.tsx',
      'src/features/ai/EmptyConversationState.tsx',
      'src/features/ai/ConversationScopePill.tsx',
      'src/features/ai/CommandInput.tsx',
      'src/features/ai/ConversationComposer.tsx',
      'src/features/ai/TranscriptionMicButton.tsx',
      'src/features/ai/ConversationUI.tsx',
      'src/features/ai/useAiProviderSetup.ts',
      'src/features/ai/AiTurnThinking.tsx',
      'src/features/ai/AiTurnError.tsx',
      'src/features/ai/AiTurnCommandPreview.tsx',
      'src/features/ai/AiTurnExecutionResult.tsx',
      'src/features/ai/QueryAnswerBody.tsx',
      'src/features/ai/CommandActionList.tsx',
      'src/features/ai/commandActionUtils.ts',
      'src/features/ai/useAiStream.ts',
      'src/features/ai/useStreamingAsk.ts',
      'src/features/ai/useAskFlow.ts',
      'src/features/ai/BinDisclosurePill.tsx',
      'src/features/ai/BinGroupHeader.tsx',
      'src/features/ai/BinItemGroup.tsx',
      'src/features/ai/ItemActionMenu.tsx',
      'src/features/ai/ItemRow.tsx',
      'src/features/ai/ItemQueryResults.tsx',
      'src/features/ai/ItemSelectionBar.tsx',
      'src/features/ai/matchDisplay.ts',
      'src/features/ai/AiAnalyzeProgress.tsx',
      'src/features/ai/analyzeLabel.ts',
      'src/features/ai/AiSuggestionsPanel.tsx',
      'src/features/ai/AiStreamingPreview.tsx',
      'src/features/ai/useTextStructuring.ts',
      'src/features/ai/aiErrors.ts',
      'src/features/ai/useCommandExecution.ts',
      'src/features/bulk-add/useGroupReviewAi.ts',
      'src/lib/useTranscription.ts',
    ],
    ignore: ['**/__tests__/**', '**/*.test.{ts,tsx}'],
    output: 'src/locales/{{language}}/{{namespace}}.json',
    primaryLanguage: 'en',
    secondaryLanguages: ['nb'],
    // Dynamic keys the static extractor can't resolve (both build a key from
    // a runtime id, not a literal string) — see docs/i18n.md for the pattern.
    // TourLauncher.tsx: `picker.${tourId}.title` from tourRegistry data.
    // useSettingsCategories.ts / SettingsLayout.tsx: `categories.${cat.id}.label`
    // from SETTINGS_CATEGORIES. aiConstants.ts's aiProviderLabel()/
    // aiTaskGroupLabel() helpers and their call sites in AiSection.tsx/
    // TaskRoutingSection.tsx: `ai:providers.${key}` / `ai:taskGroups.${key}.*`.
    // commandActionUtils.ts's describeAction() calls a locally-cast `translate`
    // (not `t`) to work around the TFunction cross-namespace branding issue —
    // the extractor only recognizes calls named `t`/`i18n.t`, so it can't see
    // these literal-key calls at all and treats every `commandActions.*` key as
    // unused. `ai:commandActions.*` preserves them the same way `ai:providers.*`
    // does for aiConstants.ts's identical `translate` pattern. useStreamingAsk.ts's
    // classifyResult() has the same issue for its one `translate`-aliased call
    // (`ai:streamingAsk.*` covers it; its sibling key used via the hook's own
    // `t` doesn't need preserving but shares the block for locality).
    // analyzeLabel.ts's computeAnalyzeLabel() has the same aliased-`translate`
    // issue (`ai:analyzeLabel.*`). AiStreamingPreview.tsx's AiAnalyzeError looks
    // up its title via `t(variantTitleKey(variant), ...)` — a computed key, not
    // a literal — so `ai:analyzeError.title*` preserves those four variants.
    // aiErrors.ts's mapAiError() has the same aliased-`translate` issue for its
    // four internal messages (`ai:aiErrors.*`).
    preservePatterns: [
      'tour:picker.*.title',
      'tour:picker.*.summary',
      'settings:categories.*.label',
      'settings:categories.*.description',
      'ai:providers.*',
      'ai:taskGroups.*.label',
      'ai:taskGroups.*.description',
      'ai:commandActions.*',
      'ai:streamingAsk.*',
      'ai:analyzeLabel.*',
      'ai:analyzeError.title*',
      'ai:aiErrors.*',
      'settings:ai.promptTabs.*.label',
      'settings:ai.promptTabs.*.shortLabel',
    ],
  },
});
