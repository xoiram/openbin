import 'i18next';
import type activity from './locales/en/activity.json';
import type ai from './locales/en/ai.json';
import type areas from './locales/en/areas.json';
import type auth from './locales/en/auth.json';
import type bins from './locales/en/bins.json';
import type common from './locales/en/common.json';
import type dashboard from './locales/en/dashboard.json';
import type errors from './locales/en/errors.json';
import type locations from './locales/en/locations.json';
import type onboarding from './locales/en/onboarding.json';
import type settings from './locales/en/settings.json';
import type tour from './locales/en/tour.json';
import type usage from './locales/en/usage.json';

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
      dashboard: typeof dashboard;
      locations: typeof locations;
      areas: typeof areas;
      activity: typeof activity;
      usage: typeof usage;
    };
  }
}
