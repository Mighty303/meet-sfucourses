import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  clearAttendance,
  hasDayStatus,
  isAttendanceStatus,
  setAttendance,
  setAttendanceSeries,
} from "@/lib/attendance";

/**
 * Not under /api/groups/[code]/ on purpose. A status belongs to the person, not
 * to the group they happened to set it from — marking Thursday's lecture skipped
 * is true in all three of their groups at once. So there is no membership to
 * check here: you can only ever write your own row.
 */

/** Class numbers are 3–6 digits; anything else never matches a section anyway. */
function readClassNumber(value: unknown): string | null {
  return typeof value === "string" && /^\d{3,6}$/.test(value.trim())
    ? value.trim()
    : null;
}

function readDate(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
    ? value.trim()
    : null;
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.appUserId) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  const date = readDate(body.date);
  if (!date) return NextResponse.json({ error: "date is required" }, { status: 400 });

  // Absent means the whole day; present but malformed is a mistake worth saying
  // out loud, rather than quietly widening to the day.
  let classNumber: string | null = null;
  if (body.classNumber !== undefined && body.classNumber !== null) {
    classNumber = readClassNumber(body.classNumber);
    if (!classNumber) {
      return NextResponse.json({ error: "classNumber is required" }, { status: 400 });
    }
  }

  if (!isAttendanceStatus(body.status)) {
    return NextResponse.json({ error: "not a status we know" }, { status: 400 });
  }

  // Same cap as the column, so a note can't hold more than the form allows.
  const note =
    typeof body.note === "string" && body.note.trim()
      ? body.note.trim().slice(0, 80)
      : null;

  // "Going" is the default, so storing it usually says nothing. It only earns a
  // row when there's something to override — a note, or a whole-day status this
  // one class is the exception to.
  const redundant =
    body.explicit !== true &&
    body.status === "going" &&
    note === null &&
    (classNumber === null || !(await hasDayStatus(session.appUserId, date)));

  // Google Calendar's "this and following events": same weekday through `until`
  // (the term end the client already knows). Absent `until` with repeat is a
  // mistake worth refusing rather than silently writing one row.
  const repeat = body.repeat === true;
  if (repeat) {
    const until = readDate(body.until);
    if (!until) {
      return NextResponse.json({ error: "until is required to repeat" }, { status: 400 });
    }
    if (until < date) {
      return NextResponse.json({ error: "until must be on or after date" }, { status: 400 });
    }
    const count = await setAttendanceSeries(
      session.appUserId,
      date,
      until,
      classNumber,
      body.status,
      note
    );
    return NextResponse.json({
      date,
      classNumber,
      status: body.status,
      note,
      repeated: count,
    });
  }

  if (redundant) {
    await clearAttendance(session.appUserId, date, classNumber);
    return NextResponse.json({ date, classNumber, status: "going", note: null });
  }

  await setAttendance(session.appUserId, date, classNumber, body.status, note);
  return NextResponse.json({ date, classNumber, status: body.status, note });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.appUserId) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }

  // In the query string, not a body — DELETE bodies aren't reliably forwarded.
  const params = new URL(req.url).searchParams;
  const date = readDate(params.get("date"));
  if (!date) return NextResponse.json({ error: "date is required" }, { status: 400 });

  const raw = params.get("classNumber");
  let classNumber: string | null = null;
  if (raw !== null) {
    classNumber = readClassNumber(raw);
    if (!classNumber) {
      return NextResponse.json({ error: "classNumber is required" }, { status: 400 });
    }
  }

  await clearAttendance(session.appUserId, date, classNumber);
  return new NextResponse(null, { status: 204 });
}
