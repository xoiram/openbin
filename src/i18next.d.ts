import 'i18next';
import type ai from './locales/en/ai.json';
import type auth from './locales/en/auth.json';
import type bins from './locales/en/bins.json';
import type bulkAdd from './locales/en/bulkAdd.json';
import type capture from './locales/en/capture.json';
import type common from './locales/en/common.json';
import type errors from './locales/en/errors.json';
import type onboarding from './locales/en/onboarding.json';
import type photos from './locales/en/photos.json';
import type print from './locales/en/print.json';
import type qrcode from './locales/en/qrcode.json';
import type reorganize from './locales/en/reorganize.json';
import type settings from './locales/en/settings.json';
import type tags from './locales/en/tags.json';
import type tour from './locales/en/tour.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof common;
      errors: typeof errors;
      auth: typeof auth;
      onboarding: typeof onboarding;
      tour: typeof tour;
      settings: typeof settings;
      ai: typeof ai;
      bins: typeof bins;
      print: typeof print;
      qrcode: typeof qrcode;
      tags: typeof tags;
      capture: typeof capture;
      bulkAdd: typeof bulkAdd;
      reorganize: typeof reorganize;
      photos: typeof photos;
    };
  }
}
