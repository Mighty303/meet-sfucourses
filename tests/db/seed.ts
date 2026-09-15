// Shared seeding for the DB suite: the mocked-email people, and a term dump in
// the cache so nothing reaches for the network mid-test.

import { getDb } from "@/lib/db";
import { upsertUser, type AppUser } from "@/lib/users";
import { PEOPLE, type TestPerson } from "../fixtures/people";
import { SAMPLE_TERM, TERM_SAMPLE } from "../fixtures/term-sample";

export async function seedUsers(): Promise<Record<string, AppUser>> {
  const out: Record<string, AppUser> = {};
  for (const p of PEOPLE) {
    out[p.key] = await upsertUser({ googleSub: p.googleSub, email: p.email, name: p.name, image: null });
  }
  return out;
}

/**
 * Put the committed term dump in sections_cache so ensureFreshTerm is satisfied.
 * It only checks fetched_at, never the payload, so this keeps the whole suite
 * off the network while still exercising the real SQL that reads the JSONB.
 */
export async function seedTermCache(term = SAMPLE_TERM): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO meetup.sections_cache (term, payload, fetched_at)
    VALUES (${term}, ${JSON.stringify(TERM_SAMPLE)}::jsonb, NOW())
    ON CONFLICT (term) DO UPDATE
      SET payload = EXCLUDED.payload, fetched_at = EXCLUDED.fetched_at
  `;
}

/** Two real class numbers out of the fixture that actually meet on campus. */
export function scheduledClassNumbers(count = 2): string[] {
  const found: string[] = [];
  for (const course of TERM_SAMPLE) {
    for (const s of course.sections) {
      if (s.schedules.some((x) => x.days.trim() && x.startTime && x.campus.trim())) found.push(s.classNumber);
      if (found.length === count) return found;
    }
  }
  throw new Error("fixture has too few scheduled sections");
}

export function person(key: string): TestPerson {
  return PEOPLE.find((p) => p.key === key)!;
}
