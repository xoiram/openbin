import { defineConfig } from 'i18next-cli';

// Foundation PR (see docs/i18n.md): only `common` and `auth` exist so far,
// covering src/features/auth/** and src/features/layout/**. The extract/lint
// input glob is deliberately scoped to those two folders rather than all of
// src/** — the other ~25 feature folders (~200 files) still have hardcoded
// English strings by design (see plan §14) and aren't ready to be linted
// until their own follow-up PR adds a namespace for them. Each follow-up PR
// should widen this glob to include the folder(s) it migrates.
//
// Note: src/features/settings/sections/PreferencesSection.tsx and
// src/components/LanguageSync.tsx were also touched by this PR (the language
// selector row / server-sync component), but deliberately excluded here —
// they're `settings` namespace territory (deferred, see docs/i18n.md's
// Roadmap), and PreferencesSection.tsx has plenty of *other* pre-existing
// hardcoded strings unrelated to language selection that aren't this PR's
// job to migrate. Including them would make the linter demand a full-file
// migration neither this PR nor its scope calls for.
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
    ],
    ignore: ['**/__tests__/**', '**/*.test.{ts,tsx}'],
    output: 'src/locales/{{language}}/{{namespace}}.json',
    primaryLanguage: 'en',
    secondaryLanguages: ['nb'],
    // TourLauncher.tsx resolves TourDefinition.title/.summary via a dynamic
    // key (`picker.${tourId}.title`) built from tourRegistry data at
    // runtime, not a literal string — the static extractor can't see this
    // usage and would otherwise flag/delete these keys as unused.
    preservePatterns: ['tour:picker.*.title', 'tour:picker.*.summary'],
  },
});
