import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoHierarchyViolations } from '../../__tests__/helpers.js';
import { query } from '../../db.js';
import { seedDemoData } from '../demoSeed.js';

// The seed only runs in demo mode; flip it on for this file.
vi.mock('../config.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../config.js')>();
  return {
    ...original,
    config: { ...original.config, demoMode: true },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('seedDemoData', () => {
  it('seeds nested boxes that pass the hierarchy rules', async () => {
    await seedDemoData();
    await expectNoHierarchyViolations();

    const parent = await query<{ id: string; area_id: string | null; visibility: string; location_id: string }>(
      "SELECT id, area_id, visibility, location_id FROM bins WHERE name = 'Tool Chest' AND deleted_at IS NULL",
    );
    expect(parent.rows).toHaveLength(1);

    const children = await query<{ name: string; area_id: string | null; visibility: string; location_id: string }>(
      'SELECT name, area_id, visibility, location_id FROM bins WHERE parent_bin_id = $1 ORDER BY name',
      [parent.rows[0].id],
    );
    expect(children.rows.map((c) => c.name)).toEqual(['Drill Bits', 'Socket Set']);
    for (const child of children.rows) {
      expect(child.area_id).toBe(parent.rows[0].area_id);
      expect(child.visibility).toBe(parent.rows[0].visibility);
      expect(child.location_id).toBe(parent.rows[0].location_id);
    }

    // loose and unassigned items are not seeded until the UI for them exists
    const loose = await query('SELECT id FROM bin_items WHERE bin_id IS NULL');
    expect(loose.rows).toHaveLength(0);

    const missingLocation = await query('SELECT id FROM bin_items WHERE location_id IS NULL');
    expect(missingLocation.rows).toHaveLength(0);
  });
});
