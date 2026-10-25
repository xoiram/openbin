import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the database module
const mockQuery = vi.fn();
vi.mock('../../db.js', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  d: {
    jsonGroupArray: (expr: string) => `json_group_array(${expr})`,
    jsonObject: (...args: string[]) => `json_object(${args.join(', ')})`,
    jsonGroupObject: (k: string, v: string) => `json_group_object(${k}, ${v})`,
    now: () => "datetime('now')",
  },
  generateUuid: () => 'test-uuid',
  isUniqueViolation: () => false,
}));
vi.mock('../config.js', () => ({
  config: { photoStoragePath: '/tmp/photos', maxPhotoSizeMb: 5, maxAvatarSizeMb: 2 },
}));
vi.mock('../storage.js', () => ({
  storage: { readStream: vi.fn(), exists: vi.fn(), delete: vi.fn() },
}));
vi.mock('../customFieldHelpers.js', () => ({
  replaceCustomFieldValues: vi.fn(),
}));
vi.mock('../shortCode.js', () => ({
  generateShortCode: () => 'ABC123',
}));
vi.mock('../pathSafety.js', () => ({
  isPathSafe: () => true,
  safePath: (base: string, rel: string) => `${base}/${rel}`,
}));
vi.mock('../logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const {
  assertSupportedExportVersion, buildExportBinEntry, buildParentShortCodeMap, fetchLocationBins, fetchLocationSavedViews,
  fetchLocationPinnedBins, fetchLooseItems, fetchTrashedBins, buildAreaExportEntries, normalizeItemList, normalizeQuantity, replaceCleanup,
} = await import('../exportHelpers.js');

describe('fetchLocationBins', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes visibility filter in SQL when userId provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await fetchLocationBins('loc-1', 'user-1');

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('visibility');
    expect(sql).toContain('created_by');
    const params = mockQuery.mock.calls[0][1] as string[];
    expect(params).toEqual(['loc-1', 'user-1']);
  });

  it('omits visibility filter when no userId provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await fetchLocationBins('loc-1');

    const sql = mockQuery.mock.calls[0][0] as string;
    // Should not have the AND (visibility = ... OR created_by = ...) clause
    expect(sql).not.toMatch(/AND \(b\.visibility = 'location' OR b\.created_by/);
    const params = mockQuery.mock.calls[0][1] as string[];
    expect(params).toEqual(['loc-1']);
  });
});

describe('fetchTrashedBins', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes visibility filter in SQL when userId provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await fetchTrashedBins('loc-1', 'user-1');

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('visibility');
    expect(sql).toContain('created_by');
    const params = mockQuery.mock.calls[0][1] as string[];
    expect(params).toEqual(['loc-1', 'user-1']);
  });
});

describe('fetchLocationPinnedBins', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters to requesting user when userId provided', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ user_id: 'user-1', bin_id: 'bin-1', position: 0 }],
    });

    await fetchLocationPinnedBins('loc-1', 'user-1');

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('pb.user_id = $2');
    const params = mockQuery.mock.calls[0][1] as string[];
    expect(params).toEqual(['loc-1', 'user-1']);
  });

  it('returns all users when no userId provided', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { user_id: 'user-1', bin_id: 'bin-1', position: 0 },
        { user_id: 'user-2', bin_id: 'bin-2', position: 0 },
      ],
    });

    const result = await fetchLocationPinnedBins('loc-1');

    expect(result).toHaveLength(2);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).not.toContain('pb.user_id = $2');
  });
});

describe('fetchLocationSavedViews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters to requesting user when userId provided', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ user_id: 'user-1', name: 'My View', search_query: 'test', sort: 'name', filters: '{}' }],
    });

    await fetchLocationSavedViews('loc-1', 'user-1');

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('sv.user_id = $2');
    const params = mockQuery.mock.calls[0][1] as string[];
    expect(params).toEqual(['loc-1', 'user-1']);
  });

  it('returns all users when no userId provided', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { user_id: 'user-1', name: 'My View', search_query: 'test', sort: 'name', filters: '{}' },
        { user_id: 'user-2', name: 'Their View', search_query: 'secret', sort: 'name', filters: '{}' },
      ],
    });

    const result = await fetchLocationSavedViews('loc-1');

    expect(result).toHaveLength(2);
  });
});

describe('assertSupportedExportVersion', () => {
  it.each([undefined, null, 2, 3, 4])('accepts %s', (v) => {
    expect(() => assertSupportedExportVersion(v)).not.toThrow();
  });
  it.each([1, 0, 5, 100, 4.5, '4', true, {}, Number.NaN])('rejects %j', (v) => {
    expect(() => assertSupportedExportVersion(v)).toThrow(/version/i);
  });
});

describe('normalizeQuantity / normalizeItemList', () => {
  it('clamps to a positive integer or null', () => {
    expect([normalizeQuantity(3), normalizeQuantity(2.9), normalizeQuantity(0), normalizeQuantity(-5)]).toEqual([3, 2, 1, 1]);
    expect([normalizeQuantity(null), normalizeQuantity(undefined), normalizeQuantity('3'), normalizeQuantity(Number.NaN), normalizeQuantity(Infinity)]).toEqual([null, null, null, null, null]);
  });
  it('cleans items and rejects malformed lists', () => {
    expect(normalizeItemList([' a\u200B ', { name: 'b', quantity: 2 }, '', { name: ' ' }, 7, null], 'x')).toEqual([
      { name: 'a', quantity: null },
      { name: 'b', quantity: 2 },
    ]);
    expect(normalizeItemList(undefined, 'x')).toEqual([]);
    expect(() => normalizeItemList('nope', 'Things')).toThrow(/Things must be an array/);
    expect(() => normalizeItemList(['x'.repeat(501)], 'x')).toThrow(/too long/);
  });
});

describe('buildExportBinEntry parentShortCode', () => {
  const row = (extra: Record<string, unknown>) => ({
    id: 'c1', name: 'Kid', area_id: null, area_name: '', items: [], notes: '', tags: [], icon: '', color: '',
    short_code: 'KID111', created_by: 'u', created_at: 'x', updated_at: 'y', ...extra,
  });
  it('is set only when the parent is in the export', () => {
    const map = buildParentShortCodeMap([{ id: 'p1', short_code: 'PAR111' }], [{ id: 'p2', short_code: 'PAR222' }]);
    expect(buildExportBinEntry(row({ parent_bin_id: 'p1' }), new Map(), new Map(), { parentShortCodes: map }).parentShortCode).toBe('PAR111');
    expect(buildExportBinEntry(row({ parent_bin_id: 'p2' }), new Map(), new Map(), { parentShortCodes: map }).parentShortCode).toBe('PAR222');
    expect(buildExportBinEntry(row({ parent_bin_id: 'hidden' }), new Map(), new Map(), { parentShortCodes: map }).parentShortCode).toBeUndefined();
    expect(buildExportBinEntry(row({ parent_bin_id: null }), new Map(), new Map(), { parentShortCodes: map }).parentShortCode).toBeUndefined();
  });
});

describe('fetchLooseItems', () => {
  it('queries live loose items through the shared item scope (no JOIN-bins filter) and groups them', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [
      { area_id: 'a1', name: 'Tape', quantity: 3 },
      { area_id: 'a1', name: 'Glue', quantity: null },
      { area_id: null, name: 'Rope', quantity: 0 },
    ] });
    const loose = await fetchLooseItems('loc-1', 'user-1');
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('bi.bin_id IS NULL');
    expect(sql).toContain('bi.deleted_at IS NULL');
    expect(mockQuery.mock.calls[0][1]).toEqual(['loc-1', 'user-1']);
    expect(loose.byArea.get('a1')).toEqual([{ name: 'Tape', quantity: 3 }, 'Glue']);
    expect(loose.unassigned).toEqual(['Rope']);
    const areas = buildAreaExportEntries(new Map([['a1', { path: 'Garage', createdBy: null }], ['a2', { path: 'Empty', createdBy: 'u' }]]), loose);
    expect(areas).toEqual([{ path: 'Garage', createdBy: undefined, items: [{ name: 'Tape', quantity: 3 }, 'Glue'] }, { path: 'Empty', createdBy: 'u' }]);
  });
});

describe('replaceCleanup', () => {
  it('deletes loose/unassigned items before bins and areas', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await replaceCleanup('loc-1');
    const sqls = mockQuery.mock.calls.map((c) => c[0] as string);
    const items = sqls.findIndex((q) => q.startsWith('DELETE FROM bin_items WHERE location_id'));
    const bins = sqls.findIndex((q) => q.startsWith('DELETE FROM bins'));
    const areas = sqls.findIndex((q) => q.startsWith('DELETE FROM areas'));
    expect(items).toBeGreaterThanOrEqual(0);
    expect(items).toBeLessThan(areas);
    expect(bins).toBeLessThan(areas);
  });
});
