import { DAYS, type DayKey } from "./sfu";

export interface ClassMeeting {
  course: string;
  title: string;
  section: string;
  campus: string;
  days: DayKey[];
  startDate: string;
  endDate: string;
  start: number;
  end: number;
}

export interface ClassOccurrence extends ClassMeeting {
  date: string;
}

const CAMPUS_TIME_ZONE = "America/Vancouver";

/** Calendar date and clock time at SFU, independent of the viewer's device zone. */
export function campusNow(now: Date): { date: string; year: number; month: number; minutes: number; seconds: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CAMPUS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const year = value("year");
  const month = value("month");
  const day = value("day");
  return {
    date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    year,
    month,
    minutes: value("hour") * 60 + value("minute"),
    seconds: value("second"),
  };
}

export function campusTerm(now: Date): string {
  const { year, month } = campusNow(now);
  return `${year}-${month <= 4 ? "spring" : month <= 8 ? "summer" : "fall"}`;
}

/** Find active meetings and the next start in the coming week. Date limits
 * keep a section from appearing before it begins or after it ends. */
export function classStatus(meetings: ClassMeeting[], now: Date): {
  current: ClassOccurrence[];
  next: ClassOccurrence | null;
} {
  const { date, minutes } = campusNow(now);
  const startDate = new Date(`${date}T12:00:00Z`);
  const current: ClassOccurrence[] = [];
  let next: ClassOccurrence | null = null;

  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(startDate);
    candidate.setUTCDate(startDate.getUTCDate() + offset);
    const day = DAYS[(candidate.getUTCDay() + 6) % 7];
    const candidateDate = candidate.toISOString().slice(0, 10);

    for (const meeting of meetings) {
      if (!meeting.days.includes(day) || candidateDate < meeting.startDate || candidateDate > meeting.endDate) continue;
      const occurrence = { ...meeting, date: candidateDate };
      if (offset === 0 && meeting.start <= minutes && minutes < meeting.end) {
        current.push(occurrence);
      } else if ((offset > 0 || meeting.start > minutes) && (!next || candidateDate < next.date || (candidateDate === next.date && meeting.start < next.start))) {
        next = occurrence;
      }
    }
  }

  return { current: current.sort((a, b) => a.end - b.end), next };
}
