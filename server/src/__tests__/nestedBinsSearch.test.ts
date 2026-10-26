import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../index.js';
import { createTestLocation, createTestUser } from './helpers.js';

let app: Express;
let token: string;
let locationId: string;

beforeEach(async () => {
  app = createApp();
  token = (await createTestUser(app)).token;
  locationId = (await createTestLocation(app, token)).id;
});

const auth = () => ({ Authorization: `Bearer ${token}` });
const post = (body: Record<string, unknown>) => request(app).post('/api/bins').set(auth()).send(body);
const list = (qs: string) =>
  request(app).get(`/api/bins?location_id=${locationId}&${qs}`).set(auth());
const names = (res: request.Response): string[] => (res.body.results as Array<{ name: string }>).map((b) => b.name).sort();

describe('searching bins by their parent', () => {
  it("finds the boxes inside a box when searching for the parent's name", async () => {
    const parent = (await post({ locationId, name: 'Toolbox' })).body;
    await post({ locationId, name: 'Screws', parentBinId: parent.id });
    await post({ locationId, name: 'Cables' });

    expect(names(await list('q=toolbox'))).toEqual(['Screws', 'Toolbox']);
    expect(names(await list('q=cables'))).toEqual(['Cables']);
  });

  it('still honours the top-level filter together with a search', async () => {
    const parent = (await post({ locationId, name: 'Toolbox' })).body;
    await post({ locationId, name: 'Screws', parentBinId: parent.id });

    expect(names(await list('q=toolbox&top_level=true'))).toEqual(['Toolbox']);
  });
});
