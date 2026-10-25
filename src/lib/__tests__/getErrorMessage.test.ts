import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('react-i18next');

// Swap the app singleton for a real instance loaded with the en/nb resources.
vi.mock('@/lib/i18n', async () => {
  const { createTestI18n } = await import('@/test/i18nTestUtils');
  return { default: createTestI18n() };
});

const { default: i18n } = await import('@/lib/i18n');
const { ApiError } = await import('@/lib/api');
const { getErrorMessage } = await import('@/lib/utils');

describe('getErrorMessage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('keeps the server message in English', () => {
    expect(getErrorMessage(new ApiError(404, 'Bin not found', 'NOT_FOUND'))).toBe('Bin not found');
  });

  it('translates by code in Norwegian', async () => {
    await i18n.changeLanguage('nb');
    expect(getErrorMessage(new ApiError(404, 'Bin not found', 'NOT_FOUND'))).toBe(
      'Fant det ikke. Det kan ha blitt flyttet eller slettet.',
    );
  });

  it('falls back to the server message for unknown codes', async () => {
    await i18n.changeLanguage('nb');
    expect(getErrorMessage(new ApiError(400, 'Weird thing', 'SOMETHING_NEW'))).toBe('Weird thing');
  });

  it('leaves VALIDATION_ERROR as the server text', async () => {
    await i18n.changeLanguage('nb');
    expect(getErrorMessage(new ApiError(400, 'Name is required', 'VALIDATION_ERROR'))).toBe('Name is required');
  });

  it('leaves non-ApiError values unchanged', async () => {
    await i18n.changeLanguage('nb');
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
    expect(getErrorMessage('plain')).toBe('plain');
    expect(getErrorMessage(42, 'fallback')).toBe('fallback');
  });
});
