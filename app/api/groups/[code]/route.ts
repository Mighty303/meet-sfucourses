import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  deleteGroup,
  findGroup,
  getGroupState,
  isGroupOwner,
  listMembers,
  renameGroup,
  setGroupImage,
} from "@/lib/groups";
import { MAX_IMAGE_DATA_URL_CHARS, isValidImageDataUrl } from "@/lib/image-data-url";
import { toMinutes } from "@/lib/sfu";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const group = await findGroup(code.toUpperCase());
  if (!group) {
    return NextResponse.json({ error: "group not found" }, { status: 404 });
  }

  const q = new URL(req.url).searchParams;

  // The group and who is in it, and nothing that needs SFU's timetable. What
  // the settings page reads: renaming somebody, or leaving, has to work in a
  // term whose sections aren't published yet — the week below 502s there.
  if (q.get("view") === "roster") {
    return NextResponse.json({ group, members: await listMembers(group.id) });
  }

  const week = q.get("week") ? new Date(`${q.get("week")}T12:00:00`) : new Date();

  // Resolving the week needs the term's sections, and a term SFU has not
  // published yet makes that fetch throw — which took the whole group page
  // down with a 500, for a group anyone can create a year ahead. It is an
  // upstream gap rather than a bad request, and it answers the way the course
  // lookup has always answered it.
  try {
    const state = await getGroupState(group, {
      week: Number.isNaN(week.getTime()) ? new Date() : week,
      dayStart: toMinutes(q.get("dayStart") ?? "08:00"),
      dayEnd: toMinutes(q.get("dayEnd") ?? "22:00"),
      minMinutes: Number(q.get("minMinutes") ?? 60),
    });
    return NextResponse.json(state);
  } catch {
    return NextResponse.json({ error: "course data is unavailable" }, { status: 502 });
  }
}

/** Group identity is admin-managed because every member sees the same values. */
export async function PATCH(
  req: Request,
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
      { error: "only the group admin can change this group" },
      { status: 403 }
    );
  }

  const parsed: unknown = await req.json().catch(() => ({}));
  const body = parsed && typeof parsed === "object"
    ? parsed as Record<string, unknown>
    : {};
  const hasName = Object.prototype.hasOwnProperty.call(body, "name");
  const hasImage = Object.prototype.hasOwnProperty.call(body, "image");
  if (!hasName && !hasImage) {
    return NextResponse.json({ error: "name or image is required" }, { status: 400 });
  }

  let name: string | undefined;
  if (hasName) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    // Same cap as creation, so a rename can't hold more than the form allows.
    name = body.name.trim().slice(0, 120);
  }

  let image: string | null | undefined;
  if (hasImage) {
    const candidate: unknown = body.image;
    if (candidate !== null && !isValidImageDataUrl(candidate)) {
      return NextResponse.json(
        {
          error:
            typeof candidate === "string" && candidate.length > MAX_IMAGE_DATA_URL_CHARS
              ? "that picture is too big"
              : "that isn't an image we can store",
        },
        { status: 400 }
      );
    }
    image = candidate;
  }

  await Promise.all([
    name === undefined ? Promise.resolve() : renameGroup(group.id, name),
    image === undefined ? Promise.resolve() : setGroupImage(group.id, image),
  ]);
  return NextResponse.json({ name, image });
}

/**
 * Deleting takes every member's schedule with it, so it's the group admin's
 * alone — the person who created it. Members leave; only the admin can end it.
 */
export async function DELETE(
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
      { error: "only the group admin can delete this group" },
      { status: 403 }
    );
  }

  await deleteGroup(group.id);
  return new NextResponse(null, { status: 204 });
}
