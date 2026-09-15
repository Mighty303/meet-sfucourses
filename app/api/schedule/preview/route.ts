import { NextResponse } from "next/server";
import { isClassNumber, isTermCode, toMinutes } from "@/lib/sfu";
import { scheduleFor } from "@/lib/user-courses";

/**
 * A week drawn from class numbers in the query string, for someone with no
 * account.
 *
 * /api/me/schedule answers the same question for a signed-in user by reading
 * their saved sections; this one is told what the sections are. That is the
 * whole difference, and it is what lets the landing page draw a real timetable
 * — real meeting times, real term bounds, real gaps — before anyone has signed
 * up. The sections themselves live in the browser: see lib/guest-schedule.ts.
 *
 * No auth, because there is nothing here to protect. The answer is a pure
 * function of the public SFU catalogue and the numbers handed in, the same as
 * the course lookup at /api/terms/[term]/courses, and it writes nothing.
 */

/** The picker's own ceiling is far lower; this only bounds the URL. */
const MAX_NUMBERS = 60;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;

  const term = q.get("term");
  if (!isTermCode(term)) {
    return NextResponse.json({ error: "term is required" }, { status: 400 });
  }

  // Anything that isn't a class number is dropped rather than rejected: these
  // come from localStorage, which an old version of this site may have
  // written, and one bad entry shouldn't cost someone their whole week.
  const classNumbers = (q.get("numbers") ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter(isClassNumber)
    .slice(0, MAX_NUMBERS);

  const asked = q.get("week");
  const week = asked ? new Date(`${asked}T12:00:00`) : new Date();

  try {
    const state = await scheduleFor(term, classNumbers, {
      week: Number.isNaN(week.getTime()) ? new Date() : week,
      dayStart: toMinutes(q.get("dayStart") ?? "08:00"),
      dayEnd: toMinutes(q.get("dayEnd") ?? "22:00"),
      minMinutes: Number(q.get("minMinutes") ?? 60),
    });
    // Public course data, so the edge can hold it. Ten minutes when the week
    // is implicit, because "today" moves and a stale answer would pin last
    // week across the Monday rollover; an hour when it was named outright.
    return NextResponse.json(state, {
      headers: {
        "Cache-Control": `public, s-maxage=${asked ? 3600 : 600}, stale-while-revalidate=604800`,
      },
    });
  } catch {
    // A term SFU hasn't published yet. An upstream gap rather than a fault in
    // the request, which is how the two routes next door answer it too.
    return NextResponse.json({ error: "course data is unavailable" }, { status: 502 });
  }
}
