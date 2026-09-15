import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listMembershipsForUser } from "@/lib/groups";
import { listUserCourseTerms } from "@/lib/user-courses";
import { MAX_AVATAR_CHARS, getUser, isValidAvatar, setAvatar } from "@/lib/users";

/**
 * Everything the profile page needs: the identity, every group row, and every
 * term there's a schedule saved for.
 *
 * `terms` is not derivable from `memberships` any more. Courses can be added at
 * /courses before joining anything, so a term can have a schedule and no group
 * — and bucketing the profile page by memberships alone would hide it.
 */
export async function GET() {
  const session = await auth();
  if (!session?.appUserId) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }

  const [user, memberships, terms] = await Promise.all([
    getUser(session.appUserId),
    listMembershipsForUser(session.appUserId),
    listUserCourseTerms(session.appUserId),
  ]);
  if (!user) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }
  return NextResponse.json({ user, memberships, terms });
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
