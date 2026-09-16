// Whether the status card's "also apply to future weeks" box starts checked.
// Browser-only, like lib/last-group.ts — a per-device habit, not account state.

/**
 * The last answer given to "also apply to future weeks".
 *
 * The card remounts for every block you hover, so a box that always started
 * unchecked meant re-checking it for each of the five classes you are dropping
 * for the term. People answer this question the same way for a whole sitting,
 * so the box remembers the last answer and offers it as the default.
 *
 * Deliberately not synced and not per-class: it is the position a control was
 * left in, and it is always visible above the buttons before anything is saved.
 */
const KEY = "meetup.repeat.future";

/** False when nothing is stored, or when the browser won't say (Safari private). */
export function readRepeatPreference(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberRepeatPreference(repeat: boolean): void {
  try {
    window.localStorage.setItem(KEY, repeat ? "1" : "0");
  } catch {
    // A browser that won't remember just starts unchecked every time.
  }
}
