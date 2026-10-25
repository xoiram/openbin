import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createTestBin,
  createTestLocation,
  createTestUser,
  expectNoHierarchyViolations,
  setParentBinByDb,
} from '../../__tests__/helpers.js';
import { query } from '../../db.js';
import { createApp } from '../../index.js';
import { assertTopLevelIds } from '../binHierarchy.js';
import { ValidationError } from '../httpErrors.js';

let app: Express;
beforeEach(() => {
  app = createApp();
});

async function setup() {
  const { token } = await createTestUser(app);
  const loc = await createTestLocation(app, token);
  const parent = await createTestBin(app, token, loc.id, { name: 'Parent' });
  const child = await createTestBin(app, token, loc.id, { name: 'Child' });
  await setParentBinByDb(child.id, parent.id);
  const other = await createTestBin(app, token, loc.id, { name: 'Other' });
  return { token, loc, parent, child, other };
}

describe('assertTopLevelIds', () => {
  it('passes for live top-level bins of the location (including parents)', async () => {
    const { loc, parent, other } = await setup();
    await expect(assertTopLevelIds(query, loc.id, [parent.id, other.id, other.id])).resolves.toBeUndefined();
    await expectNoHierarchyViolations(loc.id);
  });

  it('rejects a child bin', async () => {
    const { loc, parent, child } = await setup();
    await expect(assertTopLevelIds(query, loc.id, [parent.id, child.id])).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a trashed bin', async () => {
    const { token, loc, other } = await setup();
    await request(app).delete(`/api/bins/${other.id}`).set('Authorization', `Bearer ${token}`).expect(200);
    await expect(assertTopLevelIds(query, loc.id, [other.id])).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a bin from another location and an unknown id', async () => {
    const { token, loc, other } = await setup();
    const loc2 = await createTestLocation(app, token, 'Second');
    await expect(assertTopLevelIds(query, loc2.id, [other.id])).rejects.toBeInstanceOf(ValidationError);
    await expect(assertTopLevelIds(query, loc.id, ['nope'])).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects missing or non-string ids', async () => {
    const { loc, other } = await setup();
    await expect(assertTopLevelIds(query, loc.id, [other.id, undefined])).rejects.toBeInstanceOf(ValidationError);
    await expect(assertTopLevelIds(query, loc.id, [42])).rejects.toBeInstanceOf(ValidationError);
  });
});
