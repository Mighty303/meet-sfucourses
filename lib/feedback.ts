// Saving what people send from the feedback box. The rules about what may be
// sent live in ./feedback-limits, which the widget shares; this file is the
// server half. The admin portal's read of this table lives in ./metrics with
// the rest of its queries, so the page keeps issuing them in one round trip.

import { getDb } from "./db";

export * from "./feedback-limits";

export interface NewFeedback {
  userId: number | null;
  email: string | null;
  message: string;
  path: string | null;
}

export async function saveFeedback(f: NewFeedback): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO meetup.feedback (user_id, email, message, path)
    VALUES (${f.userId}, ${f.email}, ${f.message}, ${f.path})
  `;
}

/** How many a signed-in person may send before we start saying no. */
export const BURST_LIMIT = 5;
export const BURST_WINDOW_MINUTES = 10;

/**
 * Whether this account has already had its say for now.
 *
 * Counted in SQL rather than in memory, because serverless runs many instances
 * and an in-process counter would be per-instance — which is all the anonymous
 * throttle in the route can be, but not what the one limit tied to a real
 * identity should settle for.
 */
export async function overBurstLimit(userId: number): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`
    SELECT COUNT(*) AS n
    FROM meetup.feedback
    WHERE user_id = ${userId}
      AND created_at > NOW() - make_interval(mins => ${BURST_WINDOW_MINUTES})
  `;
  return Number(rows[0]?.n ?? 0) >= BURST_LIMIT;
}
