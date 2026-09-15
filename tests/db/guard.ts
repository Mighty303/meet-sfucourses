// Every DB test file imports this first. If the suite is ever pointed at a
// database it did not create — someone's .env.local, production — it stops
// before the first insert rather than after it.

import { beforeAll } from "vitest";

export function requireTestBranch(): void {
  beforeAll(() => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is unset — tests/db/setup.ts should have set it");
    // The setup names every branch it makes "vitest-<timestamp>", and Neon puts
    // the branch id in the host. Anything else is somebody's real database.
    if (!/ep-|vitest/.test(url)) throw new Error("DATABASE_URL does not look like a Neon branch");
    if (process.env.NEON_BRANCH === "production" || /\bproduction\b/.test(url)) {
      throw new Error("refusing to run the database suite against production");
    }
  });
}
