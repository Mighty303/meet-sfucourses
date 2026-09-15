// Builders so a fixture reads as a timetable rather than a wall of object
// literals. Times are "HH:MM" strings for the same reason — 630 is not a time
// anyone can check at a glance.

import type { AttendanceStatus } from "@/lib/attendance-status";
import type { BusyBlock, MemberSchedule } from "@/lib/overlap";
import { toMinutes, type DayKey } from "@/lib/sfu";

export interface BlockOptions {
  /** Null is what an online section or a custom busy block carries. */
  campus?: string | null;
  course?: string;
  detail?: string;
  classNumber?: string;
  status?: AttendanceStatus;
  note?: string | null;
}

/** Burnaby by default: the common case is a class you physically attend. */
export function block(day: DayKey, from: string, to: string, opts: BlockOptions = {}): BusyBlock {
  const { campus = "Burnaby", course = "CMPT 225", detail = "D100 LEC", ...rest } = opts;
  return {
    day,
    start: toMinutes(from),
    end: toMinutes(to),
    campus,
    label: `${course} ${detail}`.trim(),
    course,
    detail,
    ...rest,
  };
}

/** A class attended from home: still busy, but it puts nobody on campus. */
export function online(day: DayKey, from: string, to: string, opts: BlockOptions = {}): BusyBlock {
  return block(day, from, to, { campus: null, course: "CMPT 300", detail: "D200 LEC", ...opts, status: "remote" });
}

/** A campus class the member has said they aren't going to. */
export function skipped(day: DayKey, from: string, to: string, opts: BlockOptions = {}): BusyBlock {
  return block(day, from, to, { ...opts, status: "skipping" });
}

export function schedule(name: string, ...busy: BusyBlock[]): MemberSchedule {
  return { name, busy };
}

/** 08:00–22:00, the window the group page searches (app/g/[code]/page.tsx). */
export const DAY_START = toMinutes("08:00");
export const DAY_END = toMinutes("22:00");
