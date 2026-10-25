import { defineConfig } from 'i18next-cli';

// Lint/extract scope is all of src/, minus tests and the folders that are
// deliberately out of i18n scope (legal/ and the separately-licensed ee/).
// Folders not yet migrated are covered by i18next-lint-baseline.json, so CI
// (`npx i18next-cli lint`) fails only on *new* hardcoded strings. After
// migrating strings, run `npx i18next-cli lint --update-baseline` to shrink it.
// See docs/i18n.md for the migration status and roadmap.

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
    input: ['src/**/*.{ts,tsx}'],
    ignore: [
      '**/__tests__/**',
      '**/*.test.{ts,tsx}',
      '**/*.d.ts',
      'src/test/**',
      'src/test-setup.ts',
      'src/features/legal/**',
      'src/ee/**',
    ],
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
    // utils.ts's getErrorMessage() builds `errors:codes.${err.code}` from the
    // API error code at runtime.
    preservePatterns: [
      'errors:codes.*',
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
      // HelpSheet.tsx renders CAMERA_TIPS via `tips.items.${tip.id}` (tips.ts keeps
      // the English headline as defaultValue).
      'capture:tips.items.*',
    ],
  },
});
