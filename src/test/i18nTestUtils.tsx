import { type RenderResult, render } from '@testing-library/react';
import i18next from 'i18next';
import type { ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import enAuth from '@/locales/en/auth.json';
import enCommon from '@/locales/en/common.json';
import enOnboarding from '@/locales/en/onboarding.json';
import enSettings from '@/locales/en/settings.json';
import enTour from '@/locales/en/tour.json';
import nbAuth from '@/locales/nb/auth.json';
import nbCommon from '@/locales/nb/common.json';
import nbOnboarding from '@/locales/nb/onboarding.json';
import nbSettings from '@/locales/nb/settings.json';
import nbTour from '@/locales/nb/tour.json';

/**
 * A dedicated i18next instance (via createInstance(), not the shared default
 * export) so real-resource integration tests never collide with the app's
 * side-effecting src/lib/i18n.ts init — components under test read this
 * instance only through the <I18nextProvider> context below, regardless of
 * whether src/lib/i18n.ts has been imported elsewhere in the same test run.
 */
function createTestI18n() {
  const instance = i18next.createInstance();
  instance.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    ns: ['common', 'auth', 'onboarding', 'tour', 'settings'],
    defaultNS: 'common',
    resources: {
      en: { common: enCommon, auth: enAuth, onboarding: enOnboarding, tour: enTour, settings: enSettings },
      nb: { common: nbCommon, auth: nbAuth, onboarding: nbOnboarding, tour: nbTour, settings: nbSettings },
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
  return instance;
}

/**
 * Renders `ui` against a *real* i18next instance with the actual en/common
 * and en/auth JSON loaded synchronously (unlike the global test-setup mock,
 * which just echoes back key/defaultValue) — catches broken keys, missing
 * interpolation vars, and JSON typos that the mock wouldn't. Call
 * `vi.unmock('react-i18next')` at the top of a test file before using this,
 * since the global setup file mocks 'react-i18next' by default.
 */
export function renderWithI18n(ui: ReactElement, options?: { language?: string }): RenderResult {
  const instance = createTestI18n();
  if (options?.language) {
    instance.changeLanguage(options.language);
  }
  return render(<I18nextProvider i18n={instance}>{ui}</I18nextProvider>);
}
