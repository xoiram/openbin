import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestBin, createTestLocation, createTestUser, expectNoHierarchyViolations, setParentBinByDb } from '../../__tests__/helpers.js';
import { createApp } from '../../index.js';
import { createPathBuilder, loadPathBuilder } from '../binPath.js';

describe('createPathBuilder', () => {
  const rows = [
    { id: 'a', name: 'Garage', parent_id: null },
    { id: 'b', name: 'Shelf A', parent_id: 'a' },
    { id: 'c', name: 'Top', parent_id: 'b' },
  ];

  it('builds nested area paths with the " › " separator', () => {
    const p = createPathBuilder(rows);
    expect(p.areaPath('a')).toBe('Garage');
    expect(p.areaPath('c')).toBe('Garage › Shelf A › Top');
  });

  it("returns '' for no or unknown area", () => {
    const p = createPathBuilder(rows);
    expect(p.areaPath(null)).toBe('');
    expect(p.areaPath(undefined)).toBe('');
    expect(p.areaPath('missing')).toBe('');
  });

  it('guards against parent cycles instead of looping', () => {
    const p = createPathBuilder([
      { id: 'x', name: 'X', parent_id: 'y' },
      { id: 'y', name: 'Y', parent_id: 'x' },
    ]);
    expect(p.areaPath('x')).toBe('Y › X');
    expect(p.areaPath('y')).toBe('X › Y');
    const self = createPathBuilder([{ id: 's', name: 'S', parent_id: 's' }]);
    expect(self.areaPath('s')).toBe('S');
  });

  it('builds bin paths: area, parent box, name', () => {
    const p = createPathBuilder(rows);
    expect(p.binPath({ area_id: 'b', name: 'Parts', parent_bin_name: 'Toolbox' })).toBe('Garage › Shelf A › Toolbox › Parts');
    expect(p.binPath({ area_id: 'a', name: 'Toolbox' })).toBe('Garage › Toolbox');
    expect(p.binPath({ area_id: null, name: 'Loose Box' })).toBe('Loose Box');
    expect(p.binPath({ area_id: null, name: 'Parts', parent_bin_name: 'Toolbox' })).toBe('Toolbox › Parts');
  });
});

describe('loadPathBuilder', () => {
  let app: Express;
  beforeEach(() => { app = createApp(); });

  it('reads the location areas from the database (including nested ones)', async () => {
    const { token } = await createTestUser(app);
    const loc = await createTestLocation(app, token);
    const auth = { Authorization: `Bearer ${token}` };
    const root = (await request(app).post(`/api/locations/${loc.id}/areas`).set(auth).send({ name: 'Garage' })).body;
    const child = (await request(app).post(`/api/locations/${loc.id}/areas`).set(auth).send({ name: 'Shelf', parent_id: root.id })).body;
    const parent = await createTestBin(app, token, loc.id, { name: 'Toolbox' });
    const kid = await createTestBin(app, token, loc.id, { name: 'Parts' });
    await request(app).put(`/api/bins/${parent.id}`).set(auth).send({ areaId: child.id });
    await setParentBinByDb(kid.id, parent.id);

    const paths = await loadPathBuilder(loc.id);
    expect(paths.areaPath(child.id)).toBe('Garage › Shelf');
    expect(paths.binPath({ area_id: child.id, name: 'Parts', parent_bin_name: 'Toolbox' })).toBe('Garage › Shelf › Toolbox › Parts');
    await expectNoHierarchyViolations(loc.id);
  });
});
