// The invite button used to call `navigator.clipboard?.writeText` and paint
// "Copied" regardless. On iOS the clipboard object is often missing, so the
// optional chain was a no-op and the pasteboard never changed. Awaiting
// writeText first was also wrong: on some Chromium builds the promise never
// settles, so the button looked dead. These tests pin the order the helper
// now takes — execCommand first, Clipboard API only as fallback. The unit
// suite is a plain Node environment, so the DOM pieces are stubbed.

import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText, copyWithExecCommand } from "@/lib/copy-text";

function stubDom(execCommand: () => boolean) {
  const field = {
    value: "",
    contentEditable: "false",
    readOnly: true,
    tabIndex: 0,
    style: {} as Record<string, string>,
    setAttribute: vi.fn(),
    setSelectionRange: vi.fn(),
    select: vi.fn(),
    focus: vi.fn(),
  };
  const body = {
    appendChild: vi.fn(),
    removeChild: vi.fn(),
  };

  vi.stubGlobal("window", {});
  vi.stubGlobal("document", {
    body,
    createElement: vi.fn(() => field),
    execCommand: vi.fn(execCommand),
  });

  return { field, body };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("copyWithExecCommand", () => {
  it("selects the text and reports what execCommand returned", () => {
    const { field, body } = stubDom(() => true);
    expect(copyWithExecCommand("https://example.com/g/abc")).toBe(true);
    expect(field.value).toBe("https://example.com/g/abc");
    expect(field.select).toHaveBeenCalled();
    expect(field.setSelectionRange).toHaveBeenCalledWith(0, "https://example.com/g/abc".length);
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(body.appendChild).toHaveBeenCalledWith(field);
    expect(body.removeChild).toHaveBeenCalledWith(field);
  });

  it("returns false when execCommand throws", () => {
    const { body, field } = stubDom(() => {
      throw new Error("denied");
    });
    expect(copyWithExecCommand("nope")).toBe(false);
    expect(body.removeChild).toHaveBeenCalledWith(field);
  });
});

describe("copyText", () => {
  it("prefers execCommand even when the Clipboard API is available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubDom(() => true);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(copyText("hello")).resolves.toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back to writeText when execCommand fails", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubDom(() => false);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(copyText("fallback")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("fallback");
  });

  it("returns false when both paths fail", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    stubDom(() => false);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(copyText("nope")).resolves.toBe(false);
  });

  it("succeeds via execCommand when clipboard is missing", async () => {
    stubDom(() => true);
    vi.stubGlobal("navigator", {});
    await expect(copyText("ios")).resolves.toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith("copy");
  });
});
