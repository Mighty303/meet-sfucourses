import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { countDoors } from "@/lib/account-link";
import { listMembershipsForUser } from "@/lib/groups";
import { listUserCourseTerms } from "@/lib/user-courses";
import { MAX_AVATAR_CHARS, deleteAccount, getUser, isValidAvatar, setAvatar } from "@/lib/users";

/**
 * Everything the profile page needs: the identity, every group row, and every
 * term there's a schedule saved for.
 *
 * `terms` is not derivable from `memberships` any more. Courses can be added at
 * /courses before joining anything, so a term can have a schedule and no group
 * — and bucketing the profile page by memberships alone would hide it.
 *
 * `doors` counts credentials across this account and its tombstones, so a linked
 * SFU on a folded-in row still hides the “Link your SFU ID” CTA.
 */
export async function GET() {
  const session = await auth();
  if (!session?.appUserId) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }

  const [user, memberships, terms, doorCounts] = await Promise.all([
    getUser(session.appUserId),
    listMembershipsForUser(session.appUserId),
    listUserCourseTerms(session.appUserId),
    countDoors(session.appUserId),
  ]);
  if (!user) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }
  const doors = {
    google: doorCounts.google > 0,
    password: doorCounts.password > 0,
    sfu: doorCounts.sfu > 0,
  };
  return NextResponse.json({ user, memberships, terms, doors });
}

/**
 * Change the picture. `avatar` is a data URL the browser produced by
 * downscaling the chosen file; `null` drops back to the Google one.
 */
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.appUserId) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  if (!("avatar" in body)) {
    return NextResponse.json({ error: "avatar is required" }, { status: 400 });
  }

  const { avatar } = body;
  if (avatar !== null && !isValidAvatar(avatar)) {
    return NextResponse.json(
      {
        error:
          typeof avatar === "string" && avatar.length > MAX_AVATAR_CHARS
            ? "that picture is too big"
            : "that isn't an image we can store",
      },
      { status: 400 }
    );
  }

  await setAvatar(session.appUserId, avatar);
  return NextResponse.json({ avatar });
}

/**
 * Delete the signed-in account. Irreversible: groups they were in lose their
 * row, schedules and attendance go with them, and any group they admined is
 * handed off first so it isn't left ownerless.
 */
export async function DELETE() {
  const session = await auth();
  if (!session?.appUserId) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }

  await deleteAccount(session.appUserId);
  return NextResponse.json({ ok: true });
}
