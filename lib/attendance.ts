// Reading and writing attendance deviations. The meaning of a status lives in
// ./attendance-status, which the client shares; this file is the server half.

import { getDb } from "./db";
import { type AttendanceRow, type AttendanceStatus } from "./attendance-status";

export * from "./attendance-status";

function toRow(row: Record<string, unknown>): AttendanceRow {
  return {
    userId: row.user_id as number,
    // node-postgres hands back a Date for a DATE column; the whole app compares
    // dates as YYYY-MM-DD strings, so it gets normalised here rather than at
    // each of the three call sites.
    onDate: toDateString(row.on_date),
    classNumber: (row.class_number as string | null) ?? null,
    status: row.status as AttendanceStatus,
    note: (row.note as string | null) ?? null,
  };
}

function toDateString(value: unknown): string {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  return String(value).slice(0, 10);
}

/**
 * Every deviation these people recorded inside a date range, in one query, so
 * the group read doesn't grow a round-trip per member.
 */
export async function listAttendance(
  userIds: number[],
  from: string,
  to: string
): Promise<AttendanceRow[]> {
  if (userIds.length === 0) return [];
  const sql = getDb();
  const rows = await sql`
    SELECT user_id, on_date, class_number, status, note
    FROM meetup.attendance
    WHERE user_id = ANY(${userIds}::int[])
      AND on_date BETWEEN ${from}::date AND ${to}::date
  `;
  return rows.map(toRow);
}

/**
 * Write one deviation. Two branches rather than one statement because the
 * uniqueness is enforced by two partial indexes, and ON CONFLICT has to name
 * the matching predicate to use one.
 */
export async function setAttendance(
  userId: number,
  onDate: string,
  classNumber: string | null,
  status: AttendanceStatus,
  note: string | null
): Promise<void> {
  const sql = getDb();
  if (classNumber === null) {
    await sql`
      INSERT INTO meetup.attendance (user_id, on_date, class_number, status, note)
      VALUES (${userId}, ${onDate}::date, NULL, ${status}, ${note})
      ON CONFLICT (user_id, on_date) WHERE class_number IS NULL
      DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note, updated_at = NOW()
    `;
    return;
  }
  await sql`
    INSERT INTO meetup.attendance (user_id, on_date, class_number, status, note)
    VALUES (${userId}, ${onDate}::date, ${classNumber}, ${status}, ${note})
    ON CONFLICT (user_id, on_date, class_number) WHERE class_number IS NOT NULL
    DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note, updated_at = NOW()
  `;
}

/** Back to the default. Deleting rather than writing "going" keeps it sparse. */
export async function clearAttendance(
  userId: number,
  onDate: string,
  classNumber: string | null
): Promise<void> {
  const sql = getDb();
  if (classNumber === null) {
    await sql`
      DELETE FROM meetup.attendance
      WHERE user_id = ${userId} AND on_date = ${onDate}::date AND class_number IS NULL
    `;
    return;
  }
  await sql`
    DELETE FROM meetup.attendance
    WHERE user_id = ${userId} AND on_date = ${onDate}::date
      AND class_number = ${classNumber}
  `;
}

/** Is there a whole-day row on this date? Decides whether an explicit "going"
 * on one class is a deviation worth storing or just the default restated. */
export async function hasDayStatus(userId: number, onDate: string): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`
    SELECT 1 FROM meetup.attendance
    WHERE user_id = ${userId} AND on_date = ${onDate}::date AND class_number IS NULL
  `;
  return rows.length > 0;
}
