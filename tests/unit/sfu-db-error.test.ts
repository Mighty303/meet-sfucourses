import { describe, expect, it } from "vitest";
import { sfuDbErrorColumn, sfuDbErrorHint } from "@/lib/users";

describe("sfuDbErrorHint", () => {
  it("maps missing-column Postgres codes", () => {
    expect(sfuDbErrorHint({ code: "42703", message: 'column "sfu_username" does not exist' })).toBe(
      "missing_column",
    );
  });

  it("maps ON CONFLICT target mismatches", () => {
    expect(
      sfuDbErrorHint({
        code: "42P10",
        message: "there is no unique or exclusion constraint matching the ON CONFLICT specification",
      }),
    ).toBe("conflict_target");
  });

  it("maps unique violations and unknown codes safely", () => {
    expect(sfuDbErrorHint({ code: "23505" })).toBe("unique_violation");
    expect(sfuDbErrorHint({ code: "XX000" })).toBe("XX000");
    expect(sfuDbErrorHint(new Error("fetch failed"))).toBe("unreachable");
    expect(sfuDbErrorHint(null)).toBe("unknown");
  });
});

describe("sfuDbErrorColumn", () => {
  it("names the column in both shapes 42703 comes in", () => {
    // The one that cost a day: code shipped ahead of migration 011.
    expect(
      sfuDbErrorColumn({ code: "42703", message: 'column "google_email" does not exist' }),
    ).toBe("google_email");
    expect(
      sfuDbErrorColumn({
        code: "42703",
        message: 'column "sfu_username" of relation "users" does not exist',
      }),
    ).toBe("sfu_username");
  });

  it("falls back to the column field Postgres fills in", () => {
    expect(sfuDbErrorColumn({ code: "23502", column: "email", message: "null value" })).toBe(
      "email",
    );
  });

  it("drops anything that is not a plain identifier", () => {
    expect(sfuDbErrorColumn({ message: 'column "a b; DROP" does not exist' })).toBeNull();
    expect(sfuDbErrorColumn({ message: 'column "Mixed" does not exist' })).toBeNull();
    expect(sfuDbErrorColumn({ code: "23505" })).toBeNull();
    expect(sfuDbErrorColumn(null)).toBeNull();
  });
});
