import type { Express } from 'express';
import { strToU8, zipSync } from 'fflate';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { query } from '../db.js';
import { createApp } from '../index.js';
import { createTestArea, createTestBin, createTestLocation, createTestUser } from './helpers.js';
import { addLoose } from './looseItemsHelpers.js';

let app: Express;

beforeEach(() => {
  app = createApp();
});

// ---------------------------------------------------------------------------
// JSON Export
// ---------------------------------------------------------------------------

describe('GET /api/locations/:id/export', () => {
  it('exports v4 JSON with bins, tags, and areas', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);
    const area = await createTestArea(app, token, location.id, 'Garage');
    await request(app)
      .post('/api/bins')
      .set('Authorization', `Bearer ${token}`)
      .send({ locationId: location.id, name: 'Toolbox', items: ['Hammer', 'Wrench'], tags: ['tools'], areaId: area.id });

    const res = await request(app)
      .get(`/api/locations/${location.id}/export`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.version).toBe(4);
    expect(res.body.bins).toHaveLength(1);
    expect(res.body.bins[0].name).toBe('Toolbox');
    expect(res.body.bins[0].items).toHaveLength(2);
    expect(res.body.bins[0].tags).toEqual(['tools']);
    expect(res.body.locationName).toBe(location.name);
    expect(res.body.areas).toBeDefined();
  });

  it('exports empty location', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);

    const res = await request(app)
      .get(`/api/locations/${location.id}/export`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.version).toBe(4);
    expect(res.body.bins).toHaveLength(0);
  });

  it('returns 403 for non-member', async () => {
    const { token: ownerToken } = await createTestUser(app);
    const location = await createTestLocation(app, ownerToken);
    const { token: otherToken } = await createTestUser(app);

    const res = await request(app)
      .get(`/api/locations/${location.id}/export`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent location', async () => {
    const { token } = await createTestUser(app);

    const res = await request(app)
      .get('/api/locations/nonexistent/export')
      .set('Authorization', `Bearer ${token}`);

    // requireLocationMember middleware returns 403 before 404 check
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// CSV Export
// ---------------------------------------------------------------------------

describe('GET /api/locations/:id/export/csv', () => {
  it('returns CSV with correct header and one row per item', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);
    await request(app)
      .post('/api/bins')
      .set('Authorization', `Bearer ${token}`)
      .send({ locationId: location.id, name: 'Cables', items: ['HDMI', 'USB-C'], tags: ['tech'] });

    const res = await request(app)
      .get(`/api/locations/${location.id}/export/csv`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const lines = res.text.split('\n');
    expect(lines[0]).toBe('Bin Name,Area,Item,Quantity,Tags');
    // Two items = two rows
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines[1]).toContain('Cables');
    expect(lines[1]).toContain('HDMI');
  });

  it('includes area paths in CSV', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);
    const area = await createTestArea(app, token, location.id, 'Shelf A');
    await request(app)
      .post('/api/bins')
      .set('Authorization', `Bearer ${token}`)
      .send({ locationId: location.id, name: 'Books', items: ['Novel'], areaId: area.id });

    const res = await request(app)
      .get(`/api/locations/${location.id}/export/csv`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const lines = res.text.split('\n');
    expect(lines[1]).toContain('Shelf A');
  });

  it('handles bins with no items', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);
    await request(app)
      .post('/api/bins')
      .set('Authorization', `Bearer ${token}`)
      .send({ locationId: location.id, name: 'EmptyBin', items: [] });

    const res = await request(app)
      .get(`/api/locations/${location.id}/export/csv`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const lines = res.text.split('\n').filter(Boolean);
    expect(lines).toHaveLength(2); // header + 1 empty row
    expect(lines[1]).toContain('EmptyBin');
  });
});

// ---------------------------------------------------------------------------
// JSON Import
// ---------------------------------------------------------------------------

describe('POST /api/locations/:id/import', () => {
  it('imports bins in merge mode', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);

    const res = await request(app)
      .post(`/api/locations/${location.id}/import`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        bins: [
          { id: 'abc123', name: 'Box A', items: ['Tape', 'Glue'], notes: '', tags: ['craft'], icon: '', color: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), photos: [] },
          { id: 'def456', name: 'Box B', items: ['Pen'], notes: '', tags: [], icon: '', color: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), photos: [] },
        ],
        mode: 'merge',
      });

    expect(res.status).toBe(200);
    expect(res.body.binsImported).toBe(2);
    expect(res.body.binsSkipped).toBe(0);
  });

  it('accepts imports larger than the global 1mb JSON limit', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);
    const now = new Date().toISOString();
    const bins = Array.from({ length: 300 }, (_, i) => ({
      id: `big-${i}`, name: `Bin ${i}`, items: [], notes: 'n'.repeat(5000), tags: [], icon: '', color: '',
      createdAt: now, updatedAt: now, photos: [],
    }));
    const body = { bins, mode: 'merge' };
    expect(JSON.stringify(body).length).toBeGreaterThan(1024 * 1024);

    const res = await request(app)
      .post(`/api/locations/${location.id}/import`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.binsImported).toBe(300);
  });

  it('skips existing bins in merge mode', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);
    const bin = await createTestBin(app, token, location.id, { name: 'Existing' });

    // Merge mode now checks by shortCode within location, not by id
    const res = await request(app)
      .post(`/api/locations/${location.id}/import`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        bins: [
          { id: 'ignored-uuid', shortCode: bin.short_code, name: 'Existing', items: [], notes: '', tags: [], icon: '', color: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), photos: [] },
        ],
        mode: 'merge',
      });

    expect(res.status).toBe(200);
    expect(res.body.binsImported).toBe(0);
    expect(res.body.binsSkipped).toBe(1);
  });

  it('replaces existing bins in replace mode', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);
    await createTestBin(app, token, location.id, { name: 'OldBin' });

    const res = await request(app)
      .post(`/api/locations/${location.id}/import`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        bins: [
          { id: 'new111', name: 'NewBin', items: [], notes: '', tags: [], icon: '', color: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), photos: [] },
        ],
        mode: 'replace',
      });

    expect(res.status).toBe(200);
    expect(res.body.binsImported).toBe(1);

    // Verify old bin is gone
    const listRes = await request(app)
      .get(`/api/bins?location_id=${location.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.body.results).toHaveLength(1);
    expect(listRes.body.results[0].name).toBe('NewBin');
  });

  it('returns dry-run preview without creating bins', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);

    const res = await request(app)
      .post(`/api/locations/${location.id}/import`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        bins: [
          { id: 'dry001', name: 'DryBin', items: ['item1'], notes: '', tags: [], icon: '', color: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), photos: [] },
        ],
        mode: 'merge',
        dryRun: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.preview).toBe(true);
    expect(res.body.toCreate).toHaveLength(1);
    expect(res.body.totalBins).toBe(1);

    // Verify no bins were actually created
    const listRes = await request(app)
      .get(`/api/bins?location_id=${location.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.body.results).toHaveLength(0);
  });

  it('returns 422 for missing bins array', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);

    const res = await request(app)
      .post(`/api/locations/${location.id}/import`)
      .set('Authorization', `Bearer ${token}`)
      .send({ mode: 'merge' });

    expect(res.status).toBe(422);
  });

  it('returns 422 for too many bins', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);

    const bins = Array.from({ length: 2001 }, (_, i) => ({
      id: `x${String(i).padStart(5, '0')}`,
      name: `Bin ${i}`,
      items: [],
      notes: '',
      tags: [],
      icon: '',
      color: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      photos: [],
    }));

    const res = await request(app)
      .post(`/api/locations/${location.id}/import`)
      .set('Authorization', `Bearer ${token}`)
      .send({ bins, mode: 'merge' });

    expect(res.status).toBe(422);
  });

  it('imports with areas creating hierarchy', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);

    const res = await request(app)
      .post(`/api/locations/${location.id}/import`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        bins: [
          { id: 'area01', name: 'Drill', items: ['Bit'], notes: '', tags: [], icon: '', color: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), photos: [] },
        ],
        areas: [
          { path: 'Garage' },
          { path: 'Garage / Shelf A' },
        ],
        mode: 'merge',
      });

    expect(res.status).toBe(200);
    expect(res.body.binsImported).toBe(1);

    // Verify areas were created
    const areasRes = await request(app)
      .get(`/api/locations/${location.id}/areas`)
      .set('Authorization', `Bearer ${token}`);
    const areaNames = areasRes.body.results.map((a: { name: string }) => a.name);
    expect(areaNames).toContain('Garage');
    expect(areaNames).toContain('Shelf A');

    // Verify hierarchy: Shelf A should have Garage as parent
    const shelfA = areasRes.body.results.find((a: { name: string }) => a.name === 'Shelf A');
    const garage = areasRes.body.results.find((a: { name: string }) => a.name === 'Garage');
    expect(shelfA.parent_id).toBe(garage.id);
  });

  it('imports with custom field definitions and maps values to bins', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);

    const res = await request(app)
      .post(`/api/locations/${location.id}/import`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        bins: [
          { id: 'cf0001', name: 'PaintCan', items: ['Brush'], notes: '', tags: [], icon: '', color: '', customFields: { Color: 'Red', Size: 'Large' }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), photos: [] },
        ],
        customFieldDefinitions: [
          { name: 'Color', position: 0 },
          { name: 'Size', position: 1 },
        ],
        mode: 'merge',
      });

    expect(res.status).toBe(200);
    expect(res.body.binsImported).toBe(1);

    // Verify custom field definitions were created
    const cfRes = await request(app)
      .get(`/api/locations/${location.id}/custom-fields`)
      .set('Authorization', `Bearer ${token}`);
    const fieldNames = cfRes.body.results.map((f: { name: string }) => f.name);
    expect(fieldNames).toContain('Color');
    expect(fieldNames).toContain('Size');

    // Verify bin has custom field values mapped by ID
    const binsRes = await request(app)
      .get(`/api/bins?location_id=${location.id}`)
      .set('Authorization', `Bearer ${token}`);
    const bin = binsRes.body.results.find((b: { name: string }) => b.name === 'PaintCan');
    const colorField = cfRes.body.results.find((f: { name: string }) => f.name === 'Color');
    const sizeField = cfRes.body.results.find((f: { name: string }) => f.name === 'Size');
    expect(bin.custom_fields[colorField.id]).toBe('Red');
    expect(bin.custom_fields[sizeField.id]).toBe('Large');
  });

  it('dry-run preview includes area count', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);

    const res = await request(app)
      .post(`/api/locations/${location.id}/import`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        bins: [
          { id: 'dry002', name: 'DryBin2', items: [], notes: '', tags: [], icon: '', color: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), photos: [] },
        ],
        areas: [
          { path: 'Workshop' },
          { path: 'Workshop / Bench' },
          { path: 'Attic' },
        ],
        mode: 'merge',
        dryRun: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.preview).toBe(true);
    expect(res.body.totalBins).toBe(1);

    // Verify no areas were actually created (dry-run should not mutate)
    const areasRes = await request(app)
      .get(`/api/locations/${location.id}/areas`)
      .set('Authorization', `Bearer ${token}`);
    expect(areasRes.body.results).toHaveLength(0);
  });

  it('imports tag colors alongside bins', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);

    const res = await request(app)
      .post(`/api/locations/${location.id}/import`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        bins: [
          { id: 'tag001', name: 'Tagged', items: [], notes: '', tags: ['urgent'], icon: '', color: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), photos: [] },
        ],
        mode: 'merge',
        tagColors: [{ tag: 'urgent', color: '#ff0000' }],
      });

    expect(res.status).toBe(200);
    expect(res.body.binsImported).toBe(1);

    // Verify tag color was imported
    const tcRes = await request(app)
      .get(`/api/tag-colors?location_id=${location.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(tcRes.body.results.some((tc: { tag: string }) => tc.tag === 'urgent')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CSV Import
// ---------------------------------------------------------------------------

describe('POST /api/locations/:id/import/csv', () => {
  it('imports round-trip CSV format', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);

    const csv = 'Bin Name,Area,Item,Quantity,Tags\nToolkit,,Hammer,2,tools\nToolkit,,Saw,,tools\n';

    const res = await request(app)
      .post(`/api/locations/${location.id}/import/csv`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(csv), 'import.csv');

    expect(res.status).toBe(200);
    expect(res.body.binsImported).toBe(1);
    expect(res.body.itemsImported).toBe(2);
  });

  it('imports one-bin-per-row CSV format', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);

    const csv = 'Bin Name,Area,Items,Tags\nBox A,,Tape;Glue,craft\nBox B,,Pen x 3,office\n';

    const res = await request(app)
      .post(`/api/locations/${location.id}/import/csv`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(csv), 'import.csv');

    expect(res.status).toBe(200);
    expect(res.body.binsImported).toBe(2);
  });

  it('returns dry-run preview for CSV', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);

    const csv = 'Bin Name,Area,Item,Quantity,Tags\nBox,,Item1,,\n';

    const res = await request(app)
      .post(`/api/locations/${location.id}/import/csv`)
      .set('Authorization', `Bearer ${token}`)
      .field('dryRun', 'true')
      .attach('file', Buffer.from(csv), 'import.csv');

    expect(res.status).toBe(200);
    expect(res.body.preview).toBe(true);
    expect(res.body.toCreate).toHaveLength(1);
  });

  it('returns 422 for invalid CSV headers', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);

    const csv = 'Name,Description\nBox,Something\n';

    const res = await request(app)
      .post(`/api/locations/${location.id}/import/csv`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(csv), 'import.csv');

    expect(res.status).toBe(422);
  });

  it('returns 422 when no file uploaded', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);

    const res = await request(app)
      .post(`/api/locations/${location.id}/import/csv`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// ZIP Import
// ---------------------------------------------------------------------------

function buildTestZip(bins: unknown[], manifest?: Record<string, unknown>): Buffer {
  return Buffer.from(zipSync({
    'manifest.json': strToU8(JSON.stringify({
      format: 'openbin-zip',
      version: 4,
      exportedAt: new Date().toISOString(),
      locationName: 'Test',
      binCount: bins.length,
      ...manifest,
    })),
    'bins.json': strToU8(JSON.stringify(bins)),
  }));
}

describe('POST /api/locations/:id/import/zip', () => {
  it('imports bins from ZIP', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);

    const zipBuf = await buildTestZip([
      { name: 'ZipBin1', items: ['Widget'], tags: ['import'], notes: '', icon: '', color: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { name: 'ZipBin2', items: [], tags: [], notes: '', icon: '', color: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ]);

    const res = await request(app)
      .post(`/api/locations/${location.id}/import/zip`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', zipBuf, 'export.zip');

    expect(res.status).toBe(200);
    expect(res.body.binsImported).toBe(2);
  });

  it('returns 422 for ZIP without manifest', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);

    const buf = Buffer.from(zipSync({ 'bins.json': strToU8('[]') }));

    const res = await request(app)
      .post(`/api/locations/${location.id}/import/zip`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buf, 'export.zip');

    expect(res.status).toBe(422);
  });

  it('returns 422 for invalid manifest format', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);

    const buf = Buffer.from(zipSync({
      'manifest.json': strToU8(JSON.stringify({ format: 'wrong' })),
      'bins.json': strToU8('[]'),
    }));

    const res = await request(app)
      .post(`/api/locations/${location.id}/import/zip`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buf, 'export.zip');

    expect(res.status).toBe(422);
  });

  it('returns dry-run preview for ZIP', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);

    const zipBuf = await buildTestZip([{ id: 'z00001', name: 'DryZip', items: ['x'] }]);

    const res = await request(app)
      .post(`/api/locations/${location.id}/import/zip`)
      .set('Authorization', `Bearer ${token}`)
      .field('dryRun', 'true')
      .attach('file', zipBuf, 'export.zip');

    expect(res.status).toBe(200);
    expect(res.body.preview).toBe(true);
    expect(res.body.toCreate).toHaveLength(1);
  });

  it('replace mode clears existing bins', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);
    await createTestBin(app, token, location.id, { name: 'OldBin' });

    const zipBuf = await buildTestZip([
      { name: 'NewZipBin', items: [], tags: [], notes: '', icon: '', color: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ]);

    const res = await request(app)
      .post(`/api/locations/${location.id}/import/zip`)
      .set('Authorization', `Bearer ${token}`)
      .field('mode', 'replace')
      .attach('file', zipBuf, 'export.zip');

    expect(res.status).toBe(200);
    expect(res.body.binsImported).toBe(1);

    const listRes = await request(app)
      .get(`/api/bins?location_id=${location.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.body.results).toHaveLength(1);
    expect(listRes.body.results[0].name).toBe('NewZipBin');
  });
});

// ---------------------------------------------------------------------------
// Format version
// ---------------------------------------------------------------------------

describe('export format version', () => {
  const now = new Date().toISOString();
  const oneBin = { id: 'v00001', name: 'VersionBin', items: ['x'], notes: '', tags: [], icon: '', color: '', createdAt: now, updatedAt: now, photos: [] };

  async function jsonImport(version: unknown) {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);
    return request(app)
      .post(`/api/locations/${location.id}/import`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...(version === undefined ? {} : { version }), bins: [oneBin], mode: 'merge' });
  }

  it.each([2, 3, 4])('JSON import accepts version %i', async (version) => {
    const res = await jsonImport(version);
    expect(res.status).toBe(200);
    expect(res.body.binsImported).toBe(1);
  });

  it('JSON import accepts a file without a version (legacy)', async () => {
    expect((await jsonImport(undefined)).status).toBe(200);
  });

  it.each([5, 99, 1, 0, 4.5, '4', true])('JSON import rejects version %j with 422', async (version) => {
    const res = await jsonImport(version);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.message).toMatch(/version/i);
  });

  it('JSON dry run also rejects an unsupported version', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);
    const res = await request(app)
      .post(`/api/locations/${location.id}/import`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 5, bins: [oneBin], dryRun: true });
    expect(res.status).toBe(422);
  });

  async function zipImport(version: unknown, dryRun = false) {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);
    const zip = buildTestZip([{ name: 'ZipVer', items: [] }], version === undefined ? { version: undefined } : { version });
    const req = request(app).post(`/api/locations/${location.id}/import/zip`).set('Authorization', `Bearer ${token}`);
    if (dryRun) req.field('dryRun', 'true');
    return req.attach('file', zip, 'export.zip');
  }

  it.each([2, 3, 4])('ZIP import accepts manifest version %i', async (version) => {
    expect((await zipImport(version)).status).toBe(200);
  });

  it('ZIP import accepts a manifest without a version', async () => {
    expect((await zipImport(undefined)).status).toBe(200);
  });

  it.each([5, 1, 4.5, 'x'])('ZIP import rejects manifest version %j with 422', async (version) => {
    expect((await zipImport(version)).status).toBe(422);
    expect((await zipImport(version, true)).status).toBe(422);
  });

  it('an old v2 file with only active bins and areas still imports (no loose items, no children)', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);
    const res = await request(app)
      .post(`/api/locations/${location.id}/import`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        version: 2,
        bins: [{ ...oneBin, location: 'Garage / Shelf' }],
        areas: [{ path: 'Garage / Shelf' }, { path: 'Attic' }],
        mode: 'merge',
      });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ binsImported: 1, areasImported: 2, looseItemsImported: 0, looseItemsSkipped: 0, binsSkippedUnresolvedParent: 0 });
  });
});

// ---------------------------------------------------------------------------
// Loose items in the export formats
// ---------------------------------------------------------------------------

describe('loose items in exports', () => {
  it('JSON export carries area items and unassignedItems; ZIP manifest the same', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);
    const garage = await createTestArea(app, token, location.id, 'Garage');
    const empty = await createTestArea(app, token, location.id, 'Empty');
    await addLoose(app, token, location.id, { name: 'Tape', quantity: 3, areaId: garage.id });
    await addLoose(app, token, location.id, { name: 'Glue', areaId: garage.id });
    await addLoose(app, token, location.id, { name: 'Batteries' });

    const res = await request(app).get(`/api/locations/${location.id}/export`).set('Authorization', `Bearer ${token}`);
    const byPath = Object.fromEntries(res.body.areas.map((a: { path: string; items?: unknown[] }) => [a.path, a.items]));
    expect(byPath.Garage).toEqual([{ name: 'Tape', quantity: 3 }, 'Glue']);
    expect(byPath.Empty).toBeUndefined();
    expect(res.body.areas.map((a: { path: string }) => a.path).sort()).toEqual(['Empty', 'Garage']);
    expect(res.body.unassignedItems).toEqual(['Batteries']);
    expect(empty.id).toBeTruthy();

    const zipRes = await request(app)
      .get(`/api/locations/${location.id}/export/zip`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    const files = (await import('fflate')).unzipSync(zipRes.body as Buffer);
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
    expect(manifest.version).toBe(4);
    expect(manifest.unassignedItems).toEqual(['Batteries']);
    expect(manifest.areas.find((a: { path: string }) => a.path === 'Garage').items).toEqual([{ name: 'Tape', quantity: 3 }, 'Glue']);
  });

  it('does not export loose items that were deleted', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);
    const item = await addLoose(app, token, location.id, { name: 'Gone' });
    await request(app).delete(`/api/locations/${location.id}/items/${item.id}`).set('Authorization', `Bearer ${token}`);
    const res = await request(app).get(`/api/locations/${location.id}/export`).set('Authorization', `Bearer ${token}`);
    expect(res.body.unassignedItems).toBeUndefined();
  });

  it('JSON import validates loose items', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);
    const post = (body: object) => request(app).post(`/api/locations/${location.id}/import`).set('Authorization', `Bearer ${token}`).send({ bins: [], ...body });
    expect((await post({ unassignedItems: 'nope' })).status).toBe(422);
    expect((await post({ unassignedItems: ['x'.repeat(501)] })).status).toBe(422);
    expect((await post({ areas: [{ path: 'A', items: { not: 'an array' } }] })).status).toBe(422);
    const ok = await post({ unassignedItems: ['', '  ', { name: 'Real', quantity: -4 }, { nope: 1 }] });
    expect(ok.status).toBe(200);
    expect(ok.body.looseItemsImported).toBe(1);
  });

  it('JSON dry run lists trashed bins and loose items', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);
    const now = new Date().toISOString();
    const bin = (name: string, extra = {}) => ({ id: name, name, shortCode: name.toUpperCase().slice(0, 6).padEnd(6, 'X'), items: ['a', 'b'], notes: '', tags: [], icon: '', color: '', createdAt: now, updatedAt: now, photos: [], ...extra });
    const res = await request(app)
      .post(`/api/locations/${location.id}/import`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        bins: [bin('Live')],
        trashedBins: [bin('Trashed', { deletedAt: now })],
        areas: [{ path: 'Garage', items: ['Tape', 'Glue'] }],
        unassignedItems: ['Rope'],
        dryRun: true,
      });
    expect(res.status).toBe(200);
    expect(res.body.totalBins).toBe(1);
    expect(res.body.totalTrashedBins).toBe(1);
    expect(res.body.totalItems).toBe(4);
    expect(res.body.toCreate.map((c: { name: string; trashed: boolean }) => [c.name, c.trashed])).toEqual([['Live', false], ['Trashed', true]]);
    expect(res.body).toMatchObject({ looseItemsTotal: 3, looseItemsToCreate: 3, looseItemsToSkip: 0, binsSkippedUnresolvedParent: 0, totalChildBins: 0 });
  });
});

// ---------------------------------------------------------------------------
// CSV with loose items
// ---------------------------------------------------------------------------

describe('CSV import with loose items', () => {
  const HEADER = 'Bin Name,Area,Item,Quantity,Tags\n';
  async function csvImport(token: string, locationId: string, csv: string, fields: Record<string, string> = {}) {
    const req = request(app).post(`/api/locations/${locationId}/import/csv`).set('Authorization', `Bearer ${token}`);
    for (const [k, v] of Object.entries(fields)) req.field(k, v);
    return req.attach('file', Buffer.from(csv), 'import.csv');
  }

  it('rows with an empty Bin Name become loose (Area set) or unassigned (Area empty) items', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);
    const csv = `${HEADER}Box,,Hammer,,\n,Garage / Shelf,Tape,3,\n,,Rope,0,\n,,,,\n`;
    const res = await csvImport(token, location.id, csv);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ binsImported: 1, itemsImported: 1, looseItemsImported: 2, looseItemsSkipped: 0 });
    const rows = await query<{ name: string; quantity: number | null; area: string | null; bin_id: string | null }>(
      `SELECT bi.name, bi.quantity, a.name AS area, bi.bin_id FROM bin_items bi LEFT JOIN areas a ON a.id = bi.area_id
       WHERE bi.location_id = $1 AND bi.bin_id IS NULL ORDER BY bi.name`,
      [location.id],
    );
    expect(rows.rows).toEqual([
      { name: 'Rope', quantity: 1, area: null, bin_id: null },
      { name: 'Tape', quantity: 3, area: 'Shelf', bin_id: null },
    ]);
  });

  it('a loose row ends the current bin group', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);
    const csv = `${HEADER}Box,,A,,\n,,Loose,,\nBox,,B,,\n`;
    // replace mode: merge would skip the second "Box" (same name and area)
    const res = await csvImport(token, location.id, csv, { mode: 'replace' });
    expect(res.body.binsImported).toBe(2);
    expect(res.body.looseItemsImported).toBe(1);
  });

  it('merge skips loose items that already exist; dry run agrees; replace clears old loose items', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);
    const garage = await createTestArea(app, token, location.id, 'Garage');
    await addLoose(app, token, location.id, { name: 'Tape', areaId: garage.id });
    await addLoose(app, token, location.id, { name: 'Rope' });
    const csv = `${HEADER},Garage,Tape,,\n,Garage,Saw,,\n,,Rope,,\n,,Twine,,\n`;

    const dry = await csvImport(token, location.id, csv, { dryRun: 'true' });
    expect(dry.body).toMatchObject({ looseItemsTotal: 4, looseItemsToCreate: 2, looseItemsToSkip: 2 });
    const merged = await csvImport(token, location.id, csv);
    expect(merged.body).toMatchObject({ looseItemsImported: 2, looseItemsSkipped: 2 });
    const again = await csvImport(token, location.id, csv);
    expect(again.body).toMatchObject({ looseItemsImported: 0, looseItemsSkipped: 4 });

    const replaced = await csvImport(token, location.id, `${HEADER},,Only,,\n`, { mode: 'replace' });
    expect(replaced.status).toBe(200);
    const left = await query<{ name: string }>('SELECT name FROM bin_items WHERE location_id = $1', [location.id]);
    expect(left.rows.map((r) => r.name)).toEqual(['Only']);
  });

  it('validates bin names and fields (422) in import and dry run', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);
    const tooLong = `${HEADER}${'n'.repeat(256)},,Item,,\n`;
    expect((await csvImport(token, location.id, tooLong)).status).toBe(422);
    expect((await csvImport(token, location.id, tooLong, { dryRun: 'true' })).status).toBe(422);
    const longItem = `${HEADER}Box,,${'i'.repeat(501)},,\n`;
    expect((await csvImport(token, location.id, longItem)).status).toBe(422);
    const count = await query('SELECT id FROM bins WHERE location_id = $1', [location.id]);
    expect(count.rows).toHaveLength(0);
  });
});
