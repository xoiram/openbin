import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestArea, createTestBin, createTestLocation, createTestUser, expectNoHierarchyViolations, joinTestLocation, setParentBinByDb } from '../../__tests__/helpers.js';
import { addLoose } from '../../__tests__/looseItemsHelpers.js';
import { query } from '../../db.js';
import { createApp } from '../../index.js';
import { executeQueryPlan } from '../queryPlanExecutor.js';

let app: Express;
beforeEach(() => { app = createApp(); });

async function setup() {
  const { token, user } = await createTestUser(app);
  const loc = await createTestLocation(app, token);
  return { token, userId: user.id, locationId: loc.id };
}

describe('executeQueryPlan — content', () => {
  it('runs the literal matcher and hydrates matches', async () => {
    const s = await setup();
    await createTestBin(app, s.token, s.locationId, { name: 'Battery Station' });

    const result = await executeQueryPlan(
      { kind: 'content', terms: ['battery'], answer: 'Here are your batteries.' },
      s.locationId,
      s.userId,
    );
    expect(result.matches.map((m) => m.name)).toEqual(['Battery Station']);
    expect(result.answer).toBe('Here are your batteries.');
    expect(result.near_misses).toEqual([]);
  });

  it('handles plural-ies haystacks via plural variants in terms', async () => {
    const s = await setup();
    await createTestBin(app, s.token, s.locationId, { name: 'Wrenches', tags: ['hobbies'] });

    // The planner is expected to emit both forms; this test simulates that.
    const result = await executeQueryPlan(
      { kind: 'content', terms: ['hobby', 'hobbies'], answer: 'Here.' },
      s.locationId,
      s.userId,
    );
    expect(result.matches.map((m) => m.name)).toEqual(['Wrenches']);
  });

  it('restricts to tag matches when fields=["tag"]', async () => {
    const s = await setup();
    await createTestBin(app, s.token, s.locationId, { name: 'Toolbox', items: ['Hammer'] });
    await createTestBin(app, s.token, s.locationId, { name: 'Other', tags: ['tools'] });

    const result = await executeQueryPlan(
      { kind: 'content', terms: ['tool', 'tools'], fields: ['tag'], answer: 'Here.' },
      s.locationId,
      s.userId,
    );
    // Only "Other" has the tag. "Toolbox" matches by name+item but is excluded by fields filter.
    expect(result.matches.map((m) => m.name)).toEqual(['Other']);
  });

  it('falls through to near-miss when content yields nothing', async () => {
    const s = await setup();
    await createTestBin(app, s.token, s.locationId, { name: 'Garden Tools' });

    const result = await executeQueryPlan(
      { kind: 'content', terms: ['gardn'], answer: 'Looking for garden supplies…' },
      s.locationId,
      s.userId,
    );
    expect(result.matches).toEqual([]);
    expect(result.near_misses.map((m) => m.name)).toContain('Garden Tools');
    // Server overrides answer when there are no matches but a near-miss exists.
    expect(result.answer).toMatch(/did you mean/i);
    expect(result.answer).toMatch(/Garden Tools/);
  });

  it('uses generic empty answer when no matches and no near-miss', async () => {
    const s = await setup();
    const result = await executeQueryPlan(
      { kind: 'content', terms: ['xyzzy'], answer: 'Looking…' },
      s.locationId,
      s.userId,
    );
    expect(result.matches).toEqual([]);
    expect(result.near_misses).toEqual([]);
    expect(result.answer).toMatch(/couldn'?t find|no matches|nothing/i);
  });
});

describe('executeQueryPlan — metadata', () => {
  it('routes pinned correctly', async () => {
    const s = await setup();
    const a = await createTestBin(app, s.token, s.locationId, { name: 'Pinned A' });
    await createTestBin(app, s.token, s.locationId, { name: 'Other' });
    await request(app).post(`/api/bins/${a.id}/pin`).set('Authorization', `Bearer ${s.token}`).send({});

    const result = await executeQueryPlan(
      { kind: 'metadata', metadata: 'pinned', answer: 'Here are your pinned bins.' },
      s.locationId,
      s.userId,
    );
    expect(result.matches.map((m) => m.name)).toEqual(['Pinned A']);
  });

  it('routes trashed correctly', async () => {
    const s = await setup();
    const b = await createTestBin(app, s.token, s.locationId, { name: 'Old' });
    await request(app).delete(`/api/bins/${b.id}`).set('Authorization', `Bearer ${s.token}`);

    const result = await executeQueryPlan(
      { kind: 'metadata', metadata: 'trashed', answer: 'Here is your trash.' },
      s.locationId,
      s.userId,
    );
    expect(result.matches.map((m) => m.name)).toEqual(['Old']);
    expect(result.matches[0].is_trashed).toBe(true);
  });

  it('overrides answer when no metadata matches', async () => {
    const s = await setup();
    const result = await executeQueryPlan(
      { kind: 'metadata', metadata: 'pinned', answer: 'Here are your pinned bins.' },
      s.locationId,
      s.userId,
    );
    expect(result.matches).toEqual([]);
    expect(result.answer).toMatch(/no|none|don'?t have/i);
  });
});

describe('executeQueryPlan — refusal', () => {
  it('returns the reason as the answer with empty matches', async () => {
    const s = await setup();
    const result = await executeQueryPlan(
      { kind: 'refusal', reason: 'I cannot see who checked out items.' },
      s.locationId,
      s.userId,
    );
    expect(result.matches).toEqual([]);
    expect(result.near_misses).toEqual([]);
    expect(result.answer).toBe('I cannot see who checked out items.');
  });
});

describe('executeQueryPlan — scope', () => {
  it('honors scopedBinIds for content plans', async () => {
    const s = await setup();
    const a = await createTestBin(app, s.token, s.locationId, { name: 'Battery A' });
    await createTestBin(app, s.token, s.locationId, { name: 'Battery B' });

    const result = await executeQueryPlan(
      { kind: 'content', terms: ['battery'], answer: 'x' },
      s.locationId,
      s.userId,
      [a.id],
    );
    expect(result.matches.map((m) => m.name)).toEqual(['Battery A']);
  });
});

describe('executeQueryPlan — pre-filter limits (merged_bug_004)', () => {
  it('fields=tag filter is applied in SQL before LIMIT so tagged bins beyond position 30 are still found', async () => {
    const s = await setup();
    for (let i = 0; i < 40; i++) {
      await createTestBin(app, s.token, s.locationId, { name: `Tools Bin ${i}` });
    }
    const taggedA = await createTestBin(app, s.token, s.locationId, { name: 'Tagged A', tags: ['tools'] });
    const taggedB = await createTestBin(app, s.token, s.locationId, { name: 'Tagged B', tags: ['tools'] });
    const taggedC = await createTestBin(app, s.token, s.locationId, { name: 'Tagged C', tags: ['tools'] });

    const result = await executeQueryPlan(
      { kind: 'content', terms: ['tools'], fields: ['tag'], answer: 'Here.' },
      s.locationId,
      s.userId,
    );
    const names = result.matches.map((m) => m.name);
    expect(names).toContain(taggedA.name);
    expect(names).toContain(taggedB.name);
    expect(names).toContain(taggedC.name);
    for (const name of names) {
      expect(name).not.toMatch(/^Tools Bin \d+$/);
    }
  });

  it('includes total_item_count in hydrated matches', async () => {
    const s = await setup();
    await createTestBin(app, s.token, s.locationId, { name: 'Multi', items: ['A', 'B', 'C'] });

    const result = await executeQueryPlan(
      { kind: 'content', terms: ['multi'], answer: 'Here.' },
      s.locationId,
      s.userId,
    );
    expect(result.matches[0].total_item_count).toBe(3);
  });
});

describe('executeQueryPlan — nested boxes and loose items', () => {
  const content = (terms: string[], fields?: Array<'name' | 'tag' | 'item'>) =>
    ({ kind: 'content', terms, ...(fields ? { fields } : {}), answer: 'Here.' }) as const;

  it('every bin match carries kind, bin_path, parent_bin_id and parent_bin_name', async () => {
    const s = await setup();
    const area = await createTestArea(app, s.token, s.locationId, 'Garage');
    const parent = await createTestBin(app, s.token, s.locationId, { name: 'Toolbox' });
    await request(app).put(`/api/bins/${parent.id}`).set('Authorization', `Bearer ${s.token}`).send({ areaId: area.id });
    const kid = await createTestBin(app, s.token, s.locationId, { name: 'Parts Tray', items: ['Screws'] });
    await setParentBinByDb(kid.id, parent.id);

    const result = await executeQueryPlan(content(['parts']), s.locationId, s.userId);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({
      kind: 'bin',
      name: 'Parts Tray',
      bin_path: 'Garage › Toolbox › Parts Tray',
      parent_bin_id: parent.id,
      parent_bin_name: 'Toolbox',
    });
    const top = await executeQueryPlan(content(['toolbox']), s.locationId, s.userId);
    expect(top.matches[0]).toMatchObject({ kind: 'bin', bin_path: 'Garage › Toolbox', parent_bin_id: null, parent_bin_name: '' });
    await expectNoHierarchyViolations(s.locationId);
  });

  it('returns a loose item in an area with the exact loose_item contract', async () => {
    const s = await setup();
    const parentArea = (await request(app).post(`/api/locations/${s.locationId}/areas`).set('Authorization', `Bearer ${s.token}`).send({ name: 'Garage' })).body;
    const area = (await request(app).post(`/api/locations/${s.locationId}/areas`).set('Authorization', `Bearer ${s.token}`).send({ name: 'Shelf', parent_id: parentArea.id })).body;
    const item = await addLoose(app, s.token, s.locationId, { name: 'Step Ladder', areaId: area.id, quantity: 2 });

    const result = await executeQueryPlan(content(['ladder']), s.locationId, s.userId);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toEqual({
      kind: 'loose_item',
      bin_id: null,
      bin_code: null,
      item_id: item.id,
      name: 'Step Ladder',
      quantity: 2,
      area_id: area.id,
      area_name: 'Shelf',
      bin_path: 'Garage › Shelf',
      items: [],
      total_item_count: 1,
      tags: [],
      relevance: expect.any(String),
      is_trashed: false,
      icon: '',
      color: '',
    });
  });

  it('returns an unassigned loose item with empty area name and path', async () => {
    const s = await setup();
    await addLoose(app, s.token, s.locationId, { name: 'Ladder' });
    const result = await executeQueryPlan(content(['ladder']), s.locationId, s.userId);
    expect(result.matches[0]).toMatchObject({ kind: 'loose_item', area_id: null, area_name: '', bin_path: '', quantity: null });
  });

  it('does not return loose items when fields excludes item', async () => {
    const s = await setup();
    await addLoose(app, s.token, s.locationId, { name: 'Ladder' });
    await createTestBin(app, s.token, s.locationId, { name: 'Ladder Rack' });
    const result = await executeQueryPlan(content(['ladder'], ['name']), s.locationId, s.userId);
    expect(result.matches.map((m) => m.kind)).toEqual(['bin']);
  });

  it('a loose item with the same name as a box item gives two distinct matches', async () => {
    const s = await setup();
    await createTestBin(app, s.token, s.locationId, { name: 'Toolbox', items: ['Hammer'] });
    const item = await addLoose(app, s.token, s.locationId, { name: 'Hammer' });
    const result = await executeQueryPlan(content(['hammer']), s.locationId, s.userId);
    expect(result.matches).toHaveLength(2);
    expect(result.matches.map((m) => m.kind).sort()).toEqual(['bin', 'loose_item']);
    expect(result.matches.find((m) => m.kind === 'loose_item')).toMatchObject({ item_id: item.id });
  });

  it('loose items never crowd bins out: at most 10 loose and 30 matches in total', async () => {
    const s = await setup();
    for (let i = 0; i < 12; i++) await addLoose(app, s.token, s.locationId, { name: `Cable ${i}` });
    for (let i = 0; i < 25; i++) {
      await query(
        "INSERT INTO bins (id, short_code, location_id, name, created_by, visibility, tags) VALUES ($1, $2, $3, $4, $5, 'location', '[]')",
        [`b-${i}`, `C${String(i).padStart(5, '0')}`, s.locationId, `Cable Box ${i}`, s.userId],
      );
    }
    const result = await executeQueryPlan(content(['cable']), s.locationId, s.userId);
    expect(result.matches.filter((m) => m.kind === 'loose_item')).toHaveLength(10);
    expect(result.matches.filter((m) => m.kind === 'bin')).toHaveLength(20);
    expect(result.matches).toHaveLength(30);
  });

  it('bin-only results when a selection scope is active (loose items are not in a selection)', async () => {
    const s = await setup();
    const bin = await createTestBin(app, s.token, s.locationId, { name: 'Ladder Rack' });
    await addLoose(app, s.token, s.locationId, { name: 'Ladder' });
    const result = await executeQueryPlan(content(['ladder']), s.locationId, s.userId, [bin.id]);
    expect(result.matches.map((m) => m.kind)).toEqual(['bin']);
  });

  it('an only-loose match is a match (no near-miss path)', async () => {
    const s = await setup();
    await addLoose(app, s.token, s.locationId, { name: 'Ladder' });
    const result = await executeQueryPlan(content(['ladder']), s.locationId, s.userId);
    expect(result.near_misses).toEqual([]);
    expect(result.answer).toBe('Here.');
  });

  it('near-miss (typo) matching stays bin-only', async () => {
    const s = await setup();
    await addLoose(app, s.token, s.locationId, { name: 'Ladder' });
    await createTestBin(app, s.token, s.locationId, { name: 'Toolbox' });
    const result = await executeQueryPlan(content(['toolbx']), s.locationId, s.userId);
    expect(result.matches).toEqual([]);
    expect(result.near_misses.every((m) => 'bin_id' in m)).toBe(true);
  });

  it("checked_out includes a checked-out loose item (and its area path)", async () => {
    const s = await setup();
    const area = await createTestArea(app, s.token, s.locationId, 'Garage');
    const drill = await addLoose(app, s.token, s.locationId, { name: 'Drill', areaId: area.id });
    await addLoose(app, s.token, s.locationId, { name: 'Saw' });
    const co = await request(app).post(`/api/locations/${s.locationId}/items/${drill.id}/checkout`).set('Authorization', `Bearer ${s.token}`).send({});
    expect(co.status).toBe(201);

    const result = await executeQueryPlan({ kind: 'metadata', metadata: 'checked_out', answer: 'Out:' }, s.locationId, s.userId);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({ kind: 'loose_item', name: 'Drill', bin_path: 'Garage', item_id: drill.id });
  });

  it('other metadata kinds stay bin-only, with paths', async () => {
    const s = await setup();
    await addLoose(app, s.token, s.locationId, { name: 'Ladder' });
    await createTestBin(app, s.token, s.locationId, { name: 'Mine', visibility: 'private' });
    const result = await executeQueryPlan({ kind: 'metadata', metadata: 'private', answer: 'Yours:' }, s.locationId, s.userId);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({ kind: 'bin', bin_path: 'Mine' });
  });

  it("does not leak a private parent's child to another member", async () => {
    const s = await setup();
    const peer = await createTestUser(app);
    await joinTestLocation(app, peer.token, (await query<{ invite_code: string }>('SELECT invite_code FROM locations WHERE id = $1', [s.locationId])).rows[0].invite_code);
    const parent = await createTestBin(app, s.token, s.locationId, { name: 'Secret Box', visibility: 'private' });
    const kid = await createTestBin(app, s.token, s.locationId, { name: 'Secret Parts' });
    await setParentBinByDb(kid.id, parent.id);
    const result = await executeQueryPlan(content(['secret']), s.locationId, peer.user.id);
    expect(result.matches).toEqual([]);
    await expectNoHierarchyViolations(s.locationId);
  });
});
