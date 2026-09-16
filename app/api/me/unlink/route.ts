import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { countDoors, unlinkDoor, type Door } from "@/lib/account-link";

const DOORS: Door[] = ["google", "password", "sfu"];

/**
 * Drop one way of signing in to this account.
 *
 * The reversible half of linking, and the honest answer to "can I undo a
 * merge?": no, but you can stop a door opening this account. The rows stay
 * folded — nothing would bring back an attendance entry that lost a conflict.
 *
 * Refused when it would leave no way in at all. users_has_credential is the
 * backstop, but a constraint violation is a 500 and this deserves a sentence.
 * Doors on tombstones count: they still open this account, which is the whole
 * point of keeping them there.
 */
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.appUserId) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const door = body?.door as Door;
  if (!DOORS.includes(door)) {
    return NextResponse.json({ error: "door must be google, password or sfu" }, { status: 400 });
  }

  const doors = await countDoors(session.appUserId);
  if (doors[door] === 0) {
    return NextResponse.json({ error: "that sign-in isn't on this account" }, { status: 404 });
  }
  if (DOORS.reduce((n, d) => n + doors[d], 0) === doors[door]) {
    return NextResponse.json(
      { error: "that's the only way into this account — add another sign-in first" },
      { status: 409 }
    );
  }

  await unlinkDoor(session.appUserId, door);
  return NextResponse.json({ door, removed: doors[door] });
}
