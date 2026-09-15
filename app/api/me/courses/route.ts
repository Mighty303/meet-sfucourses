import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isClassNumber, isTermCode } from "@/lib/sfu";
import { addUserCourse, listUserCourses, removeUserCourse } from "@/lib/user-courses";

/**
 * Your own schedule for a term, edited without going through a group.
 *
 * Deliberately not under /api/groups/[code]/ — the row it writes belongs to the
 * user, and reaching it through a group was what made joining one a
 * prerequisite for having a schedule at all. There is no membership check here
 * because there is nothing to check: the session decides whose rows these are,
 * so you can only ever write your own.
 *
 * The reply shape matches the group-scoped route next door, so CoursePicker
 * doesn't have to care which of the two answered it.
 */

/** Both guards at once — every handler needs the same two facts from the URL. */
function readTarget(url: string): { term: string; classNumber: string | null } | null {
  const params = new URL(url).searchParams;
  const term = params.get("term");
  if (!isTermCode(term)) return null;
  const classNumber = params.get("classNumber");
  return { term, classNumber: isClassNumber(classNumber) ? classNumber : null };
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.appUserId) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }

  const target = readTarget(req.url);
  if (!target) return NextResponse.json({ error: "term is required" }, { status: 400 });

  return NextResponse.json({
    term: target.term,
    classNumbers: await listUserCourses(session.appUserId, target.term),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.appUserId) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }

  // `null` is valid JSON, so .catch() alone isn't enough — a body of "null"
  // parses fine and then throws on destructuring, turning a malformed request
  // into a 500 instead of the 400 below.
  const body = (await req.json().catch(() => null)) ?? {};
  const { term, classNumber } = body as { term?: unknown; classNumber?: unknown };
  if (!isTermCode(term)) {
    return NextResponse.json({ error: "term is required" }, { status: 400 });
  }
  if (!isClassNumber(classNumber)) {
    return NextResponse.json({ error: "classNumber is required" }, { status: 400 });
  }

  await addUserCourse(session.appUserId, term, classNumber);
  return NextResponse.json({ classNumbers: await listUserCourses(session.appUserId, term) });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.appUserId) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }

  // In the query string, not a body — DELETE bodies aren't reliably forwarded.
  const target = readTarget(req.url);
  if (!target) return NextResponse.json({ error: "term is required" }, { status: 400 });
  if (!target.classNumber) {
    return NextResponse.json({ error: "classNumber is required" }, { status: 400 });
  }

  await removeUserCourse(session.appUserId, target.term, target.classNumber);
  return NextResponse.json({
    classNumbers: await listUserCourses(session.appUserId, target.term),
  });
}
