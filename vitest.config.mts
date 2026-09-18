import { defineConfig } from "vitest/config";

// Four suites, split by what they need to run rather than by what they cover.
// `unit` is the default because it needs nothing: no network, no database, no
// credentials. The other three are opt-in so a plain `npm test` can never fail
// for a reason that has nothing to do with the code.
//
// `migrations` and `db` both talk to Postgres and are still separate, because
// they answer different questions. `db` branches from production and re-runs
// the migrations over a copy of the real schema: does this upgrade a database
// that already exists. `migrations` starts from nothing on a throwaway
// Postgres: does this build one. Neither substitutes for the other, and only
// `migrations` runs without a Neon key — which is what makes it the one that
// covers pull requests from forks.
//
// `resolve.tsconfigPaths` is what makes the `@/*` alias work, so a test file
// imports exactly the way app code does. The `unit` project takes .tsx as
// well as .ts, so a component can be checked by rendering it rather than only
// through the functions underneath it.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.{ts,tsx}"],
          environment: "node",
          // Enforces the suite's one promise: it needs nothing to run.
          setupFiles: ["tests/unit-setup.ts"],
        },
      },
      {
        // The live API is somebody else's server: slow, and occasionally down.
        test: {
          name: "smoke",
          include: ["tests/smoke/**/*.test.ts"],
          environment: "node",
          testTimeout: 30_000,
          retry: 1,
        },
      },
      {
        // One Neon branch, one schema — files must not race each other on it.
        test: {
          name: "db",
          include: ["tests/db/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/db/setup.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
        },
      },
      {
        // One Postgres, and these tests drop the schema out from under each
        // other on purpose, so the same no-parallelism rule applies. Pulling
        // the image on a cold machine is the slow part, not the SQL.
        test: {
          name: "migrations",
          include: ["tests/migrations/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/migrations/setup.ts"],
          fileParallelism: false,
          testTimeout: 60_000,
        },
      },
    ],
  },
});
