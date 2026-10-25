import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The AI call is mocked; everything else (auth, plan gates, DB) is real, with aiMock off.
const streamAiToWriterMock = vi.fn();
vi.mock('../../lib/aiStream.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/aiStream.js')>()),
  streamAiToWriter: (...args: unknown[]) => streamAiToWriterMock(...args),
}));
vi.mock('../../lib/aiStreamHandler.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/aiStreamHandler.js')>()),
  resolveUserModel: async () => ({
    settings: { reorganization_prompt: null, tag_suggestion_prompt: null },
    model: {},
  }),
}));

import {
  createTestBin,
  createTestLocation,
  createTestUser,
  expectNoHierarchyViolations,
  setParentBinByDb,
} from '../../__tests__/helpers.js';
import { createApp } from '../../index.js';
import { config } from '../../lib/config.js';

let app: Express;
beforeEach(() => {
  app = createApp();
  streamAiToWriterMock.mockReset();
  streamAiToWriterMock.mockImplementation(async (writeEvent: (e: unknown) => void) => {
    const text = JSON.stringify({ bins: [{ name: 'X', items: ['a'] }], summary: 's', taxonomy: { newTags: [], renames: [], merges: [], parents: [] }, assignments: [{ binId: 'x', add: [], remove: [] }] });
    writeEvent({ type: 'done', text });
    return text;
  });
});

async function setup() {
  const { token } = await createTestUser(app);
  const loc = await createTestLocation(app, token);
  const parent = await createTestBin(app, token, loc.id, { name: 'Parent', items: ['a'] });
  const child = await createTestBin(app, token, loc.id, { name: 'Child', items: ['b'] });
  await setParentBinByDb(child.id, parent.id);
  const top = await createTestBin(app, token, loc.id, { name: 'Top', items: ['c'] });
  const trashed = await createTestBin(app, token, loc.id, { name: 'Trashed', items: ['d'] });
  await request(app).delete(`/api/bins/${trashed.id}`).set('Authorization', `Bearer ${token}`).expect(200);
  const otherLoc = await createTestLocation(app, token, 'Other');
  const foreign = await createTestBin(app, token, otherLoc.id, { name: 'Foreign', items: ['e'] });
  return { token, loc, parent, child, top, trashed, foreign };
}

const bin = (b: { id: string; name: string }) => ({ id: b.id, name: b.name, items: ['x'], tags: [] });

const ROUTES = [
  { path: '/api/ai/reorganize/stream', extra: {} },
  { path: '/api/ai/reorganize-tags/stream', extra: { changeLevel: 'additive', granularity: 'medium' } },
];

describe.each(ROUTES)('POST $path server guard (aiMock off)', ({ path, extra }) => {
  function post(token: string, locationId: string, bins: unknown[]) {
    return request(app).post(path).set('Authorization', `Bearer ${token}`).send({ locationId, bins, ...extra });
  }

  it('runs with aiMock off', () => {
    expect(config.aiMock).toBe(false);
  });

  it('rejects a child bin without calling the AI', async () => {
    const { token, loc, parent, child } = await setup();
    const res = await post(token, loc.id, [bin(parent), bin(child)]);
    expect(res.status).toBe(422);
    expect(streamAiToWriterMock).not.toHaveBeenCalled();
    await expectNoHierarchyViolations(loc.id);
  });

  it('rejects a trashed bin', async () => {
    const { token, loc, top, trashed } = await setup();
    const res = await post(token, loc.id, [bin(top), bin(trashed)]);
    expect(res.status).toBe(422);
    expect(streamAiToWriterMock).not.toHaveBeenCalled();
  });

  it("rejects another location's bin", async () => {
    const { token, loc, top, foreign } = await setup();
    const res = await post(token, loc.id, [bin(top), bin(foreign)]);
    expect(res.status).toBe(422);
    expect(streamAiToWriterMock).not.toHaveBeenCalled();
  });

  it('rejects a bin without an id', async () => {
    const { token, loc } = await setup();
    const res = await post(token, loc.id, [{ name: 'No id', items: ['x'] }]);
    expect(res.status).toBe(422);
  });

  it('accepts top-level bins, including a parent', async () => {
    const { token, loc, parent, top } = await setup();
    const res = await post(token, loc.id, [bin(parent), bin(top)]);
    expect(res.status).toBe(200);
    expect(streamAiToWriterMock).toHaveBeenCalled();
    await expectNoHierarchyViolations(loc.id);
  });
});
