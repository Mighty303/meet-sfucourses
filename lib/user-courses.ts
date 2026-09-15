import { listAttendance, resolveStatus, type AttendanceRow } from "./attendance";
import { getDb } from "./db";
import {
  busyFromCourses,
  clampWeekToTerm,
  commonFree,
  unscheduledFromCourses,
  weekDates,
  type BusyBlock,
  type FreeWindow,
  type TermBounds,
  type UnscheduledSection,
} from "./overlap";
import { sectionIndexForClassNumbers, termBoundsFor } from "./sections";
import type { DayKey } from "./sfu";

/**
 * A person's schedule for a term, with no group in the way.
 *
 * `meetup.user_courses` has been keyed on (user_id, term, class_number) since
 * 005_profile_schedule.sql, but every write reached it through a member row —
 * `addMemberCourse` in lib/groups.ts joins members to groups purely to learn
 * which term to file the section under. That made a group a prerequisite for
 * saying what you're enrolled in, which is backwards: the enrolment is the
 * thing you know first, and the group is what you do with it afterwards.
 *
 * Here the term is an argument instead, so the caller has to be trusted with
 * it — see isTermCode in lib/sfu.ts, which the route applies before any of
 * this runs.
 *
 * Its own file rather than lib/users.ts (identity) or lib/groups.ts (groups),
 * because it is neither, and hanging it off either one is what led to the
 * member-row detour in the first place.
 */

/** The sections saved for one term, ascending so the chips never reshuffle. */
export async function listUserCourses(userId: number, term: string): Promise<string[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT class_number FROM meetup.user_courses
    WHERE user_id = ${userId} AND term = ${term}
    ORDER BY class_number
  `;
  return rows.map((r) => r.class_number as string);
}

/** Adding one you already have is a no-op, not an error — the primary key says so. */
export async function addUserCourse(
  userId: number,
  term: string,
  classNumber: string
): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO meetup.user_courses (user_id, term, class_number)
    VALUES (${userId}, ${term}, ${classNumber})
    ON CONFLICT DO NOTHING
  `;
}

/**
 * Removes it from every group you're in that term, which is the other half of
 * one schedule being shared — the same reach removeMemberCourse has always had.
 */
export async function removeUserCourse(
  userId: number,
  term: string,
  classNumber: string
): Promise<void> {
  const sql = getDb();
  await sql`
    DELETE FROM meetup.user_courses
    WHERE user_id = ${userId} AND term = ${term} AND class_number = ${classNumber}
  `;
}

export interface TermCourses {
  term: string;
  classNumbers: string[];
}

/**
 * Every term this person has saved anything in.
 *
 * The profile page used to derive its list of terms from the groups you're in,
 * which stopped being the same set the moment courses could be added before
 * joining one. Newest term first, so the one you're most likely editing is at
 * the top — string order works because the codes lead with the year and the
 * three seasons happen to sort fall, spring, summer, which they don't.
 * Ordered explicitly instead.
 */
export async function listUserCourseTerms(userId: number): Promise<TermCourses[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT term, ARRAY_AGG(class_number ORDER BY class_number) AS class_numbers
    FROM meetup.user_courses
    WHERE user_id = ${userId}
    GROUP BY term
    ORDER BY LEFT(term, 4) DESC,
             CASE SPLIT_PART(term, '-', 2)
               WHEN 'fall' THEN 3 WHEN 'summer' THEN 2 ELSE 1
             END DESC
  `;
  return rows.map((r) => ({
    term: r.term as string,
    classNumbers: r.class_numbers as string[],
  }));
}

export interface SoloStateOptions {
  week: Date;
  dayStart: number;
  dayEnd: number;
  minMinutes: number;
  days?: readonly DayKey[];
}

/**
 * A week drawn from a list of class numbers, whoever's they are.
 *
 * Everything getSoloState used to do inline, minus the two things that need an
 * account: reading the saved list, and reading attendance. What's left is a
 * pure function of the term catalogue and the numbers handed in, which is what
 * lets /api/schedule/preview answer for someone who hasn't got an account at
 * all — see components/GuestSchedule.tsx for who asks.
 */
export interface WeekSchedule {
  term: string;
  classNumbers: string[];
  busy: BusyBlock[];
  /** Gaps between these classes. One schedule, so nothing to intersect. */
  free: FreeWindow[];
  /** Class numbers this term's catalogue no longer has a section for. */
  unresolved: string[];
  unscheduled: UnscheduledSection[];
  week: string;
  termBounds: TermBounds | null;
}

export async function scheduleFor(
  term: string,
  classNumbers: string[],
  opts: SoloStateOptions & {
    /**
     * Already computed by the caller, when it needed the week dates before
     * this ran — getSoloState does, to know which days to read attendance for.
     * Undefined means "work it out"; null is a real answer meaning the term
     * has no published bounds.
     */
    bounds?: TermBounds | null;
    /**
     * Whose deviations to fold into the blocks. Absent for a guest, who has
     * none: every class then resolves to "going", which is the default anyway.
     */
    attendance?: { rows: AttendanceRow[]; userId: number };
  }
): Promise<WeekSchedule> {
  const index = await sectionIndexForClassNumbers(term, classNumbers);
  const bounds = opts.bounds !== undefined ? opts.bounds : await termBoundsFor(term);
  const dates = weekDates(clampWeekToTerm(opts.week, bounds));

  const busy = busyFromCourses(index, classNumbers, dates).map((block) => ({
    ...block,
    ...(opts.attendance
      ? resolveStatus(
          opts.attendance.rows,
          opts.attendance.userId,
          dates[block.day],
          block.classNumber ?? null
        )
      : { status: "going" as const, note: null }),
  }));

  // Skipped classes drop out inside commonFree, the same as they do for a
  // group — the gap a skipped lecture opens is as real on your own week.
  //
  // Gated on having a schedule, not on having blocks this week: a section can
  // be saved and still put nothing on these five days — an async one never
  // does, and a timetabled one doesn't outside its own date range. Those weeks
  // are wide open rather than blank, and commonFree says so, because the
  // complement of no busy time is the whole day. This is the same rule
  // getGroupState applies when it decides who counts as participating.
  const free =
    classNumbers.length === 0
      ? []
      : commonFree({
          members: [{ name: "you", busy }],
          dayStart: opts.dayStart,
          dayEnd: opts.dayEnd,
          minMinutes: opts.minMinutes,
          days: opts.days,
        });

  return {
    term,
    classNumbers,
    busy,
    free,
    unresolved: classNumbers.filter((cn) => !index.has(cn)),
    unscheduled: unscheduledFromCourses(index, classNumbers),
    week: dates.Mo,
    termBounds: bounds,
  };
}

export interface SoloState extends WeekSchedule {
  attendance: AttendanceRow[];
}

/**
 * One person's week, with no group around it.
 *
 * getGroupState answers the same question for everyone in a group at once, and
 * used to be the only way to draw a timetable at all — which meant your own
 * schedule was invisible until you joined something, even after /courses let
 * you save one. This is that function with the roster taken out: the same
 * section index, the same term clamp, the same attendance resolution, and
 * commonFree over a single schedule, where it degenerates to the gaps between
 * your own classes.
 *
 * The drawing itself is scheduleFor, which a guest shares. What is left here
 * is the two halves of it that need an account: which sections are yours, and
 * which of them you have said you aren't going to.
 *
 * Custom busy blocks (meetup.member_blocks) are left out, because those hang
 * off a member row and a person without a group hasn't got one.
 */
export async function getSoloState(
  userId: number,
  term: string,
  opts: SoloStateOptions
): Promise<SoloState> {
  const [classNumbers, bounds] = await Promise.all([
    listUserCourses(userId, term),
    termBoundsFor(term),
  ]);
  // The dates have to be settled before attendance can be read, which is why
  // the bounds are worked out here and handed down rather than inside.
  const dates = weekDates(clampWeekToTerm(opts.week, bounds));
  const rows = await listAttendance([userId], dates.Mo, dates.Su);

  const schedule = await scheduleFor(term, classNumbers, {
    ...opts,
    bounds,
    attendance: { rows, userId },
  });
  return { ...schedule, attendance: rows };
}
