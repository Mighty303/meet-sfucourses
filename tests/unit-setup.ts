// The unit suite's promise is that it needs nothing: no network, no database,
// no credentials. Enforced rather than documented — a test that quietly starts
// reaching for api.sfucourses.com would otherwise pass locally and fail in CI,
// or worse, pass in CI and be slow and flaky forever.
//
// Anything that genuinely needs the network belongs in tests/smoke.

import { beforeAll } from "vitest";

beforeAll(() => {
  globalThis.fetch = (input: RequestInfo | URL) => {
    throw new Error(
      `the unit suite must not use the network (tried to fetch ${String(input)}). ` +
        `Use a fixture, or move the test to tests/smoke.`
    );
  };
});
