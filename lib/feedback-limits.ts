// What counts as a sendable piece of feedback — no database, because the widget
// that enforces the same limits runs in the browser and pulling the neon driver
// into the client bundle to read one number would be absurd. lib/feedback.ts
// holds the writes and re-exports all of this, so server code has one import.
// Same split as ./attendance-status, for the same reason.

/** Mirrors the column, and the textarea's maxLength, so all three agree. */
export const MESSAGE_MAX = 2000;
export const EMAIL_MAX = 200;

/** Where it was sent from — stored for context, never trusted or navigated to. */
export const PATH_MAX = 200;

/**
 * Deliberately loose. This address is a way to reply, not a credential, and
 * nothing is sent to it automatically — so the only mistake worth catching is
 * the one the person would want caught ("bob@gmial" with no dot, a stray
 * space), and the cost of a false rejection is somebody who gave up on telling
 * us something. Anything shaped like an address gets through.
 */
export function isPlausibleEmail(value: string): boolean {
  return value.length <= EMAIL_MAX && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Only a path, and only one we could have served. The client sends its own
 * location, so this is attacker-controlled text that an admin will read: a
 * value like "https://evil.example" or "//evil.example" rendered in the portal
 * would be a link out, not a breadcrumb. Anything else is dropped rather than
 * rejected — the page it came from is a nicety, not the report.
 */
export function readPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  return path.slice(0, PATH_MAX);
}
