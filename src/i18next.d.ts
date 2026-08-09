import 'i18next';
import type auth from './locales/en/auth.json';
import type common from './locales/en/common.json';
import type onboarding from './locales/en/onboarding.json';
import type tour from './locales/en/tour.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof common;
      auth: typeof auth;
      onboarding: typeof onboarding;
      tour: typeof tour;
    };
  }
}
