import { describe, expect, it } from "vitest";
import { generateCode } from "@/lib/groups";

/** Ambiguous 0/O/1/I are left out so a code read aloud can be retyped. */
const CODE_ALPHABET = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/;

describe("generateCode", () => {
  it("mints a 7-character invite code from the unambiguous alphabet", () => {
    const code = generateCode();
    expect(code).toHaveLength(7);
    expect(code).toMatch(CODE_ALPHABET);
  });

  it("varies across calls", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});
