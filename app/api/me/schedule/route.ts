import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { currentTermCode, isTermCode, toMinutes } from "@/lib/sfu";
import { getSoloState } from "@/lib/user-courses";

/**
 * Your own week, drawn from your own saved sections.
 *
 * The group route next door answers this for a roster; this one answers it for
 * one person and needs no group to do it — which is the whole point, since a
 * schedule saved at /courses used to have nowhere to be seen until you joined
 * something. Same query parameters as the group route, so the page paging
 * through weeks works the same way on both.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.appUserId) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }

  const q = new URL(req.url).searchParams;
  const term = q.get("term");
  const week = q.get("week") ? new Date(`${q.get("week")}T12:00:00`) : new Date();

  // A term the upstream API has never heard of — next summer, say, which the
  // switcher offers before SFU publishes it — makes fetchTermSections throw.
  // That is an upstream gap, not a fault in the request, so it answers the way
  // the course lookup next door does rather than as a 500.
  try {
    const state = await getSoloState(
      session.appUserId,
      isTermCode(term) ? term : currentTermCode(),
      {
        week: Number.isNaN(week.getTime()) ? new Date() : week,
        dayStart: toMinutes(q.get("dayStart") ?? "08:00"),
        dayEnd: toMinutes(q.get("dayEnd") ?? "22:00"),
        minMinutes: Number(q.get("minMinutes") ?? 60),
      }
    );
    return NextResponse.json(state);
  } catch {
    return NextResponse.json({ error: "course data is unavailable" }, { status: 502 });
  }
}
