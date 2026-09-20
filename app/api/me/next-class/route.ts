import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { campusTerm, type ClassMeeting } from "@/lib/class-status";
import { sectionIndexForClassNumbers } from "@/lib/sections";
import { parseDays, toMinutes } from "@/lib/sfu";
import { listUserCourses } from "@/lib/user-courses";

/** Weekly meetings for the signed-in person's current SFU term. The browser
 * decides which one is active so the status can change without another request. */
export async function GET() {
  const session = await auth();
  if (!session?.appUserId) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  const term = campusTerm(new Date());
  const classNumbers = await listUserCourses(session.appUserId, term);
  if (classNumbers.length === 0) return NextResponse.json({ meetings: [] });

  const index = await sectionIndexForClassNumbers(term, classNumbers);
  const meetings: ClassMeeting[] = [];
  for (const classNumber of classNumbers) {
    const hit = index.get(classNumber);
    if (!hit) continue;
    const { course, section } = hit;
    for (const schedule of section.schedules) {
      const days = parseDays(schedule.days);
      const start = toMinutes(schedule.startTime);
      const end = toMinutes(schedule.endTime);
      if (days.length === 0 || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      meetings.push({
        course: `${course.dept} ${course.number}`,
        title: course.title,
        section: `${section.section} ${schedule.sectionCode}`.trim(),
        campus: schedule.campus,
        days,
        startDate: schedule.startDate,
        endDate: schedule.endDate,
        start,
        end,
      });
    }
  }
  return NextResponse.json({ meetings });
}
