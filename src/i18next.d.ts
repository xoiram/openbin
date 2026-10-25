import 'i18next';
import type admin from './locales/en/admin.json';
import type ai from './locales/en/ai.json';
import type auth from './locales/en/auth.json';
import type bins from './locales/en/bins.json';
import type common from './locales/en/common.json';
import type errors from './locales/en/errors.json';
import type onboarding from './locales/en/onboarding.json';
import type settings from './locales/en/settings.json';
import type tour from './locales/en/tour.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof common;
      auth: typeof auth;
      errors: typeof errors;
      onboarding: typeof onboarding;
      tour: typeof tour;
      settings: typeof settings;
      ai: typeof ai;
      bins: typeof bins;
      admin: typeof admin;
    };
  }
}
