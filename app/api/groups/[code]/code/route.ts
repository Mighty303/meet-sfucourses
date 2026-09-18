import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { findGroup, isGroupOwner, regenerateGroupCode } from "@/lib/groups";

/**
 * Rotate the group's invite code. The old `/g/{code}` stops working the moment
 * this succeeds — that is the whole feature, for when a link got forwarded past
 * the people it was meant for.
 *
 * POST rather than PATCH: there is no body naming a desired code (we mint one),
 * and doing it twice is not idempotent — each call burns another code.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const group = await findGroup(code.toUpperCase());
  if (!group) {
    return NextResponse.json({ error: "group not found" }, { status: 404 });
  }

  const session = await auth();
  if (!(await isGroupOwner(group.id, session?.appUserId ?? null))) {
    return NextResponse.json(
      { error: "only the group admin can regenerate the invite link" },
      { status: 403 }
    );
  }

  const nextCode = await regenerateGroupCode(group.id);
  return NextResponse.json({ code: nextCode });
}
