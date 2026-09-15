// What an attendance status is and what it means — no database, because the
// grid renders these in the browser and pulling the neon driver into the client
// bundle to read three labels would be absurd. lib/attendance.ts holds the
// reads and writes and re-exports all of this, so server code has one import.

export const ATTENDANCE_STATUSES = ["going", "skipping", "remote"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** Guards the column, and the API's `status` field with it. */
export function isAttendanceStatus(value: unknown): value is AttendanceStatus {
  return (
    typeof value === "string" &&
    (ATTENDANCE_STATUSES as readonly string[]).includes(value)
  );
}

export interface AttendanceRow {
  userId: number;
  /** YYYY-MM-DD. */
  onDate: string;
  /** Null means the whole day, which every class on it inherits. */
  classNumber: string | null;
  status: AttendanceStatus;
  note: string | null;
}

/**
 * What a status actually means, in one place, because three files render it.
 * `busy` is the only field the overlap maths reads: a skipped class stops
 * occupying its hour, which is the point of the feature. `onCampus` is the
 * other half — a class attended from home is still busy time, but it no longer
 * anchors that person to a campus, so it can't make a window cross-campus.
 */
export const STATUS_EFFECT: Record<
  AttendanceStatus,
  { busy: boolean; onCampus: boolean; label: string }
> = {
  going: { busy: true, onCampus: true, label: "Going" },
  skipping: { busy: false, onCampus: false, label: "Skipping" },
  // Busy only bites on a mixed day (Zoom between campus classes). A day of
  // only online classes is treated as off campus — see busyForMeetup.
  remote: { busy: true, onCampus: false, label: "Online" },
};

/**
 * The status in force for one class on one date: the class's own row if it has
 * one, otherwise the whole-day row, otherwise going.
 *
 * Takes the rows rather than querying, because the caller has already loaded a
 * week for the whole group and this runs once per block.
 */
export function resolveStatus(
  rows: AttendanceRow[],
  userId: number,
  onDate: string,
  classNumber: string | null
): { status: AttendanceStatus; note: string | null } {
  let day: AttendanceRow | null = null;
  for (const row of rows) {
    if (row.userId !== userId || row.onDate !== onDate) continue;
    // A class-level row is the most specific answer there is; nothing can
    // override it, so it can return immediately.
    if (classNumber !== null && row.classNumber === classNumber) {
      return { status: row.status, note: row.note };
    }
    if (row.classNumber === null) day = row;
  }
  return day ? { status: day.status, note: day.note } : { status: "going", note: null };
}
