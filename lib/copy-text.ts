/**
 * Put a string on the system clipboard in a way that works on iOS Safari.
 *
 * `navigator.clipboard.writeText` is missing or permission-gated on a lot of
 * mobile browsers, and on some Chromium builds the promise never settles at
 * all — so awaiting it first left the invite button looking dead. The older
 * `textarea` + `document.execCommand("copy")` path runs synchronously inside
 * the user gesture, which is what Mobile Safari still honours and what keeps
 * the button responsive when the Clipboard API hangs. Prefer that path; only
 * fall through to `writeText` when execCommand is unavailable or returns false.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;

  try {
    if (copyWithExecCommand(text)) return true;
  } catch {
    // Selection APIs can throw on odd documents; try writeText below.
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Synchronous copy used as the primary path so the user-gesture token is
 * still live on iOS, and so a hung Clipboard API cannot stall the button.
 * Kept separate so the selection dance can be tested without the async path.
 */
export function copyWithExecCommand(text: string): boolean {
  if (typeof document === "undefined") return false;

  const field = document.createElement("textarea");
  field.value = text;
  // iOS Safari will not select a truly readonly field. Keep it editable, but
  // off-screen and transparent — `display: none` also drops it from selection.
  field.contentEditable = "true";
  field.readOnly = false;
  field.setAttribute("aria-hidden", "true");
  field.tabIndex = -1;
  field.style.position = "fixed";
  field.style.top = "0";
  field.style.left = "0";
  field.style.width = "2em";
  field.style.height = "2em";
  field.style.padding = "0";
  field.style.border = "none";
  field.style.outline = "none";
  field.style.boxShadow = "none";
  field.style.background = "transparent";
  field.style.opacity = "0";

  document.body.appendChild(field);

  let copied = false;
  try {
    field.focus();
    field.select();
    field.setSelectionRange(0, text.length);
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    document.body.removeChild(field);
  }
  return copied;
}
