import { defineConfig } from "vitest/config";

// Three suites, split by what they need to run rather than by what they cover.
// `unit` is the default because it needs nothing: no network, no database, no
// credentials. The other two are opt-in so a plain `npm test` can never fail
// for a reason that has nothing to do with the code.
//
// `resolve.tsconfigPaths` is what makes the `@/*` alias work, so a test file
// imports exactly the way app code does.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
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
    ],
  },
});
