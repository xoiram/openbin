import { useTranslation } from 'react-i18next';
import { describe, expect, it } from 'vitest';

// Covers the global react-i18next mock in src/test-setup.ts.
describe('mocked t()', () => {
  // Loosely typed: these keys are deliberately not in the real resources.
  const t = useTranslation().t as unknown as (key: string, opts?: Record<string, unknown>) => string;

  it('falls back to the key without a defaultValue', () => {
    expect(t('some.key')).toBe('some.key');
  });

  it('interpolates {{vars}} into the defaultValue', () => {
    expect(t('greet', { defaultValue: 'Hello {{name}}, {{ name }}!', name: 'Ada' })).toBe('Hello Ada, Ada!');
  });

  it('leaves unknown placeholders alone', () => {
    expect(t('greet', { defaultValue: 'Hello {{name}}' })).toBe('Hello {{name}}');
  });

  it('picks the plural default by count', () => {
    const opts = { defaultValue_one: '{{count}} item', defaultValue_other: '{{count}} items' };
    expect(t('items', { ...opts, count: 1 })).toBe('1 item');
    expect(t('items', { ...opts, count: 3 })).toBe('3 items');
  });
});
