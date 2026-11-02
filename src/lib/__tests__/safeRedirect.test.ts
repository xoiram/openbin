import { describe, expect, it } from 'vitest';
import { safeNextPath } from '../safeRedirect';

describe('safeNextPath', () => {
  it('accepts same-origin absolute paths, keeping query and hash', () => {
    expect(safeNextPath('/bin/abc')).toBe('/bin/abc');
    expect(safeNextPath('/bin/abc?x=1#top')).toBe('/bin/abc?x=1#top');
    expect(safeNextPath('/')).toBe('/');
  });

  it('returns null when there is nothing to use', () => {
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath('')).toBeNull();
  });

  it.each([
    ['absolute URL', 'https://evil.example/bin/abc'],
    ['protocol-relative URL', '//evil.example'],
    ['backslash host trick', '/\\evil.example'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['relative path', 'bin/abc'],
    ['tab that browsers strip, making //', '/\t/evil.example'],
    ['newline', '/bin/abc\nSet-Cookie: x=1'],
    ['null byte', '/bin/abc\u0000'],
  ])('rejects %s', (_label, raw) => {
    expect(safeNextPath(raw)).toBeNull();
  });

  it('rejects auth pages, which would loop or skip the intended destination', () => {
    expect(safeNextPath('/login')).toBeNull();
    expect(safeNextPath('/login?next=/bin/abc')).toBeNull();
    expect(safeNextPath('/register')).toBeNull();
  });
});
