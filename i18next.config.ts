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
// export/import. This one finishes settings/sections/AiSection.tsx (the AI
// provider-config page) plus its direct dependencies from src/features/ai/
// (TaskRoutingSection.tsx, aiConstants.ts, promptHelpText.tsx) under a new
// `ai` namespace — NOT the rest of ai/ (the Ask AI chat UI: CommandInput,
// ConversationThread, streaming, ~50 more files), which is its own much
// larger future PR (or several). `useDefaultPrompts.ts` has no user-facing
// strings, so it's omitted. `exportImport.ts`'s own thrown Error messages
// are never surfaced to users as-is (callers either discard them for a
// generic message or re-derive their own from the error `code`), so it's
// omitted too. `useApiKeys.ts` has no user-facing strings either.
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
    preservePatterns: [
      'tour:picker.*.title',
      'tour:picker.*.summary',
      'settings:categories.*.label',
      'settings:categories.*.description',
      'ai:providers.*',
      'ai:taskGroups.*.label',
      'ai:taskGroups.*.description',
      'settings:ai.promptTabs.*.label',
      'settings:ai.promptTabs.*.shortLabel',
    ],
  },
});
