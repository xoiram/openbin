import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { publicQrAccess } from '../migrations/0016_public_qr_access.js';
import { migrations } from '../migrations/index.js';
import { runPostgresMigrations } from '../migrations/runner.js';

// Runs against a real PostgreSQL (DATABASE_URL) in the CI `postgres` job; skipped elsewhere.
// Server unit tests run on SQLite only, so this is what exercises migration 0016 on Postgres.

const url = process.env.DATABASE_URL;
const FIXTURES = path.join(import.meta.dirname, '..', 'migrations', '__tests__', 'fixtures');
const OLD_SCHEMA = fs.readFileSync(path.join(FIXTURES, 'schema.pg.0015.sql'), 'utf-8');
const NEW_SCHEMA = fs.readFileSync(path.join(import.meta.dirname, '..', '..', '..', 'schema.pg.sql'), 'utf-8');

const schemas: string[] = [];
const pools: pg.Pool[] = [];

async function isolatedPool(name: string): Promise<pg.Pool> {
  const schema = `pq16_${name}_${Date.now()}`;
  const admin = new pg.Pool({ connectionString: url });
  await admin.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  schemas.push(schema);
  const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema},public` });
  pools.push(pool);
  return pool;
}

/** A database as it looked at migration 0015: old schema, every earlier migration recorded, real rows. */
async function oldDatabase(name: string): Promise<pg.Pool> {
  const pool = await isolatedPool(name);
  await pool.query(OLD_SCHEMA);
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  for (const m of migrations.filter((x) => x.name !== publicQrAccess.name)) {
    await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [m.name]);
  }
  await pool.query(`
    INSERT INTO users (id, display_name, email) VALUES ('u1', 'Ann', 'ann@example.com');
    INSERT INTO locations (id, name, created_by, invite_code) VALUES ('l1', 'Home', 'u1', 'AAA');
    INSERT INTO bins (id, short_code, location_id, name) VALUES ('b1', 'AAAAAA', 'l1', 'Toolbox');
  `);
  return pool;
}

async function columnsOf(pool: pg.Pool, table: string) {
  const res = await pool.query(
    `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = $1 ORDER BY column_name`,
    [table],
  );
  return res.rows;
}

afterAll(async () => {
  for (const p of pools) await p.end();
  if (!url) return;
  const admin = new pg.Pool({ connectionString: url });
  for (const s of schemas) await admin.query(`DROP SCHEMA IF EXISTS ${s} CASCADE`);
  await admin.end();
});

describe.skipIf(!url)('migration 0016_public_qr_access (PostgreSQL)', () => {
  it('adds the columns with safe defaults and keeps existing rows', async () => {
    const pool = await oldDatabase('upgrade');
    await pool.query(NEW_SCHEMA);
    await runPostgresMigrations(pool, migrations);

    const loc = (await pool.query('SELECT public_qr_access, public_qr_photos FROM locations WHERE id = $1', ['l1'])).rows[0];
    expect(loc).toEqual({ public_qr_access: false, public_qr_photos: true });
    const bin = (await pool.query('SELECT name, public_view_count, last_public_view_at FROM bins WHERE id = $1', ['b1'])).rows[0];
    expect(bin).toEqual({ name: 'Toolbox', public_view_count: 0, last_public_view_at: null });
  });

  it('is idempotent', async () => {
    const pool = await oldDatabase('idempotent');
    await pool.query(NEW_SCHEMA);
    await runPostgresMigrations(pool, migrations);
    const before = { locations: await columnsOf(pool, 'locations'), bins: await columnsOf(pool, 'bins') };

    await pool.query("DELETE FROM schema_migrations WHERE name = '0016_public_qr_access'");
    await runPostgresMigrations(pool, migrations);

    expect({ locations: await columnsOf(pool, 'locations'), bins: await columnsOf(pool, 'bins') }).toEqual(before);
  });

  it('leaves a migrated database with the same columns as a fresh install', async () => {
    const upgraded = await oldDatabase('shape');
    await upgraded.query(NEW_SCHEMA);
    await runPostgresMigrations(upgraded, migrations);

    const fresh = await isolatedPool('fresh');
    await fresh.query(NEW_SCHEMA);

    for (const table of ['locations', 'bins']) {
      expect(await columnsOf(upgraded, table), `${table} columns`).toEqual(await columnsOf(fresh, table));
    }
  });

  it('upgrades a database that never had the columns, with no schema file help', async () => {
    // Migration alone (as on an existing install whose schema file ran first and left IF NOT EXISTS tables untouched)
    const pool = await oldDatabase('migrationonly');
    await publicQrAccess.postgres?.(pool);
    const cols = (await columnsOf(pool, 'locations')).map((c) => c.column_name);
    expect(cols).toEqual(expect.arrayContaining(['public_qr_access', 'public_qr_photos']));
  });
});
