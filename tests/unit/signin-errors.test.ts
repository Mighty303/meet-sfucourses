import { describe, expect, it } from "vitest";
import { signInError } from "@/lib/signin-errors";

describe("signInError", () => {
  it("says nothing when nothing failed", () => {
    expect(signInError({})).toBeNull();
    expect(signInError({ step: "db", dbError: "missing_column" })).toBeNull();
  });

  it("words the SFU steps, and names the column on a db failure", () => {
    expect(signInError({ error: "sfu", step: "ticket" })).toContain("only good once");
    expect(
      signInError({ error: "sfu", step: "db", dbError: "missing_column", dbColumn: "google_email" })
    ).toContain("(missing_column: google_email)");
  });

  it("answers Auth.js codes, Configuration being the one mobile hits", () => {
    expect(signInError({ error: "Configuration" })).toContain("handoff cookie");
    expect(signInError({ error: "AccessDenied" })).toContain("refused or cancelled");
  });

  it("falls back rather than echoing an unknown code", () => {
    const unknown = signInError({ error: "PwnedByQueryString" });
    expect(unknown).toBe("Sign-in didn't complete. Start again below.");
    expect(unknown).not.toContain("PwnedByQueryString");
    expect(signInError({ error: "sfu", step: "nonsense" })).toContain("didn't complete");
  });

  it("does not read through to Object.prototype", () => {
    expect(signInError({ error: "constructor" })).toBe("Sign-in didn't complete. Start again below.");
    expect(signInError({ error: "sfu", step: "toString" })).toContain("didn't complete");
  });

  it("drops a classification or column that isn't a plain identifier", () => {
    const base = signInError({ error: "sfu", step: "db" });
    expect(signInError({ error: "sfu", step: "db", dbError: "<script>" })).toBe(base);
    expect(
      signInError({ error: "sfu", step: "db", dbError: "missing_column", dbColumn: "a b; DROP" })
    ).toBe(`${base} (missing_column)`);
  });
});
