// The mocked group every suite builds on.
//
// Addresses sit under the RFC 2606 reserved `.invalid` TLD, which is guaranteed
// never to resolve — so nothing here can reach a real inbox even if a test one
// day grows a mail step, and no real person's address lives in the repo.

import { MEMBER_COLORS } from "@/lib/groups";

export interface TestPerson {
  /** Stable handle for referring to them across suites. */
  key: string;
  name: string;
  email: string;
  /** Palette-only: isMemberColor rejects anything else. */
  color: string;
  /** Stands in for Google's subject id on the users row. */
  googleSub: string;
}

export const PEOPLE: readonly TestPerson[] = [
  { key: "ada", name: "Ada", email: "ada@test.invalid", color: MEMBER_COLORS[0], googleSub: "test-sub-ada" },
  { key: "bo", name: "Bo", email: "bo@test.invalid", color: MEMBER_COLORS[1], googleSub: "test-sub-bo" },
  { key: "cy", name: "Cy", email: "cy@test.invalid", color: MEMBER_COLORS[3], googleSub: "test-sub-cy" },
  { key: "dee", name: "Dee", email: "dee@test.invalid", color: MEMBER_COLORS[5], googleSub: "test-sub-dee" },
];

export function person(key: string): TestPerson {
  const found = PEOPLE.find((p) => p.key === key);
  if (!found) throw new Error(`no test person "${key}"`);
  return found;
}

/**
 * The `ZZ` prefix is the convention the old check-authz script used: it makes
 * leftover rows obvious in the real database if a teardown ever fails.
 */
export const TEST_GROUP = {
  code: "ZZVITE1",
  name: "Vitest Crew",
  term: "2025-fall",
} as const;

/** Codes the DB teardown sweeps, so a suite can add its own without editing it. */
export const TEST_CODE_PREFIX = "ZZVITE";
