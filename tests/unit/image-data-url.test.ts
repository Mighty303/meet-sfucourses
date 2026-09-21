import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_DATA_URL_CHARS,
  isValidImageDataUrl,
} from "@/lib/image-data-url";

describe("stored image data URLs", () => {
  it("accepts the raster formats produced by the browser canvas", () => {
    expect(isValidImageDataUrl("data:image/png;base64,YQ==")).toBe(true);
    expect(isValidImageDataUrl("data:image/jpeg;base64,YWI=")).toBe(true);
    expect(isValidImageDataUrl("data:image/webp;base64,YWJj")).toBe(true);
  });

  it("refuses remote URLs, SVG, malformed base64, and non-strings", () => {
    expect(isValidImageDataUrl("https://example.com/group.png")).toBe(false);
    expect(isValidImageDataUrl("data:image/svg+xml;base64,YQ==")).toBe(false);
    expect(isValidImageDataUrl("data:image/png;base64,not valid!")).toBe(false);
    expect(isValidImageDataUrl(null)).toBe(false);
  });

  it("caps the encoded value before it reaches the database", () => {
    const prefix = "data:image/png;base64,";
    const oversized = prefix + "A".repeat(MAX_IMAGE_DATA_URL_CHARS - prefix.length + 1);
    expect(isValidImageDataUrl(oversized)).toBe(false);
  });
});
