import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestArea, createTestBin, createTestLocation, createTestUser, expectNoHierarchyViolations, joinTestLocation, setParentBinByDb } from '../../__tests__/helpers.js';
import { addLoose } from '../../__tests__/looseItemsHelpers.js';
import { query } from '../../db.js';
import { createApp } from '../../index.js';
import { buildCommandContext, buildInventoryContext, MAX_CONTEXT_LOOSE_ITEMS } from '../aiContext.js';
import { buildSystemPrompt as buildCommandSystemPrompt, buildUserMessage as buildCommandUserMessage } from '../commandParser.js';
import { buildUserMessage as buildQueryUserMessage } from '../inventoryQuery.js';

let app: Express;

beforeEach(() => {
  app = createApp();
});

describe('AI context visibility — private bins must not leak across users', () => {
  it("omits another user's private bin from buildInventoryContext", async () => {
    const owner = await createTestUser(app);
    const loc = await createTestLocation(app, owner.token);
    const peer = await createTestUser(app);
    await joinTestLocation(app, peer.token, loc.invite_code);

    await createTestBin(app, owner.token, loc.id, {
      name: 'Owners Private Stash',
      visibility: 'private',
      items: ['confidential paperwork'],
    });
    await createTestBin(app, owner.token, loc.id, { name: 'Shared Garage' });

    const peerCtx = await buildInventoryContext(loc.id, peer.user.id);
    const peerBinNames = peerCtx.bins.map((b) => b.name);
    expect(peerBinNames).toContain('Shared Garage');
    expect(peerBinNames).not.toContain('Owners Private Stash');
    expect(peerCtx.other_bins ?? []).toEqual([]);
  });

  it('still shows the owner their own private bin', async () => {
    const owner = await createTestUser(app);
    const loc = await createTestLocation(app, owner.token);
    await createTestBin(app, owner.token, loc.id, { name: 'Owners Private Stash', visibility: 'private' });
    await createTestBin(app, owner.token, loc.id, { name: 'Shared Garage' });

    const ownerCtx = await buildInventoryContext(loc.id, owner.user.id);
    const ownerBinNames = ownerCtx.bins.map((b) => b.name);
    expect(ownerBinNames).toContain('Shared Garage');
    expect(ownerBinNames).toContain('Owners Private Stash');
  });

  it('omits private bins from buildCommandContext for non-owners', async () => {
    const owner = await createTestUser(app);
    const loc = await createTestLocation(app, owner.token);
    const peer = await createTestUser(app);
    await joinTestLocation(app, peer.token, loc.invite_code);

    await createTestBin(app, owner.token, loc.id, { name: 'Owners Private Stash', visibility: 'private' });
    await createTestBin(app, owner.token, loc.id, { name: 'Shared Garage' });

    const peerCtx = await buildCommandContext(loc.id, peer.user.id);
    const peerBinNames = peerCtx.bins.map((b) => b.name);
    expect(peerBinNames).toContain('Shared Garage');
    expect(peerBinNames).not.toContain('Owners Private Stash');
  });

  it("private trashed bins do not leak into another user's trash list", async () => {
    const owner = await createTestUser(app);
    const loc = await createTestLocation(app, owner.token);
    const peer = await createTestUser(app);
    await joinTestLocation(app, peer.token, loc.invite_code);

    const privateBin = await createTestBin(app, owner.token, loc.id, {
      name: 'Owners Private Stash',
      visibility: 'private',
    });
    const sharedBin = await createTestBin(app, owner.token, loc.id, { name: 'Shared Garage' });

    await request(app).delete(`/api/bins/${privateBin.id}`).set('Authorization', `Bearer ${owner.token}`);
    await request(app).delete(`/api/bins/${sharedBin.id}`).set('Authorization', `Bearer ${owner.token}`);

    const peerCtx = await buildInventoryContext(loc.id, peer.user.id);
    const peerTrashNames = peerCtx.trash_bins.map((b) => b.name);
    expect(peerTrashNames).toContain('Shared Garage');
    expect(peerTrashNames).not.toContain('Owners Private Stash');
  });
});

describe('AI context — nested boxes and loose items', () => {
  async function nested() {
    const owner = await createTestUser(app);
    const loc = await createTestLocation(app, owner.token);
    const area = await createTestArea(app, owner.token, loc.id, 'Garage');
    const parent = await createTestBin(app, owner.token, loc.id, { name: 'Toolbox' });
    await request(app).put(`/api/bins/${parent.id}`).set('Authorization', `Bearer ${owner.token}`).send({ areaId: area.id });
    const kid = await createTestBin(app, owner.token, loc.id, { name: 'Parts Tray', items: ['Screws'] });
    await setParentBinByDb(kid.id, parent.id);
    return { owner, loc, area, parent, kid };
  }

  it('a child box carries parent_bin_code and no duplicated area (command and query contexts)', async () => {
    const { owner, loc, parent, kid } = await nested();
    for (const ctx of [await buildCommandContext(loc.id, owner.user.id), await buildInventoryContext(loc.id, owner.user.id)]) {
      const p = ctx.bins.find((b) => b.name === 'Toolbox') as Record<string, unknown>;
      const c = ctx.bins.find((b) => b.name === 'Parts Tray') as Record<string, unknown>;
      expect(c.parent_bin_code).toBe(parent.short_code);
      expect(c.area_name).toBeUndefined();
      expect(c.area_id).toBeUndefined();
      expect(p.area_name).toBe('Garage');
      expect(p.parent_bin_code).toBeUndefined();
      expect(c.name).toBe('Parts Tray');
      void kid;
    }
    await expectNoHierarchyViolations(loc.id);
  });

  it('lists loose items with their area path, quantity and checkout, read-only and without ids', async () => {
    const { owner, loc, area } = await nested();
    const sub = (await request(app).post(`/api/locations/${loc.id}/areas`).set('Authorization', `Bearer ${owner.token}`).send({ name: 'Shelf', parent_id: area.id })).body;
    await addLoose(app, owner.token, loc.id, { name: 'Step Ladder', areaId: sub.id, quantity: 2 });
    const drill = await addLoose(app, owner.token, loc.id, { name: 'Drill' });
    await request(app).post(`/api/locations/${loc.id}/items/${drill.id}/checkout`).set('Authorization', `Bearer ${owner.token}`).send({});

    const ctx = await buildCommandContext(loc.id, owner.user.id);
    expect(ctx.loose_items).toHaveLength(2);
    expect(ctx.loose_items).toContainEqual({ name: 'Step Ladder', quantity: 2, area: 'Garage › Shelf' });
    expect(ctx.loose_items).toContainEqual({ name: 'Drill', checked_out_by: expect.any(String) });
    expect(JSON.stringify(ctx.loose_items)).not.toContain(drill.id);
    expect(ctx.complete).toBe(true);
    expect(ctx.areas.find((a) => a.name === 'Shelf')?.path).toBe('Garage › Shelf');
    expect(ctx.areas.find((a) => a.name === 'Garage')?.path).toBeUndefined();

    const q = await buildInventoryContext(loc.id, owner.user.id);
    expect(q.loose_items).toHaveLength(2);
  });

  it('caps loose items and reports complete=false when trimmed', async () => {
    const { owner, loc } = await nested();
    for (let i = 0; i < MAX_CONTEXT_LOOSE_ITEMS + 5; i++) {
      await query(
        "INSERT INTO bin_items (id, bin_id, area_id, location_id, name, quantity, position) VALUES ($1, NULL, NULL, $2, $3, NULL, 0)",
        [`li-${i}`, loc.id, `Loose ${i}`],
      );
    }
    const ctx = await buildCommandContext(loc.id, owner.user.id);
    expect(ctx.loose_items).toHaveLength(MAX_CONTEXT_LOOSE_ITEMS);
    expect(ctx.complete).toBe(false);
  });

  it('omits loose items (and stays incomplete) when the context is scoped to selected bins', async () => {
    const { owner, loc, parent } = await nested();
    await addLoose(app, owner.token, loc.id, { name: 'Ladder' });
    const ctx = await buildCommandContext(loc.id, owner.user.id, [parent.id]);
    expect(ctx.loose_items).toBeUndefined();
    expect(ctx.complete).toBe(false);
  });

  it("another member does not see a private parent's child", async () => {
    const { owner, loc } = await nested();
    const peer = await createTestUser(app);
    await joinTestLocation(app, peer.token, loc.invite_code);
    const priv = await createTestBin(app, owner.token, loc.id, { name: 'Secret Box', visibility: 'private' });
    const kid = await createTestBin(app, owner.token, loc.id, { name: 'Secret Parts' });
    await setParentBinByDb(kid.id, priv.id);

    const peerCtx = await buildCommandContext(loc.id, peer.user.id);
    expect(peerCtx.bins.map((b) => b.name)).not.toContain('Secret Parts');
    expect(JSON.stringify(peerCtx)).not.toContain('Secret');
    await expectNoHierarchyViolations(loc.id);
  });

  it('prompts say loose items are read-only for commands and are rendered in the user message', async () => {
    const { owner, loc } = await nested();
    await addLoose(app, owner.token, loc.id, { name: 'Ladder' });
    const ctx = await buildCommandContext(loc.id, owner.user.id);
    const msg = buildCommandUserMessage({ text: 'rename the ladder', context: ctx });
    expect(msg).toContain('"loose_items":[{"name":"Ladder"}]');
    const system = buildCommandSystemPrompt(ctx.availableColors, ctx.availableIcons);
    expect(system).toMatch(/loose_items.*READ-ONLY/s);
    expect(system).toMatch(/commands cannot change items outside a box yet/i);

    const qctx = await buildInventoryContext(loc.id, owner.user.id);
    expect(buildQueryUserMessage('where is the ladder', qctx)).toContain('"loose_items":[{"name":"Ladder"}]');
  });
});
