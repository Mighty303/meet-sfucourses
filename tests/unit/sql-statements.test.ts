import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { splitStatements } from "@/scripts/sql-statements.mjs";

/**
 * The cut migrate.mjs makes before sending anything, tested on its own because
 * getting it wrong is not a syntax error you find at review time — it is a
 * half-statement sent to a live database.
 *
 * The case that forced this file: 007 needs a DO block, and the previous split
 * on /;\s*\n/ would have torn one into fragments at the semicolons inside it.
 */
describe("splitStatements", () => {
  it("splits on top-level semicolons", () => {
    expect(splitStatements("SELECT 1;\nSELECT 2;\n")).toEqual(["SELECT 1", "SELECT 2"]);
  });

  it("keeps a statement that ends without one", () => {
    expect(splitStatements("SELECT 1")).toEqual(["SELECT 1"]);
  });

  it("ignores a semicolon inside a line comment", () => {
    expect(splitStatements("-- one; two\nSELECT 1;\n")).toEqual(["-- one; two\nSELECT 1"]);
  });

  it("ignores a semicolon inside a block comment", () => {
    expect(splitStatements("/* a; b */ SELECT 1;\n")).toEqual(["/* a; b */ SELECT 1"]);
  });

  it("ignores a semicolon inside a string literal", () => {
    expect(splitStatements("SELECT ';';\nSELECT 2;\n")).toEqual(["SELECT ';'", "SELECT 2"]);
  });

  it("reads a doubled quote as an escape, not the end of the literal", () => {
    expect(splitStatements("SELECT 'it''s; fine';\nSELECT 2;\n")).toEqual([
      "SELECT 'it''s; fine'",
      "SELECT 2",
    ]);
  });

  it("keeps a dollar-quoted body whole", () => {
    const sql = "DO $$\nBEGIN\n  ALTER TABLE t ADD COLUMN c INT;\nEND $$;\nSELECT 1;\n";
    expect(splitStatements(sql)).toEqual([
      "DO $$\nBEGIN\n  ALTER TABLE t ADD COLUMN c INT;\nEND $$",
      "SELECT 1",
    ]);
  });

  it("handles a tagged dollar quote", () => {
    const sql = "DO $body$ SELECT 'a;b'; $body$;\nSELECT 2;\n";
    expect(splitStatements(sql)).toEqual(["DO $body$ SELECT 'a;b'; $body$", "SELECT 2"]);
  });

  it("drops a trailing comment rather than sending an empty statement", () => {
    expect(splitStatements("SELECT 1;\n\n-- done\n")).toEqual(["SELECT 1"]);
  });

  it("cuts every migration in the directory into runnable statements", () => {
    // Nothing here asserts what the SQL does — only that no file comes back as
    // one giant blob (a missed semicolon) or as a fragment starting mid-block.
    for (const file of readdirSync("db/migrations").sort()) {
      const statements = splitStatements(readFileSync(`db/migrations/${file}`, "utf8"));
      expect(statements.length, file).toBeGreaterThan(0);
      for (const stmt of statements) {
        expect(stmt, file).not.toMatch(/^(BEGIN|END)\b/);
        expect(stmt.split("$$").length % 2, `${file}: unbalanced $$ in ${stmt.slice(0, 40)}`).toBe(1);
      }
    }
  });
});
