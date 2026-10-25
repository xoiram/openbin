import 'i18next';
import type ai from './locales/en/ai.json';
import type attachments from './locales/en/attachments.json';
import type auth from './locales/en/auth.json';
import type bins from './locales/en/bins.json';
import type checklist from './locales/en/checklist.json';
import type checkouts from './locales/en/checkouts.json';
import type common from './locales/en/common.json';
import type errors from './locales/en/errors.json';
import type items from './locales/en/items.json';
import type onboarding from './locales/en/onboarding.json';
import type print from './locales/en/print.json';
import type qrcode from './locales/en/qrcode.json';
import type settings from './locales/en/settings.json';
import type shoppingList from './locales/en/shoppingList.json';
import type tags from './locales/en/tags.json';
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
      items: typeof items;
      checkouts: typeof checkouts;
      checklist: typeof checklist;
      attachments: typeof attachments;
      shoppingList: typeof shoppingList;
      bins: typeof bins;
      print: typeof print;
      qrcode: typeof qrcode;
      tags: typeof tags;
    };
  }
}
