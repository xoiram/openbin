import { defineConfig } from 'vitest/config';

// Tests that need a real PostgreSQL via DATABASE_URL (`*.postgres.integration.test.ts`); the CI
// `postgres` job runs them. The older `pg-*.integration.test.ts` suite is separate: it expects a
// local database on port 5433 (see src/db/__tests__/pg-setup.ts) and is not run by CI.
export default defineConfig({
  test: {
    include: ['src/**/*.postgres.integration.test.{ts,tsx}'],
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
