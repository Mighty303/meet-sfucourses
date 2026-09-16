// Which group's calendar you were last reading. Browser-only, like
// lib/guest-schedule.ts — the server has nowhere to put it that wouldn't be a
// write on every page view of the busiest route in the app.

/**
 * The code of the last group page that actually loaded.
 *
 * The nav's Calendar row has to point somewhere before you have picked a
 * group, and "your newest membership" is the wrong guess for anyone in more
 * than one: the group you want back is the one you just left, not the one you
 * joined last. Written from the group page once its state arrives, so a 404 —
 * or a group you were removed from — never becomes the place the nav sends you.
 *
 * Per-browser and deliberately not synced. It is a bookmark, not a setting: the
 * group you read on your laptop is not necessarily the one you want on your
 * phone, and either way the group list is one press away.
 */
const KEY = "meetup.last.group";

/** Null when nothing is stored, or when the browser won't say (Safari private). */
export function readLastGroup(): string | null {
  try {
    const code = window.localStorage.getItem(KEY);
    return code && code.length > 0 ? code : null;
  } catch {
    return null;
  }
}

export function rememberLastGroup(code: string): void {
  try {
    window.localStorage.setItem(KEY, code);
  } catch {
    // A browser that won't remember just gets the group list instead.
  }
}

/** Dropped when the group itself goes, so the nav can't point at a 404. */
export function forgetLastGroup(code: string): void {
  try {
    if (window.localStorage.getItem(KEY) === code) window.localStorage.removeItem(KEY);
  } catch {
    // Nothing readable means nothing to forget.
  }
}
