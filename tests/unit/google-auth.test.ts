import { afterEach, describe, expect, it } from "vitest";
import { googleEnabled } from "@/lib/google-auth";

describe("googleEnabled", () => {
  const keys = ["AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"] as const;
  const previous = Object.fromEntries(keys.map((k) => [k, process.env[k]]));

  afterEach(() => {
    for (const k of keys) {
      if (previous[k] === undefined) delete process.env[k];
      else process.env[k] = previous[k];
    }
  });

  it("is false when either env var is missing or blank", () => {
    delete process.env.AUTH_GOOGLE_ID;
    delete process.env.AUTH_GOOGLE_SECRET;
    expect(googleEnabled()).toBe(false);

    process.env.AUTH_GOOGLE_ID = "id.apps.googleusercontent.com";
    delete process.env.AUTH_GOOGLE_SECRET;
    expect(googleEnabled()).toBe(false);

    process.env.AUTH_GOOGLE_ID = "id.apps.googleusercontent.com";
    process.env.AUTH_GOOGLE_SECRET = "   ";
    expect(googleEnabled()).toBe(false);
  });

  it("is true only when both id and secret are non-empty", () => {
    process.env.AUTH_GOOGLE_ID = "id.apps.googleusercontent.com";
    process.env.AUTH_GOOGLE_SECRET = "secret";
    expect(googleEnabled()).toBe(true);
  });
});
