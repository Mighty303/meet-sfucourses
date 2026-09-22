import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listAttendance, resolveStatus, type AttendanceStatus } from "@/lib/attendance";
import { campusNow, campusTerm } from "@/lib/class-status";
import { getDb } from "@/lib/db";
import { campusPresence } from "@/lib/home-status";
import { sectionIndexForClassNumbers } from "@/lib/sections";
import { DAYS, formatTime, parseDays, toMinutes } from "@/lib/sfu";
import { avatarOf, getUser } from "@/lib/users";
import { listUserCourses } from "@/lib/user-courses";

interface Person {
  key: string;
  userId: number | null;
  displayName: string;
  image: string | null;
  color: string;
  isCurrentUser: boolean;
  classNumbers: Set<string>;
}

interface Occurrence {
  course: string;
  title: string;
  section: string;
  campus: string;
  classNumber: string;
  date: string;
  start: number;
  end: number;
  status: AttendanceStatus;
  selectedStatus: AttendanceStatus | null;
  note: string | null;
  updatedAt: string | null;
}

function addDays(date: string, amount: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function dayFor(date: string): (typeof DAYS)[number] {
  const value = new Date(`${date}T12:00:00Z`);
  return DAYS[(value.getUTCDay() + 6) % 7];
}

function selectedStatusFor(
  rows: { userId: number; onDate: string; classNumber: string | null; status: AttendanceStatus }[],
  userId: number,
  onDate: string,
  classNumber: string | null,
): AttendanceStatus | null {
  let day: AttendanceStatus | null = null;
  for (const row of rows) {
    if (row.userId !== userId || row.onDate !== onDate) continue;
    if (classNumber !== null && row.classNumber === classNumber) return row.status;
    if (row.classNumber === null) day = row.status;
  }
  return day;
}

function occurrencesFor(
  person: Person,
  dates: string[],
  index: Map<string, { course: { dept: string; number: string; title: string }; section: { section: string; schedules: { days: string; startTime: string; endTime: string; campus: string; startDate: string; endDate: string; sectionCode: string }[] } }>,
  attendance: { userId: number; onDate: string; classNumber: string | null; status: AttendanceStatus; note: string | null; updatedAt?: string | null }[]
): Occurrence[] {
  const out: Occurrence[] = [];
  for (const date of dates) {
    const day = dayFor(date);
    for (const classNumber of person.classNumbers) {
      const hit = index.get(classNumber);
      if (!hit) continue;
      const status = person.userId === null
        ? { status: "going" as const, note: null, updatedAt: null }
        : resolveStatus(attendance, person.userId, date, classNumber);
      for (const schedule of hit.section.schedules) {
        if (!parseDays(schedule.days).includes(day) || date < schedule.startDate || date > schedule.endDate) continue;
        const start = toMinutes(schedule.startTime);
        const end = toMinutes(schedule.endTime);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
        out.push({
          course: `${hit.course.dept} ${hit.course.number}`,
          title: hit.course.title,
          section: `${hit.section.section} ${schedule.sectionCode}`.trim(),
          campus: schedule.campus.trim(),
          classNumber,
          date,
          start,
          end,
          status: status.status,
          selectedStatus: person.userId === null ? null : selectedStatusFor(attendance, person.userId, date, classNumber),
          note: status.note,
          updatedAt: status.updatedAt ?? null,
        });
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start || a.end - b.end);
}

/** The signed-in homepage's people and current/next class snapshot. */
export async function GET() {
  const session = await auth();
  if (!session?.appUserId) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  const now = new Date();
  const { date, minutes } = campusNow(now);
  const term = campusTerm(now);
  const sql = getDb();
  const [rows, ownClassNumbers, user] = await Promise.all([
    sql`
      SELECT m.id, m.user_id, m.display_name, m.color,
             COALESCE(u.avatar, u.image) AS image,
             ce.class_number
      FROM meetup.members m
      JOIN meetup.groups g ON g.id = m.group_id AND g.term = ${term}
      LEFT JOIN meetup.users u ON u.id = m.user_id
      LEFT JOIN meetup.member_courses_effective ce ON ce.member_id = m.id
      WHERE m.user_id = ${session.appUserId}
         OR m.group_id IN (
           SELECT group_id FROM meetup.members WHERE user_id = ${session.appUserId}
         )
      ORDER BY m.id
    `,
    listUserCourses(session.appUserId, term),
    getUser(session.appUserId),
  ]);

  const people = new Map<string, Person>();
  for (const row of rows) {
    const userId = (row.user_id as number | null) ?? null;
    const key = userId === null ? `member:${row.id}` : `user:${userId}`;
    const person = people.get(key) ?? {
      key,
      userId,
      displayName: row.display_name as string,
      image: (row.image as string | null) ?? null,
      color: row.color as string,
      isCurrentUser: userId === session.appUserId,
      classNumbers: new Set<string>(),
    };
    if (row.class_number) person.classNumbers.add(row.class_number as string);
    people.set(key, person);
  }

  const selfKey = `user:${session.appUserId}`;
  const self = people.get(selfKey) ?? {
    key: selfKey,
    userId: session.appUserId,
    displayName: user?.name ?? user?.email ?? "You",
    image: user ? avatarOf(user) : null,
    color: "#0f8a6d",
    isCurrentUser: true,
    classNumbers: new Set<string>(),
  };
  for (const classNumber of ownClassNumbers) self.classNumbers.add(classNumber);
  if (user) {
    self.displayName = user.name ?? user.email;
    self.image = avatarOf(user);
  }
  people.set(selfKey, self);

  const personList = [...people.values()];
  const allClassNumbers = [...new Set(personList.flatMap((person) => [...person.classNumbers]))];
  const index = await sectionIndexForClassNumbers(term, allClassNumbers);
  const dates = Array.from({ length: 8 }, (_, offset) => addDays(date, offset));
  const userIds = personList.map((person) => person.userId).filter((id): id is number => id !== null);
  const attendance = await listAttendance([...new Set(userIds)], date, dates[dates.length - 1]);

  const ownOccurrences = occurrencesFor(self, dates, index, attendance);
  const currentClasses = ownOccurrences.filter(
    (occurrence) => occurrence.date === date && occurrence.status !== "skipping" && occurrence.start <= minutes && minutes < occurrence.end
  );
  const nextClass = ownOccurrences.find(
    (occurrence) => occurrence.status !== "skipping" && (occurrence.date !== date || occurrence.start > minutes)
  ) ?? null;

  const onCampus = personList.flatMap((person) => {
    const all = occurrencesFor(person, dates, index, attendance);
    const today = all.filter((occurrence) => occurrence.date === date);
    if (today.length === 0) return [];
    const current = today.find((occurrence) => occurrence.start <= minutes && minutes < occurrence.end) ?? null;
    const previous = [...today].reverse().find((occurrence) => occurrence.end <= minutes) ?? null;
    const next = today.find((occurrence) => occurrence.start > minutes) ?? null;
    const presence = campusPresence(
      today.map((occurrence) => ({
        start: occurrence.start,
        end: occurrence.end,
        campus: occurrence.campus,
        status: occurrence.status,
      })),
      minutes
    );
    const status = current?.status ?? (presence.campus ? "going" : "away");
    return [{
      key: person.key,
      displayName: person.displayName,
      image: person.image,
      color: person.color,
      isCurrentUser: person.isCurrentUser,
      status,
      classLabel: current
        ? `${current.course} ${current.section}`
        : presence.campus && next
          ? `Between classes · next ${next.course} ${next.section} at ${formatTime(next.start)}`
          : presence.campus
            ? "Between classes"
            : next
              ? `Next ${next.course} ${next.section} · ${formatTime(next.start)}`
              : previous
                ? `Done ${previous.course} ${previous.section} · ${formatTime(previous.end)}`
                : "No more classes today",
      statusUpdatedAt: today
        .map((occurrence) => occurrence.updatedAt)
        .filter((value): value is string => value !== null)
        .sort()
        .at(-1) ?? null,
      campus: current?.status === "remote" ? null : presence.campus ?? current?.campus ?? null,
    }];
  });

  return NextResponse.json({
    onCampus,
    currentClasses,
    nextClass,
    hasScheduledClasses: ownOccurrences.length > 0,
    refreshAt: new Date(now.getTime() + 30_000).toISOString(),
  });
}
