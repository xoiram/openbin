import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { NESTED_BOXES_INDEXES_PG } from '../migrations/0015_nested_boxes.js';
import { migrations } from '../migrations/index.js';
import { runPostgresMigrations } from '../migrations/runner.js';

// Runs against a real PostgreSQL (DATABASE_URL) in the CI `postgres` job; skipped elsewhere.
// Server unit tests run on SQLite only, so this is what exercises migration 0015 on Postgres.

const url = process.env.DATABASE_URL;
const FIXTURES = path.join(import.meta.dirname, '..', 'migrations', '__tests__', 'fixtures');
const OLD_SCHEMA = fs.readFileSync(path.join(FIXTURES, 'schema.pg.0014.sql'), 'utf-8');
const NEW_SCHEMA = fs.readFileSync(path.join(import.meta.dirname, '..', '..', '..', 'schema.pg.sql'), 'utf-8');

const schemas: string[] = [];
const pools: pg.Pool[] = [];

async function isolatedPool(name: string): Promise<pg.Pool> {
  const schema = `nb15_${name}_${Date.now()}`;
  const admin = new pg.Pool({ connectionString: url });
  await admin.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  schemas.push(schema);
  const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema},public` });
  pools.push(pool);
  return pool;
}

async function oldDatabase(name: string): Promise<pg.Pool> {
  const pool = await isolatedPool(name);
  await pool.query(OLD_SCHEMA);
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  for (const m of migrations.filter((x) => x.name !== '0015_nested_boxes')) {
    await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [m.name]);
  }
  await pool.query(`
    INSERT INTO users (id, display_name, email) VALUES ('u1', 'Ann', 'ann@example.com'), ('u2', 'Bo', 'bo@example.com');
    INSERT INTO locations (id, name, created_by, invite_code) VALUES ('l1', 'Home', 'u1', 'AAA'), ('l2', 'Cabin', 'u1', 'BBB');
    INSERT INTO areas (id, location_id, name) VALUES ('a1', 'l1', 'Garage');
    INSERT INTO bins (id, short_code, location_id, name, area_id) VALUES
      ('b1', 'AAAAAA', 'l1', 'Toolbox', 'a1'), ('b2', 'BBBBBB', 'l1', 'Cables', NULL), ('b3', 'CCCCCC', 'l2', 'Pots', NULL);
    INSERT INTO bin_items (id, bin_id, name, quantity, position) VALUES
      ('i1', 'b1', 'Hammer', 1, 0), ('i2', 'b1', 'Nails', 200, 1), ('i3', 'b2', 'HDMI', 3, 0), ('i4', 'b3', 'Pan', NULL, 0);
    INSERT INTO item_checkouts (id, item_id, origin_bin_id, location_id, checked_out_by) VALUES
      ('c1', 'i1', 'b1', 'l1', 'u2'), ('c2', 'i3', 'b2', 'l1', 'u1');
    INSERT INTO shopping_list_items (id, location_id, name, origin_bin_id, created_by) VALUES ('s1', 'l1', 'Screws', 'b1', 'u1');
  `);
  return pool;
}

async function upgrade(pool: pg.Pool): Promise<void> {
  // what init.ts does on startup: schema file, migrations, then the new-column indexes
  await pool.query(NEW_SCHEMA);
  await runPostgresMigrations(pool, migrations);
  await pool.query(NESTED_BOXES_INDEXES_PG);
}

async function count(pool: pg.Pool, table: string): Promise<number> {
  return Number((await pool.query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n);
}

async function describeTable(pool: pg.Pool, table: string) {
  const cols = await pool.query(
    `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = $1 ORDER BY column_name`,
    [table],
  );
  const constraints = await pool.query(
    `SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c
     WHERE c.conrelid = (quote_ident(current_schema()) || '.' || quote_ident($1))::regclass ORDER BY 1`,
    [table],
  );
  const indexes = await pool.query(
    `SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND tablename = $1 ORDER BY 1`,
    [table],
  );
  return {
    cols: cols.rows,
    constraints: constraints.rows.map((r) => r.def as string),
    indexes: indexes.rows.map((r) => r.indexname as string),
  };
}

afterAll(async () => {
  for (const p of pools) await p.end();
  if (!url) return;
  const admin = new pg.Pool({ connectionString: url });
  for (const s of schemas) await admin.query(`DROP SCHEMA IF EXISTS ${s} CASCADE`);
  await admin.end();
});

describe.skipIf(!url)('migration 0015_nested_boxes (PostgreSQL)', () => {
  it('upgrades a populated database without losing rows, checkout history or links', async () => {
    const pool = await oldDatabase('upgrade');
    const before = {
      items: await count(pool, 'bin_items'),
      checkouts: await count(pool, 'item_checkouts'),
      shopping: await count(pool, 'shopping_list_items'),
      bins: await count(pool, 'bins'),
    };

    await upgrade(pool);

    expect(await count(pool, 'bin_items')).toBe(before.items);
    expect(await count(pool, 'item_checkouts')).toBe(before.checkouts);
    expect(await count(pool, 'shopping_list_items')).toBe(before.shopping);
    expect(await count(pool, 'bins')).toBe(before.bins);

    const items = await pool.query('SELECT id, bin_id, area_id, location_id FROM bin_items ORDER BY id');
    expect(items.rows.map((r) => [r.id, r.bin_id, r.area_id, r.location_id])).toEqual([
      ['i1', 'b1', null, 'l1'], ['i2', 'b1', null, 'l1'], ['i3', 'b2', null, 'l1'], ['i4', 'b3', null, 'l2'],
    ]);
    const checkouts = await pool.query('SELECT id, item_id, origin_bin_id FROM item_checkouts ORDER BY id');
    expect(checkouts.rows.map((r) => [r.id, r.item_id, r.origin_bin_id])).toEqual([['c1', 'i1', 'b1'], ['c2', 'i3', 'b2']]);
  });

  it('allows loose and unassigned items, rejects box-and-area, and unassigns on area delete', async () => {
    const pool = await oldDatabase('rules');
    await upgrade(pool);

    await pool.query("INSERT INTO bin_items (id, bin_id, area_id, location_id, name) VALUES ('loose', NULL, 'a1', 'l1', 'Ladder')");
    await pool.query("INSERT INTO bin_items (id, bin_id, area_id, location_id, name) VALUES ('floating', NULL, NULL, 'l1', 'Tape')");
    await expect(
      pool.query("INSERT INTO bin_items (id, bin_id, area_id, location_id, name) VALUES ('both', 'b1', 'a1', 'l1', 'X')"),
    ).rejects.toThrow(/bin_items_bin_xor_area/);

    await pool.query("INSERT INTO item_checkouts (id, item_id, origin_bin_id, origin_area_id, location_id, checked_out_by) VALUES ('c3', 'loose', NULL, 'a1', 'l1', 'u1')");

    await pool.query("DELETE FROM areas WHERE id = 'a1'");
    expect((await pool.query("SELECT bin_id, area_id FROM bin_items WHERE id = 'loose'")).rows[0]).toEqual({ bin_id: null, area_id: null });
    expect((await pool.query("SELECT area_id FROM bins WHERE id = 'b1'")).rows[0]).toEqual({ area_id: null });
  });

  it('cascades a hard delete from a parent bin to its children', async () => {
    const pool = await oldDatabase('cascade');
    await upgrade(pool);
    await pool.query("INSERT INTO bins (id, short_code, location_id, name, parent_bin_id) VALUES ('child', 'DDDDDD', 'l1', 'Screws', 'b1')");
    await pool.query("DELETE FROM bins WHERE id = 'b1'");
    expect((await pool.query("SELECT id FROM bins WHERE id = 'child'")).rows).toEqual([]);
  });

  it('is idempotent: running the migration again changes nothing', async () => {
    const pool = await oldDatabase('idem');
    await upgrade(pool);
    const before = await describeTable(pool, 'bin_items');
    await pool.query("DELETE FROM schema_migrations WHERE name = '0015_nested_boxes'");
    await runPostgresMigrations(pool, migrations);
    expect(await describeTable(pool, 'bin_items')).toEqual(before);
  });

  it('produces the same table shapes, constraints and indexes as a fresh install', async () => {
    const upgraded = await oldDatabase('shape_up');
    await upgrade(upgraded);

    const fresh = await isolatedPool('shape_fresh');
    await fresh.query(NEW_SCHEMA);
    await fresh.query(NESTED_BOXES_INDEXES_PG);

    for (const table of ['bins', 'bin_items', 'item_checkouts', 'shopping_list_items']) {
      expect(await describeTable(upgraded, table), table).toEqual(await describeTable(fresh, table));
    }
  });
});
