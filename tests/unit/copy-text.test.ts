// The invite button used to call `navigator.clipboard?.writeText` and paint
// "Copied" regardless. On iOS the clipboard object is often missing, so the
// optional chain was a no-op and the pasteboard never changed. These tests
// pin the two paths the helper now takes. The unit suite is a plain Node
// environment, so the DOM pieces are stubbed rather than rendered.

import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText, copyWithExecCommand } from "@/lib/copy-text";

function stubDom(execCommand: () => boolean) {
  const field = {
    value: "",
    contentEditable: "false",
    readOnly: true,
    style: {} as Record<string, string>,
    setSelectionRange: vi.fn(),
    focus: vi.fn(),
  };
  const body = {
    appendChild: vi.fn(),
    removeChild: vi.fn(),
  };
  const selection = {
    removeAllRanges: vi.fn(),
    addRange: vi.fn(),
  };

  vi.stubGlobal("window", {
    getSelection: () => selection,
  });
  vi.stubGlobal("document", {
    body,
    createElement: vi.fn(() => field),
    createRange: vi.fn(() => ({ selectNodeContents: vi.fn() })),
    execCommand: vi.fn(execCommand),
  });

  return { field, body, selection };
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
  it("uses the Clipboard API when it is available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(copyText("hello")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back to execCommand when clipboard is missing", async () => {
    stubDom(() => true);
    vi.stubGlobal("navigator", {});
    await expect(copyText("fallback")).resolves.toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith("copy");
  });

  it("falls back to execCommand when writeText rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    stubDom(() => true);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(copyText("retry")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalled();
    expect(document.execCommand).toHaveBeenCalledWith("copy");
  });
});
