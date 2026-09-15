import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  BURST_WINDOW_MINUTES,
  EMAIL_MAX,
  MESSAGE_MAX,
  isPlausibleEmail,
  overBurstLimit,
  readPath,
  saveFeedback,
} from "@/lib/feedback";

/**
 * Sending feedback. Open to everyone, signed in or not — see the comment at the
 * top of db/migrations/009_feedback.sql for why that is the point rather than
 * an oversight.
 *
 * Being open means being throttled. Two limits, because there are two kinds of
 * sender: an account can be counted exactly, in SQL; an anonymous visitor can
 * only be counted per instance, in memory, which a determined flooder gets
 * around by waiting for a cold start. That is accepted. This is a text box on a
 * timetable app, not a comment section — the limits exist so a stuck retry loop
 * or someone leaning on the button can't fill the table, and the real backstop
 * is that an admin can see whatever lands.
 */

/** Anonymous senders, by address, and the last time each one wrote. */
const lastAnonymous = new Map<string, number>();
const ANONYMOUS_INTERVAL_MS = 30_000;
const MAX_TRACKED = 5_000;

function anonymousTooSoon(ip: string, now: number): boolean {
  const last = lastAnonymous.get(ip);
  return last !== undefined && now - last < ANONYMOUS_INTERVAL_MS;
}

function rememberAnonymous(ip: string, now: number): void {
  // Bounded, same shape as lib/last-seen.ts: drop everything already past its
  // interval, and if that frees nothing, start over rather than grow forever.
  if (lastAnonymous.size >= MAX_TRACKED) {
    for (const [key, at] of lastAnonymous) {
      if (now - at >= ANONYMOUS_INTERVAL_MS) lastAnonymous.delete(key);
    }
    if (lastAnonymous.size >= MAX_TRACKED) lastAnonymous.clear();
  }
  lastAnonymous.set(ip, now);
}

/**
 * Whoever the proxy says sent this. Only the first hop is ours to trust — the
 * rest of x-forwarded-for is whatever the client sent — and even that is only
 * used as a throttle key here, never stored.
 */
function senderKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "write something first" }, { status: 400 });
  }
  if (message.length > MESSAGE_MAX) {
    return NextResponse.json(
      { error: `keep it under ${MESSAGE_MAX} characters` },
      { status: 400 }
    );
  }

  // Optional, so blank is fine; present but nonsense is worth saying out loud,
  // since the whole reason to type it is wanting an answer back.
  let email: string | null = null;
  if (typeof body.email === "string" && body.email.trim()) {
    const typed = body.email.trim().slice(0, EMAIL_MAX);
    if (!isPlausibleEmail(typed)) {
      return NextResponse.json({ error: "that email looks off" }, { status: 400 });
    }
    email = typed;
  }

  const session = await auth();
  const userId = session?.appUserId ?? null;
  const now = Date.now();
  const key = senderKey(req);

  if (userId) {
    if (await overBurstLimit(userId)) {
      return NextResponse.json(
        { error: `that's a lot at once, try again in ${BURST_WINDOW_MINUTES} minutes` },
        { status: 429 }
      );
    }
  } else if (anonymousTooSoon(key, now)) {
    return NextResponse.json({ error: "give it a moment, then send again" }, { status: 429 });
  }

  await saveFeedback({ userId, email, message, path: readPath(body.path) });

  // Only after the write, so a failed insert doesn't cost the person their
  // next thirty seconds as well as their message.
  if (!userId) rememberAnonymous(key, now);

  return NextResponse.json({ ok: true }, { status: 201 });
}
