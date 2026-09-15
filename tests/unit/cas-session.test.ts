import { describe, expect, it } from "vitest";
import { casSessionCookieName } from "@/lib/cas-session";

describe("casSessionCookieName", () => {
  it("uses the Auth.js __Secure- prefix on https", () => {
    expect(casSessionCookieName(true)).toBe("__Secure-authjs.session-token");
  });

  it("drops the prefix on http so localhost can keep a session", () => {
    expect(casSessionCookieName(false)).toBe("authjs.session-token");
  });
});
