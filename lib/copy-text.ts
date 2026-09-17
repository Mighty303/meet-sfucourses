/**
 * Put a string on the system clipboard in a way that works on iOS Safari.
 *
 * `navigator.clipboard.writeText` is missing or permission-gated on a lot of
 * mobile browsers. The old call sites used optional chaining past a missing
 * `clipboard` object and then painted "Copied" anyway — so the button looked
 * successful while the pasteboard never changed. Mobile Safari still honours
 * a synchronous `textarea` + `document.execCommand("copy")` path when it runs
 * inside the user gesture that opened the click handler; that is the fallback
 * below. When the Clipboard API is absent, the fallback must run before this
 * function awaits anything, or the gesture token is gone and the copy fails
 * silently again.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;

  // No Clipboard API (common on older iOS / insecure contexts): stay sync.
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return copyWithExecCommand(text);
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // writeText rejected — try the gesture-friendly path before giving up.
    return copyWithExecCommand(text);
  }
}

/**
 * Synchronous copy used when the Clipboard API is unavailable or rejected.
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
  field.style.position = "fixed";
  field.style.top = "0";
  field.style.left = "0";
  field.style.width = "1px";
  field.style.height = "1px";
  field.style.padding = "0";
  field.style.border = "none";
  field.style.outline = "none";
  field.style.boxShadow = "none";
  field.style.background = "transparent";
  field.style.opacity = "0";

  document.body.appendChild(field);

  const range = document.createRange();
  range.selectNodeContents(field);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  field.setSelectionRange(0, text.length);
  field.focus();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    selection?.removeAllRanges();
    document.body.removeChild(field);
  }
  return copied;
}
