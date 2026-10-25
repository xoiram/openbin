import type { Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const flagBox = vi.hoisted(() => {
  process.env.AI_MOCK = 'true';
  return { deterministic: true };
});

// config is frozen; proxy it so each test can pick the planner / legacy path.
vi.mock('../lib/config.js', async () => {
  const actual = await vi.importActual<typeof import('../lib/config.js')>('../lib/config.js');
  return {
    ...actual,
    // Copy: the real config is frozen, and a proxy may not lie about frozen properties.
    config: new Proxy({ ...actual.config } as typeof actual.config, {
      get: (target, key, receiver) => (key === 'aiDeterministicMatch' ? flagBox.deterministic : Reflect.get(target, key, receiver)),
    }),
  };
});

type PipeArgs = {
  schema?: unknown;
  system: string;
  userContent: string;
  enrichResult: (parsed: unknown) => Promise<unknown>;
};
let captured: PipeArgs | undefined;

vi.mock('../lib/aiStream.js', async () => {
  const actual = await vi.importActual<typeof import('../lib/aiStream.js')>('../lib/aiStream.js');
  return {
    ...actual,
    pipeAiStreamToResponse: async (res: import('express').Response, _model: unknown, args: PipeArgs) => {
      captured = args;
      res.status(200).json({ ok: true });
    },
  };
});

vi.mock('../lib/aiStreamHandler.js', async () => {
  const actual = await vi.importActual<typeof import('../lib/aiStreamHandler.js')>('../lib/aiStreamHandler.js');
  return {
    ...actual,
    resolveUserModel: async () => ({
      settings: { query_prompt: null, command_prompt: null, max_tokens: null, temperature: null, top_p: null, request_timeout: null },
      model: {},
    }),
  };
});

import { createTestArea, createTestBin, createTestLocation, createTestUser, expectNoHierarchyViolations, setParentBinByDb } from '../__tests__/helpers.js';
import { addLoose } from '../__tests__/looseItemsHelpers.js';
import { createApp } from '../index.js';

let app: Express;
beforeEach(() => { app = createApp(); captured = undefined; });
afterEach(() => { flagBox.deterministic = true; });

async function fixture() {
  const { token, user } = await createTestUser(app);
  const loc = await createTestLocation(app, token);
  const area = await createTestArea(app, token, loc.id, 'Garage');
  const parent = await createTestBin(app, token, loc.id, { name: 'Toolbox' });
  await request(app).put(`/api/bins/${parent.id}`).set('Authorization', `Bearer ${token}`).send({ areaId: area.id });
  const kid = await createTestBin(app, token, loc.id, { name: 'Parts Tray' });
  await setParentBinByDb(kid.id, parent.id);
  const ladder = await addLoose(app, token, loc.id, { name: 'Step Ladder', areaId: area.id });
  return { token, userId: user.id, locationId: loc.id, parent, kid, ladder };
}

const post = (path: string, token: string, body: object) => request(app).post(path).set('Authorization', `Bearer ${token}`).send(body);

describe.each([true, false])('AI routes with nested boxes (deterministic planner = %s)', (flag) => {
  beforeEach(() => { flagBox.deterministic = flag; });

  it('query/stream: the planner returns loose_item matches; the legacy path gets loose items as context and stays bin-only', async () => {
    const f = await fixture();
    const res = await post('/api/ai/query/stream', f.token, { question: 'where is the ladder', locationId: f.locationId });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(captured).toBeDefined();

    if (flag) {
      // Planner: bins and loose items are never sent to the model; SQL finds them.
      expect(captured!.userContent).not.toContain('Step Ladder');
      const out = (await captured!.enrichResult({ kind: 'content', terms: ['ladder'], answer: 'Here.' })) as { matches: Array<Record<string, unknown>> };
      expect(out.matches).toHaveLength(1);
      expect(out.matches[0]).toMatchObject({ kind: 'loose_item', name: 'Step Ladder', bin_path: 'Garage', bin_id: null, item_id: f.ladder.id });
    } else {
      expect(captured!.userContent).toContain('"loose_items":[{"name":"Step Ladder","area":"Garage"}]');
      expect(captured!.userContent).toContain(`"parent_bin_code":"${f.parent.short_code}"`);
      const out = (await captured!.enrichResult({
        answer: 'x',
        matches: [
          { bin_code: f.kid.short_code, name: 'Invented', area_name: 'Invented', items: [], tags: [], relevance: 'r' },
          { bin_code: 'LOOSE0', name: 'Step Ladder', area_name: 'Garage', items: [], tags: [], relevance: 'r' },
        ],
      })) as { matches: Array<Record<string, unknown>> };
      expect(out.matches).toHaveLength(1);
      expect(out.matches[0]).toMatchObject({ kind: 'bin', name: 'Parts Tray', bin_path: 'Garage › Toolbox › Parts Tray', parent_bin_id: f.parent.id });
    }
    await expectNoHierarchyViolations(f.locationId);
  });

  it('command/stream: loose items are read-only context and cannot be addressed by an action', async () => {
    const f = await fixture();
    const res = await post('/api/ai/command/stream', f.token, { text: 'rename the ladder to Tall Ladder', locationId: f.locationId });
    expect(res.status).toBe(200);
    expect(captured!.system).toMatch(/READ-ONLY/);
    expect(captured!.system).toMatch(/commands cannot change items outside a box yet/i);
    expect(captured!.userContent).toContain('"loose_items"');

    // An action pointing at a made-up code for the loose item is dropped, never forwarded.
    const out = (await captured!.enrichResult({
      actions: [{ type: 'modify_item', bin_code: 'LOOSE0', bin_name: 'Garage', old_item: 'Step Ladder', new_item: 'Tall Ladder' }],
      interpretation: 'x',
    })) as { actions: unknown[] };
    expect(out.actions).toEqual([]);
  });

  it('ask/stream command branch gets the same context', async () => {
    const f = await fixture();
    const res = await post('/api/ai/ask/stream', f.token, { text: 'delete the toolbox bin', locationId: f.locationId });
    expect(res.status).toBe(200);
    expect(captured!.userContent).toContain('"loose_items"');
    expect(captured!.userContent).toContain(`"parent_bin_code":"${f.parent.short_code}"`);
    expect(captured!.system).toMatch(/also trashed|trashed with it|also trashes/i);
  });
});
