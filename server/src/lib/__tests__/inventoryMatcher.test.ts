import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestArea, createTestBin, createTestLocation, createTestUser, expectNoHierarchyViolations, joinTestLocation, setParentBinByDb } from '../../__tests__/helpers.js';
import { addLoose } from '../../__tests__/looseItemsHelpers.js';
import { query } from '../../db.js';
import { createApp } from '../../index.js';
import {
  findCheckedOutLooseItems,
  findCheckedOutMatches,
  findLiteralMatches,
  findLooseItemMatches,
  findNearMissBins,
  findPinnedMatches,
  findPrivateMatches,
  findTrashedMatches,
} from '../inventoryMatcher.js';

let app: Express;
beforeEach(() => { app = createApp(); });

async function setup() {
  const { token, user } = await createTestUser(app);
  const loc = await createTestLocation(app, token);
  return { token, userId: user.id, locationId: loc.id, inviteCode: loc.invite_code };
}

describe('findLiteralMatches — bin name', () => {
  it('matches bin name substring (literal)', async () => {
    const s = await setup();
    await createTestBin(app, s.token, s.locationId, { name: 'Battery Bin' });
    await createTestBin(app, s.token, s.locationId, { name: 'Tool Box' });

    const got = await findLiteralMatches(s.locationId, s.userId, ['battery']);
    expect(got.map((b) => b.name)).toEqual(['Battery Bin']);
    expect(got[0].match_hint).toMatch(/name/i);
  });

  it('matches plural-stemmed terms', async () => {
    const s = await setup();
    await createTestBin(app, s.token, s.locationId, { name: 'Battery Bin' });

    const got = await findLiteralMatches(s.locationId, s.userId, ['batteries']);
    expect(got.map((b) => b.name)).toEqual(['Battery Bin']);
  });

  it('does NOT match unrelated bins via associative reasoning', async () => {
    const s = await setup();
    await createTestBin(app, s.token, s.locationId, { name: 'Flashlight Bin', items: ['Maglite'] });
    await createTestBin(app, s.token, s.locationId, { name: 'Battery Bin' });

    const got = await findLiteralMatches(s.locationId, s.userId, ['battery']);
    expect(got.map((b) => b.name)).toEqual(['Battery Bin']);
  });
});

describe('findLiteralMatches — items', () => {
  it('matches item name substring', async () => {
    const s = await setup();
    await createTestBin(app, s.token, s.locationId, { name: 'Misc', items: ['AA Battery', 'Tape'] });

    const got = await findLiteralMatches(s.locationId, s.userId, ['battery']);
    expect(got.map((b) => b.name)).toEqual(['Misc']);
    expect(got[0].items.find((i) => i.name === 'AA Battery')).toBeDefined();
  });
});

describe('findLiteralMatches — tags', () => {
  it('matches exact tag name', async () => {
    const s = await setup();
    await createTestBin(app, s.token, s.locationId, { name: 'Power Tools', tags: ['tools'] });
    await createTestBin(app, s.token, s.locationId, { name: 'Hand Tools', tags: ['tools'] });
    await createTestBin(app, s.token, s.locationId, { name: 'Kitchen', tags: ['cookware'] });

    const got = await findLiteralMatches(s.locationId, s.userId, ['tools']);
    expect(got.map((b) => b.name).sort()).toEqual(['Hand Tools', 'Power Tools']);
  });

  it('matches tag via plural stem', async () => {
    const s = await setup();
    await createTestBin(app, s.token, s.locationId, { name: 'Wrenches', tags: ['tools'] });

    const got = await findLiteralMatches(s.locationId, s.userId, ['tool']);
    expect(got.map((b) => b.name)).toEqual(['Wrenches']);
  });
});

describe('findLiteralMatches — visibility', () => {
  it("omits another user's private bin", async () => {
    const owner = await createTestUser(app);
    const loc = await createTestLocation(app, owner.token);
    const peer = await createTestUser(app);
    await joinTestLocation(app, peer.token, loc.invite_code);
    await createTestBin(app, owner.token, loc.id, { name: 'Owners Stash', visibility: 'private', items: ['Battery'] });
    await createTestBin(app, owner.token, loc.id, { name: 'Shared Battery', visibility: 'location' });

    const got = await findLiteralMatches(loc.id, peer.user.id, ['battery']);
    expect(got.map((b) => b.name)).toEqual(['Shared Battery']);
  });
});

describe('findPinnedMatches', () => {
  it("returns only the user's pinned bins", async () => {
    const s = await setup();
    const a = await createTestBin(app, s.token, s.locationId, { name: 'A' });
    await createTestBin(app, s.token, s.locationId, { name: 'B' });
    await request(app).post(`/api/bins/${a.id}/pin`).set('Authorization', `Bearer ${s.token}`).send({});

    const got = await findPinnedMatches(s.locationId, s.userId);
    expect(got.map((b) => b.name)).toEqual(['A']);
    expect(got[0].is_pinned).toBe(true);
  });
});

describe('findPrivateMatches', () => {
  it("returns the user's private bins, never another user's", async () => {
    const owner = await createTestUser(app);
    const loc = await createTestLocation(app, owner.token);
    const peer = await createTestUser(app);
    await joinTestLocation(app, peer.token, loc.invite_code);
    await createTestBin(app, owner.token, loc.id, { name: 'Owners Private', visibility: 'private' });
    await createTestBin(app, peer.token, loc.id, { name: 'Peer Private', visibility: 'private' });

    const got = await findPrivateMatches(loc.id, peer.user.id);
    expect(got.map((b) => b.name)).toEqual(['Peer Private']);
  });
});

describe('findCheckedOutMatches', () => {
  it('returns bins that contain at least one currently-checked-out item', async () => {
    const s = await setup();
    const bin = await createTestBin(app, s.token, s.locationId, { name: 'Workshop', items: ['Drill'] });
    const detail = await request(app).get(`/api/bins/${bin.id}`).set('Authorization', `Bearer ${s.token}`);
    const drillId = detail.body.items[0].id;
    await request(app).post(`/api/bins/${bin.id}/items/${drillId}/checkout`).set('Authorization', `Bearer ${s.token}`).send({});

    const got = await findCheckedOutMatches(s.locationId, s.userId);
    expect(got.map((b) => b.name)).toEqual(['Workshop']);
  });
});

describe('findTrashedMatches', () => {
  it('returns soft-deleted bins', async () => {
    const s = await setup();
    const bin = await createTestBin(app, s.token, s.locationId, { name: 'Old Bin' });
    await request(app).delete(`/api/bins/${bin.id}`).set('Authorization', `Bearer ${s.token}`);

    const got = await findTrashedMatches(s.locationId, s.userId);
    expect(got.map((b) => b.name)).toEqual(['Old Bin']);
    expect(got[0].is_trashed).toBe(true);
  });
});

describe('findLiteralMatches — punctuation normalization', () => {
  it("matches bin with apostrophe in name via query without apostrophe", async () => {
    const s = await setup();
    await createTestBin(app, s.token, s.locationId, { name: "Tom's Tools" });

    const got = await findLiteralMatches(s.locationId, s.userId, ["Tom's tools"]);
    expect(got.map((b) => b.name)).toContain("Tom's Tools");
  });

  it('matches bin with hyphen in name via query without hyphen', async () => {
    const s = await setup();
    await createTestBin(app, s.token, s.locationId, { name: 'AA-Batteries' });

    const got = await findLiteralMatches(s.locationId, s.userId, ['AA batteries']);
    expect(got.map((b) => b.name)).toContain('AA-Batteries');
  });

  it('matches bin with hash in name via query term without hash', async () => {
    const s = await setup();
    await createTestBin(app, s.token, s.locationId, { name: 'Phillips #2 Screwdriver' });

    const got = await findLiteralMatches(s.locationId, s.userId, ['phillips', 'screwdriver']);
    expect(got.map((b) => b.name)).toContain('Phillips #2 Screwdriver');
  });
});

describe('findLiteralMatches — fields SQL filter', () => {
  it('restricts to tag-only matches in SQL (not post-filtered after LIMIT)', async () => {
    const s = await setup();
    for (let i = 0; i < 35; i++) {
      await createTestBin(app, s.token, s.locationId, { name: `Tools Bin ${i}` });
    }
    await createTestBin(app, s.token, s.locationId, { name: 'Other', tags: ['tools'] });
    await createTestBin(app, s.token, s.locationId, { name: 'Another', tags: ['tools'] });
    await createTestBin(app, s.token, s.locationId, { name: 'Third', tags: ['tools'] });

    const got = await findLiteralMatches(s.locationId, s.userId, ['tools'], { fields: ['tag'] });
    const names = got.map((b) => b.name);
    expect(names).toContain('Other');
    expect(names).toContain('Another');
    expect(names).toContain('Third');
    for (const name of names) {
      expect(name).not.toMatch(/^Tools Bin \d+$/);
    }
  });
});

describe('findNearMissBins', () => {
  it('returns bins whose name fuzzy-matches when no literal hit exists', async () => {
    const s = await setup();
    await createTestBin(app, s.token, s.locationId, { name: 'Garden Tools' });
    await createTestBin(app, s.token, s.locationId, { name: 'Kitchen' });

    const got = await findNearMissBins(s.locationId, s.userId, 'gardn');
    expect(got.map((b) => b.name)).toContain('Garden Tools');
  });

  it('caps near-miss results to 3', async () => {
    const s = await setup();
    for (let i = 0; i < 5; i++) {
      await createTestBin(app, s.token, s.locationId, { name: `Tool Bin ${i}` });
    }
    const got = await findNearMissBins(s.locationId, s.userId, 'tool');
    expect(got.length).toBeLessThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// Nested boxes + loose items
// ---------------------------------------------------------------------------
describe('findLooseItemMatches', () => {
  async function loose() {
    const s = await setup();
    const area = await createTestArea(app, s.token, s.locationId, 'Garage');
    return { ...s, area };
  }

  it('finds a loose item in an area and an unassigned one by name', async () => {
    const s = await loose();
    await addLoose(app, s.token, s.locationId, { name: 'Step Ladder', areaId: s.area.id, quantity: 2 });
    await addLoose(app, s.token, s.locationId, { name: 'Ladder Bracket' });
    await addLoose(app, s.token, s.locationId, { name: 'Hammer', areaId: s.area.id });

    const got = await findLooseItemMatches(s.locationId, s.userId, ['ladder']);
    expect(got.map((g) => g.name).sort()).toEqual(['Ladder Bracket', 'Step Ladder']);
    const inArea = got.find((g) => g.name === 'Step Ladder')!;
    expect(inArea).toMatchObject({ area_id: s.area.id, area_name: 'Garage', quantity: 2 });
    const unassigned = got.find((g) => g.name === 'Ladder Bracket')!;
    expect(unassigned).toMatchObject({ area_id: null, area_name: '', quantity: null });
  });

  it('returns nothing when fields excludes item, and still works for fields=[item]', async () => {
    const s = await loose();
    await addLoose(app, s.token, s.locationId, { name: 'Step Ladder' });
    expect(await findLooseItemMatches(s.locationId, s.userId, ['ladder'], { fields: ['name'] })).toEqual([]);
    expect(await findLooseItemMatches(s.locationId, s.userId, ['ladder'], { fields: ['tag'] })).toEqual([]);
    expect(await findLooseItemMatches(s.locationId, s.userId, ['ladder'], { fields: ['item'] })).toHaveLength(1);
    expect(await findLooseItemMatches(s.locationId, s.userId, ['ladder'], { fields: [] })).toHaveLength(1);
  });

  it('does not probe area names', async () => {
    const s = await loose();
    await addLoose(app, s.token, s.locationId, { name: 'Hammer', areaId: s.area.id });
    expect(await findLooseItemMatches(s.locationId, s.userId, ['garage'])).toEqual([]);
  });

  it('does not return box items, deleted loose items or other locations', async () => {
    const s = await loose();
    await createTestBin(app, s.token, s.locationId, { name: 'Toolbox', items: ['Ladder Hook'] });
    const gone = await addLoose(app, s.token, s.locationId, { name: 'Ladder Gone' });
    await query('UPDATE bin_items SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [gone.id]);
    const other = await createTestLocation(app, s.token);
    await addLoose(app, s.token, other.id, { name: 'Ladder Elsewhere' });

    expect(await findLooseItemMatches(s.locationId, s.userId, ['ladder'])).toEqual([]);
  });

  it('treats LIKE wildcards in terms literally', async () => {
    const s = await loose();
    await addLoose(app, s.token, s.locationId, { name: 'Ladder' });
    expect(await findLooseItemMatches(s.locationId, s.userId, ['%'])).toEqual([]);
  });

  it('caps the result at 10 loose items', async () => {
    const s = await loose();
    for (let i = 0; i < 12; i++) await addLoose(app, s.token, s.locationId, { name: `Cable ${i}` });
    expect(await findLooseItemMatches(s.locationId, s.userId, ['cable'])).toHaveLength(10);
  });
});

describe('findCheckedOutLooseItems', () => {
  it('returns only loose items with an active checkout', async () => {
    const s = await setup();
    const out = await addLoose(app, s.token, s.locationId, { name: 'Drill' });
    await addLoose(app, s.token, s.locationId, { name: 'Saw' });
    const res = await request(app).post(`/api/locations/${s.locationId}/items/${out.id}/checkout`).set('Authorization', `Bearer ${s.token}`).send({});
    expect(res.status).toBe(201);

    const got = await findCheckedOutLooseItems(s.locationId, s.userId);
    expect(got.map((g) => g.name)).toEqual(['Drill']);
  });
});

describe('candidates carry nesting info', () => {
  it('a child box reports its parent id and name, a top-level box reports none', async () => {
    const s = await setup();
    const parent = await createTestBin(app, s.token, s.locationId, { name: 'Toolbox' });
    const kid = await createTestBin(app, s.token, s.locationId, { name: 'Parts Tray' });
    await setParentBinByDb(kid.id, parent.id);

    const got = await findLiteralMatches(s.locationId, s.userId, ['parts']);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ parent_bin_id: parent.id, parent_bin_name: 'Toolbox' });
    const top = await findLiteralMatches(s.locationId, s.userId, ['toolbox']);
    expect(top[0]).toMatchObject({ parent_bin_id: null, parent_bin_name: '' });
    await expectNoHierarchyViolations(s.locationId);
  });

  it("a private parent's child is not visible to other members", async () => {
    const s = await setup();
    const peer = await createTestUser(app);
    await joinTestLocation(app, peer.token, s.inviteCode);
    const parent = await createTestBin(app, s.token, s.locationId, { name: 'Secret Box', visibility: 'private' });
    const kid = await createTestBin(app, s.token, s.locationId, { name: 'Secret Parts' });
    await setParentBinByDb(kid.id, parent.id);

    expect(await findLiteralMatches(s.locationId, peer.user.id, ['secret'])).toEqual([]);
    expect((await findLiteralMatches(s.locationId, s.userId, ['secret'])).map((b) => b.name).sort()).toEqual(['Secret Box', 'Secret Parts']);
    await expectNoHierarchyViolations(s.locationId);
  });
});
