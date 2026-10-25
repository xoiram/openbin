import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/lib/api';
import type { ExportData } from '@/types';
import {
  countCSVBins,
  ImportError,
  importData,
  MAX_IMPORT_SIZE,
  parseImportFile,
  validateExportData,
} from '../exportImport';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

function makeValidExportData(overrides?: Partial<ExportData>): ExportData {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    bins: [],
    ...overrides,
  };
}

function makeExportBin(overrides?: Record<string, unknown>) {
  return {
    id: 'bin-1',
    name: 'Test Bin',
    items: ['Some item'],
    notes: 'Some notes',
    tags: ['tag1'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('validateExportData', () => {
  it('returns true for valid complete data', () => {
    const data = makeValidExportData({
      bins: [makeExportBin()],
    });
    expect(validateExportData(data)).toBe(true);
  });

  it('returns false for v1 data', () => {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      bins: [{
        id: 'bin-1',
        name: 'Test',
        contents: 'stuff',
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }],
      photos: [],
    };
    expect(validateExportData(data)).toBe(false);
  });

  it('accepts a missing or null version (legacy file, same as the server)', () => {
    expect(validateExportData({ exportedAt: 'x', bins: [] })).toBe(true);
    expect(validateExportData({ version: null, exportedAt: 'x', bins: [] })).toBe(true);
  });

  it.each([2, 3, 4])('accepts version %s', (version) => {
    expect(validateExportData(makeValidExportData({ version }))).toBe(true);
  });

  it.each([0, 1, 5, 99, 4.5, -2, '4', true, [4]])('rejects version %j', (version) => {
    expect(validateExportData({ version, exportedAt: 'x', bins: [] })).toBe(false);
  });

  it('accepts a v4 file with parentShortCode, area items and unassignedItems', () => {
    const data = makeValidExportData({
      version: 4,
      bins: [makeExportBin({ shortCode: 'AAA111' }), makeExportBin({ id: 'b2', shortCode: 'BBB222', parentShortCode: 'AAA111' })],
      areas: [{ path: 'Garage', items: ['Hammer', { name: 'Nails', quantity: 50 }] }],
      unassignedItems: ['Tape'],
    });
    expect(validateExportData(data)).toBe(true);
  });

  it('returns false when bins array is missing', () => {
    const data = { version: 4, exportedAt: 'x' };
    expect(validateExportData(data)).toBe(false);
  });

  it('returns false for invalid bin (missing name)', () => {
    const data = makeValidExportData({
      bins: [makeExportBin({ name: undefined })] as ExportData['bins'],
    });
    expect(validateExportData(data)).toBe(false);
  });

  it('returns true for an empty bins array', () => {
    const data = makeValidExportData();
    expect(validateExportData(data)).toBe(true);
  });
});

describe('parseImportFile', () => {
  it('parses valid JSON file correctly', async () => {
    const data = makeValidExportData({ bins: [makeExportBin()] });
    const file = new File([JSON.stringify(data)], 'backup.json', {
      type: 'application/json',
    });
    const result = await parseImportFile(file);
    expect(result.version).toBe(2);
    expect(result.bins).toHaveLength(1);
    expect(result.bins[0].name).toBe('Test Bin');
  });

  it('throws VERSION_TOO_NEW for a file from a newer OpenBin', async () => {
    const file = new File([JSON.stringify(makeValidExportData({ version: 5 }))], 'new.json');
    await expect(parseImportFile(file)).rejects.toMatchObject({ code: 'VERSION_TOO_NEW' });
  });

  it.each([1, 0, 4.5, '4'])('throws VERSION_UNSUPPORTED for version %j', async (version) => {
    const file = new File([JSON.stringify({ version, exportedAt: 'x', bins: [] })], 'old.json');
    await expect(parseImportFile(file)).rejects.toMatchObject({ code: 'VERSION_UNSUPPORTED' });
  });

  it('parses a v4 file', async () => {
    const file = new File([JSON.stringify(makeValidExportData({ version: 4 }))], 'v4.json');
    expect((await parseImportFile(file)).version).toBe(4);
  });

  it('throws ImportError with INVALID_JSON for invalid JSON', async () => {
    const file = new File(['not json {{{'], 'bad.json', {
      type: 'application/json',
    });
    await expect(parseImportFile(file)).rejects.toThrow(ImportError);
    try {
      await parseImportFile(file);
    } catch (e) {
      expect((e as ImportError).code).toBe('INVALID_JSON');
    }
  });

  it('throws ImportError with INVALID_FORMAT for wrong schema', async () => {
    const file = new File([JSON.stringify({ foo: 'bar' })], 'wrong.json', {
      type: 'application/json',
    });
    await expect(parseImportFile(file)).rejects.toThrow(ImportError);
    try {
      await parseImportFile(file);
    } catch (e) {
      expect((e as ImportError).code).toBe('INVALID_FORMAT');
    }
  });

  it('throws ImportError with FILE_TOO_LARGE for oversized file', async () => {
    const content = 'x';
    const file = new File([content], 'big.json', { type: 'application/json' });
    Object.defineProperty(file, 'size', { value: MAX_IMPORT_SIZE + 1 });
    await expect(parseImportFile(file)).rejects.toThrow(ImportError);
    try {
      await parseImportFile(file);
    } catch (e) {
      expect((e as ImportError).code).toBe('FILE_TOO_LARGE');
    }
  });
});

describe('importData', () => {
  it('sends trashed bins, areas with items and unassignedItems', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ binsImported: 1, binsSkipped: 0, photosImported: 0, photosSkipped: 0 });
    const data = makeValidExportData({
      version: 4,
      bins: [makeExportBin({ shortCode: 'AAA111' })],
      trashedBins: [makeExportBin({ id: 't1' })],
      areas: [{ path: 'Garage', items: ['Hammer'] }],
      unassignedItems: [{ name: 'Tape', quantity: 2 }],
    });
    await importData('loc-1', data, 'replace');
    const [path, opts] = vi.mocked(apiFetch).mock.calls[0];
    expect(path).toBe('/api/locations/loc-1/import');
    expect((opts as { body: Record<string, unknown> }).body).toMatchObject({
      mode: 'replace',
      bins: data.bins,
      trashedBins: data.trashedBins,
      areas: [{ path: 'Garage', items: ['Hammer'] }],
      unassignedItems: [{ name: 'Tape', quantity: 2 }],
    });
  });

  it('still works for an old file without the new keys', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ binsImported: 0, binsSkipped: 0, photosImported: 0, photosSkipped: 0 });
    await importData('loc-1', makeValidExportData(), 'merge');
    const body = (vi.mocked(apiFetch).mock.calls[0][1] as { body: Record<string, unknown> }).body;
    expect(body.unassignedItems).toBeUndefined();
    expect(body.areas).toBeUndefined();
    expect(body.mode).toBe('merge');
  });
});

describe('countCSVBins', () => {
  const header = 'Bin Name,Area,Item,Quantity,Tags';

  it('does not count loose-item rows (empty Bin Name) as bins', () => {
    const csv = [
      header,
      'Toolbox,Garage,Hammer,1,tools',
      'Toolbox,Garage,Saw,,tools',
      ',Garage,Ladder,1,',
      ',,Tape,2,',
    ].join('\n');
    expect(countCSVBins(csv)).toEqual({ bins: 1, items: 2 });
  });

  it('skips rows with neither bin name nor item', () => {
    const csv = [header, 'Box,Shed,,,', ',Shed,,,', ',,,,'].join('\n');
    expect(countCSVBins(csv)).toEqual({ bins: 1, items: 0 });
  });

  it('counts an empty bin and distinct bins with the same name in different areas', () => {
    const csv = [header, 'Box,A,x,,', 'Box,B,y,,'].join('\n');
    expect(countCSVBins(csv)).toEqual({ bins: 2, items: 2 });
  });

  it('ignores empty-name rows in the one-bin-per-row format too', () => {
    const csv = ['Bin Name,Area,Items,Tags', 'Box,Shed,a;b,t', ',Shed,c,'].join('\n');
    expect(countCSVBins(csv)).toEqual({ bins: 1, items: 2 });
  });
});
