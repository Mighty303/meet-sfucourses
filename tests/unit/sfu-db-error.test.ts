import { describe, expect, it } from "vitest";
import { sfuDbErrorHint } from "@/lib/users";

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
