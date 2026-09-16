import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { findGroup, isGroupOwner, transferOwnership } from "@/lib/groups";

/**
 * Hand the group to another member. A transfer rather than a grant, because
 * `groups.owner_user_id` holds one id — see 004_group_owner.sql — so the person
 * doing this stops being the admin the moment it succeeds.
 *
 * PUT, not POST: the body names the state the column should end in, and doing
 * it twice with the same body is the same group either way.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const group = await findGroup(code.toUpperCase());
  if (!group) {
    return NextResponse.json({ error: "group not found" }, { status: 404 });
  }

  const session = await auth();
  const appUserId = session?.appUserId ?? null;
  if (appUserId === null || !(await isGroupOwner(group.id, appUserId))) {
    return NextResponse.json(
      { error: "only the group admin can hand the group over" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  if (!Number.isInteger(body.memberId)) {
    return NextResponse.json({ error: "memberId is required" }, { status: 400 });
  }

  const result = await transferOwnership(group.id, body.memberId, appUserId);
  if (result === "not-a-member") {
    return NextResponse.json({ error: "member not in this group" }, { status: 404 });
  }
  if (result === "no-account") {
    return NextResponse.json(
      { error: "they need an account before they can be the admin" },
      { status: 409 }
    );
  }
  // Lost a race with another transfer: whoever won it is the admin now, and
  // this caller is not the one to decide where the group goes next.
  if (result === "not-owner") {
    return NextResponse.json(
      { error: "only the group admin can hand the group over" },
      { status: 403 }
    );
  }

  return NextResponse.json({ memberId: body.memberId });
}
