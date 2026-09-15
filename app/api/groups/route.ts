import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { addMember, addMemberCourse, createGroup, defaultMemberName } from "@/lib/groups";
import { currentTermCode, isClassNumber } from "@/lib/sfu";

/** Far past what anyone is enrolled in; only here so the body is bounded. */
const MAX_SECTIONS = 20;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { name, term, displayName, classNumbers } = body as Record<string, unknown>;
  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  // Creating signed out still works; the group then has no admin until the
  // first member joins and adopts it.
  const session = await auth();
  const group = await createGroup(
    name.trim().slice(0, 120),
    typeof term === "string" && /^\d{4}-(spring|summer|fall)$/.test(term)
      ? term
      : currentTermCode(),
    session?.appUserId ?? null
  );

  // Starting a group is joining it. Without this the creator was pushed to
  // their own group and told they weren't in it, the group was missing from
  // "Your groups" until they pressed Join, and My Schedule claimed they hadn't
  // joined anything — while they were, the whole time, its admin.
  //
  // Not in the same transaction as the insert above, and it doesn't need to be:
  // the neon HTTP driver can't interleave JS inside one, and the failure this
  // would guard against — a group with no member row — is exactly the state
  // every group was in before, which the Join button still recovers from.
  if (session?.appUserId) {
    try {
      await addMember(group.id, await defaultMemberName(session.appUserId), session.appUserId);
    } catch {
      // The group exists and they own it; joining is recoverable from the page
      // itself, so a failure here isn't worth failing the creation over.
    }
    return NextResponse.json(group, { status: 201 });
  }

  // Signed out, and they said who they are: same move, on a row nobody owns.
  //
  // A guest arrives here having already typed their week into the landing
  // page, and creating a group used to drop it — they landed on an empty grid
  // of the group they had just named, with their own schedule sitting in the
  // browser two pages back. The sections come with them instead, onto the
  // member row, where claiming the name later carries them onto the account.
  const who = typeof displayName === "string" ? displayName.trim().slice(0, 60) : "";
  if (who.length > 0) {
    try {
      const member = await addMember(group.id, who, null);
      const sections = Array.isArray(classNumbers)
        ? classNumbers.filter(isClassNumber).slice(0, MAX_SECTIONS)
        : [];
      for (const classNumber of sections) {
        await addMemberCourse(member.id, classNumber);
      }
      // The row is nobody's, so the id goes back for the browser to hold on
      // to — see readGuestMember. It is not a credential: the group page uses
      // it to know whose row is whose, and claiming still goes through a
      // session.
      return NextResponse.json({ ...group, member }, { status: 201 });
    } catch {
      // Same reasoning as above: the group is made, and the page they land on
      // can still put them in it.
    }
  }

  return NextResponse.json(group, { status: 201 });
}
