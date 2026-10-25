import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18nTestUtils';
import { formatApplyDescription } from '../formatApplyDescription';

describe('formatApplyDescription', () => {
  it('says boxes that contain boxes are kept and emptied, not deleted', () => {
    const t = createTestI18n().getFixedT('en', 'reorganize');
    const text = formatApplyDescription({ kept: 1, deleted: 0, created: 0, emptied: 2 }, 'box', 'boxes', t);
    expect(text).toContain('2 boxes that contain other boxes will be kept and emptied, not deleted.');
    expect(text).not.toMatch(/delete 2/);
  });

  it('is unchanged without emptied boxes', () => {
    const t = createTestI18n().getFixedT('en', 'reorganize');
    expect(formatApplyDescription({ kept: 1, deleted: 1, created: 0 }, 'box', 'boxes', t)).toBe(
      'This will update 1 existing box in place and delete 1 box.',
    );
  });
});
