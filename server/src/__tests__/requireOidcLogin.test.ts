import type { Express } from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { query } from '../db.js';
import { createApp } from '../index.js';
import { type findOrCreateOAuthUser, linkOAuthIdentity } from '../lib/oauth.js';
import { signToken } from '../middleware/auth.js';
import { createTestUser } from './helpers.js';

// ---------------------------------------------------------------------------
// A. Config validation (module-reset pattern — mirrors oidc.test.ts)
// ---------------------------------------------------------------------------

const VALID_OIDC_ENV = {
  OIDC_ISSUER_URL: 'https://idp-require.test',
  OIDC_CLIENT_ID: 'client-require',
  OIDC_CLIENT_SECRET: 'secret-require',
  BASE_URL: 'https://app.example.com',
};

function setEnv(vars: Record<string, string>) {
  for (const [k, v] of Object.entries(vars)) process.env[k] = v;
}
function clearEnv(keys: string[]) {
  for (const k of keys) delete process.env[k];
}

describe('config: REQUIRE_OIDC_LOGIN validation', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    clearEnv(['REQUIRE_OIDC_LOGIN', 'DEMO_MODE', ...Object.keys(VALID_OIDC_ENV), 'SELF_HOSTED', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']);
  });

  it('defaults to false when unset', async () => {
    const { config } = await import('../lib/config.js');
    expect(config.requireOidcLogin).toBe(false);
  });

  it('throws when no provider is configured', async () => {
    process.env.REQUIRE_OIDC_LOGIN = 'true';
    await expect(import('../lib/config.js')).rejects.toThrow(/requires at least one OAuth\/OIDC provider/);
  });

  it('imports cleanly when generic OIDC is fully configured', async () => {
    process.env.REQUIRE_OIDC_LOGIN = 'true';
    setEnv(VALID_OIDC_ENV);
    const { config } = await import('../lib/config.js');
    expect(config.requireOidcLogin).toBe(true);
  });

  it('throws when combined with DEMO_MODE=true', async () => {
    process.env.REQUIRE_OIDC_LOGIN = 'true';
    process.env.DEMO_MODE = 'true';
    setEnv(VALID_OIDC_ENV);
    await expect(import('../lib/config.js')).rejects.toThrow(/incompatible with DEMO_MODE/);
  });

  it('still throws when self-hosted and only Google is configured (Google gated off self-hosted)', async () => {
    process.env.REQUIRE_OIDC_LOGIN = 'true';
    process.env.SELF_HOSTED = 'true';
    process.env.GOOGLE_CLIENT_ID = 'g-client';
    process.env.GOOGLE_CLIENT_SECRET = 'g-secret';
    await expect(import('../lib/config.js')).rejects.toThrow(/requires at least one OAuth\/OIDC provider/);
  });

  it('imports cleanly when not self-hosted and Google is configured', async () => {
    process.env.REQUIRE_OIDC_LOGIN = 'true';
    process.env.SELF_HOSTED = 'false';
    process.env.GOOGLE_CLIENT_ID = 'g-client';
    process.env.GOOGLE_CLIENT_SECRET = 'g-secret';
    const { config } = await import('../lib/config.js');
    expect(config.requireOidcLogin).toBe(true);
  });

  afterAll(async () => {
    // vi.resetModules() clears the module registry, which orphans the shared
    // DB engine that the global setup's afterAll tries to close. Re-initialize
    // so the global teardown can shut down cleanly.
    vi.resetModules();
    const { initialize } = await import('../db/init.js');
    await initialize();
  });
});

// ---------------------------------------------------------------------------
// B. Route-level rejection when REQUIRE_OIDC_LOGIN=true
// ---------------------------------------------------------------------------

describe('password routes rejected when REQUIRE_OIDC_LOGIN=true', () => {
  let flowApp: Express;
  // vi.resetModules() + a fresh initialize() below creates a brand-new
  // in-memory DB (DATABASE_PATH=':memory:' in setup.ts) — the top-level
  // static imports of findOrCreateOAuthUser/signToken/query in this file
  // are bound to the ORIGINAL db instance and would be invisible to
  // `flowApp`. Capture fresh instances after the reset instead (mirrors
  // oidc.test.ts's `flowQuery` pattern).
  let flowFindOrCreateOAuthUser: typeof findOrCreateOAuthUser;
  let flowSignToken: typeof signToken;

  beforeAll(async () => {
    vi.resetModules();
    setEnv(VALID_OIDC_ENV);
    process.env.REQUIRE_OIDC_LOGIN = 'true';

    const { initialize } = await import('../db/init.js');
    await initialize();
    const indexModule = await import('../index.js');
    flowApp = indexModule.createApp();
    flowFindOrCreateOAuthUser = (await import('../lib/oauth.js')).findOrCreateOAuthUser;
    flowSignToken = (await import('../middleware/auth.js')).signToken;
  });

  afterAll(async () => {
    clearEnv(['REQUIRE_OIDC_LOGIN', ...Object.keys(VALID_OIDC_ENV)]);
    vi.resetModules();
    const { initialize } = await import('../db/init.js');
    await initialize();
  });

  it('POST /api/auth/login → 403', async () => {
    const res = await request(flowApp).post('/api/auth/login').send({ email: 'x@example.com', password: 'whatever' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('POST /api/auth/register → 403 even with REGISTRATION_MODE=open', async () => {
    const res = await request(flowApp).post('/api/auth/register').send({
      email: 'newuser@example.com', password: 'TestPass123!', displayName: 'New User',
      acceptedTos: true, acceptedPrivacy: true,
    });
    expect(res.status).toBe(403);
  });

  it('POST /api/auth/forgot-password → 403', async () => {
    const res = await request(flowApp).post('/api/auth/forgot-password').send({ email: 'x@example.com' });
    expect(res.status).toBe(403);
  });

  it('POST /api/auth/reset-password → 403', async () => {
    const res = await request(flowApp).post('/api/auth/reset-password').send({ token: 'bogus', newPassword: 'NewPass123!' });
    expect(res.status).toBe(403);
  });

  it('PUT /api/auth/password → 403 (authenticated OIDC-only user)', async () => {
    const { user } = await flowFindOrCreateOAuthUser({
      provider: 'oidc',
      providerUserId: `require-oidc-put-password-${Date.now()}`,
      email: `requireoidc${Date.now()}@example.com`,
      displayName: 'Require Oidc User',
    });
    const token = await flowSignToken(user);
    const res = await request(flowApp)
      .put('/api/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ newPassword: 'NewPass123!' });
    expect(res.status).toBe(403);
  });

  it('GET /api/auth/status reports passwordLoginEnabled: false', async () => {
    const res = await request(flowApp).get('/api/auth/status');
    expect(res.status).toBe(200);
    expect(res.body.passwordLoginEnabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C. Regression — flag off (default test env, static import)
// ---------------------------------------------------------------------------

describe('password routes unaffected when REQUIRE_OIDC_LOGIN is unset', () => {
  let app: Express;

  beforeEach(() => {
    app = createApp();
  });

  it('GET /api/auth/status reports passwordLoginEnabled: true', async () => {
    const res = await request(app).get('/api/auth/status');
    expect(res.status).toBe(200);
    expect(res.body.passwordLoginEnabled).toBe(true);
  });

  it('bad credentials still return 401, not 403', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'wrong' });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// D. Unlink guard: password fallback vs REQUIRE_OIDC_LOGIN
// ---------------------------------------------------------------------------

describe('unlink guard: password fallback vs REQUIRE_OIDC_LOGIN', () => {
  let flowApp: Express;
  let flowFindOrCreateOAuthUser: typeof findOrCreateOAuthUser;
  let flowLinkOAuthIdentity: typeof linkOAuthIdentity;
  let flowSignToken: typeof signToken;
  let flowQuery: typeof query;

  beforeAll(async () => {
    vi.resetModules();
    setEnv(VALID_OIDC_ENV);
    process.env.REQUIRE_OIDC_LOGIN = 'true';

    const { initialize } = await import('../db/init.js');
    await initialize();
    const indexModule = await import('../index.js');
    flowApp = indexModule.createApp();
    const oauthModule = await import('../lib/oauth.js');
    flowFindOrCreateOAuthUser = oauthModule.findOrCreateOAuthUser;
    flowLinkOAuthIdentity = oauthModule.linkOAuthIdentity;
    flowSignToken = (await import('../middleware/auth.js')).signToken;
    flowQuery = (await import('../db.js')).query;
  });

  afterAll(async () => {
    clearEnv(['REQUIRE_OIDC_LOGIN', ...Object.keys(VALID_OIDC_ENV)]);
    vi.resetModules();
    const { initialize } = await import('../db/init.js');
    await initialize();
  });

  it('blocks unlinking the last login method even though hasPassword is true, because password login is disabled', async () => {
    const { user } = await flowFindOrCreateOAuthUser({
      provider: 'oidc',
      providerUserId: `unlink-guard-single-${Date.now()}`,
      email: `unlinksingle${Date.now()}@example.com`,
      displayName: 'Unlink Guard Single',
    });
    // Simulate a leftover password hash from before REQUIRE_OIDC_LOGIN was set.
    await flowQuery("UPDATE users SET password_hash = 'leftover-hash' WHERE id = $1", [user.id]);
    const token = await flowSignToken(user);

    const res = await request(flowApp)
      .delete('/api/auth/oauth/link/oidc')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(422);
  });

  it('allows unlinking when a second provider is linked', async () => {
    const { user } = await flowFindOrCreateOAuthUser({
      provider: 'oidc',
      providerUserId: `unlink-guard-multi-${Date.now()}`,
      email: `unlinkmulti${Date.now()}@example.com`,
      displayName: 'Unlink Guard Multi',
    });
    await flowQuery("UPDATE users SET password_hash = 'leftover-hash' WHERE id = $1", [user.id]);
    await flowLinkOAuthIdentity({
      userId: user.id,
      provider: 'google',
      providerUserId: `unlink-guard-multi-google-${Date.now()}`,
      email: user.email,
    });
    const token = await flowSignToken(user);

    const res = await request(flowApp)
      .delete('/api/auth/oauth/link/oidc')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('unlink guard baseline: REQUIRE_OIDC_LOGIN off', () => {
  let app: Express;

  beforeEach(() => {
    app = createApp();
  });

  it('allows unlinking the last provider when the user has a usable password', async () => {
    const { user } = await createTestUser(app, { email: `unlinkbaseline${Date.now()}@example.com` });
    await linkOAuthIdentity({
      userId: user.id,
      provider: 'google',
      providerUserId: `unlink-baseline-google-${Date.now()}`,
      email: user.email,
    });
    const token = await signToken(user);

    const res = await request(app)
      .delete('/api/auth/oauth/link/google')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
