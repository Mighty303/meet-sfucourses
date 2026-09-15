/**
 * Splits a migration file into the statements to send one at a time.
 *
 * neon-http accepts exactly one statement per call, so the file has to be cut
 * up before it can be run. The cut has to respect what a semicolon means where
 * it appears: inside a `--` comment, a quoted string or a `$$ … $$` body it is
 * ordinary text, and only at the top level does it end a statement. The first
 * version of this split on `/;\s*\n/`, which was fine until a migration needed
 * a DO block — the semicolons inside one would have torn it into fragments
 * that are each a syntax error.
 *
 * Comment-only chunks are dropped rather than sent, because a file usually
 * ends with one and an empty statement is an error.
 */
export function splitStatements(sql) {
  const statements = [];
  let start = 0;
  let i = 0;

  const push = (text) => {
    const trimmed = text.trim();
    if (trimmed && !isOnlyComments(trimmed)) statements.push(trimmed);
  };

  while (i < sql.length) {
    const rest = sql.slice(i);

    if (rest.startsWith("--")) {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? sql.length : nl + 1;
      continue;
    }
    if (rest.startsWith("/*")) {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }
    if (sql[i] === "'" || sql[i] === '"') {
      i = endOfQuoted(sql, i);
      continue;
    }
    const tag = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(rest)?.[0];
    if (tag) {
      const end = sql.indexOf(tag, i + tag.length);
      i = end === -1 ? sql.length : end + tag.length;
      continue;
    }
    if (sql[i] === ";") {
      push(sql.slice(start, i));
      i += 1;
      start = i;
      continue;
    }
    i += 1;
  }

  // Whatever follows the last semicolon. A file that ends without one still
  // has a statement to run.
  push(sql.slice(start));
  return statements;
}

/** Index just past a '…' or "…" literal, where a doubled quote is an escape. */
function endOfQuoted(sql, open) {
  const quote = sql[open];
  let i = open + 1;
  while (i < sql.length) {
    if (sql[i] !== quote) {
      i += 1;
      continue;
    }
    if (sql[i + 1] === quote) {
      i += 2;
      continue;
    }
    return i + 1;
  }
  return sql.length;
}

function isOnlyComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .every((line) => line.trim() === "" || line.trim().startsWith("--"));
}
