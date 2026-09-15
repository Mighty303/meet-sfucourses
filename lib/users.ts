import { casEmail } from "./cas";
import { getDb } from "./db";

export interface AppUser {
  id: number;
  email: string;
  name: string | null;
  /** Google's picture, refreshed on every sign-in. */
  image: string | null;
  /** A picture they chose instead. Null means Google's is the one to show. */
  avatar: string | null;
}

/** What to actually render for a user: their own picture, else Google's. */
export function avatarOf(user: { image: string | null; avatar: string | null }): string | null {
  return user.avatar ?? user.image;
}

/**
 * A data URL small enough to live in a row and safe enough to put in an <img>.
 * Only the three formats a canvas will encode, and only base64 — anything else
 * (an http URL, an SVG that could carry script) is refused.
 */
export const MAX_AVATAR_CHARS = 200_000;

export function isValidAvatar(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_AVATAR_CHARS &&
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
  );
}

/**
 * Keyed on Google's `sub`, not the email — an email can be reassigned within a
 * workspace, the subject id can't. Name and picture are refreshed on each
 * sign-in so a changed Google avatar follows through.
 */
export async function upsertUser(input: {
  googleSub: string;
  email: string;
  name: string | null;
  image: string | null;
}): Promise<AppUser> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO meetup.users (google_sub, email, name, image)
    VALUES (${input.googleSub}, ${input.email}, ${input.name}, ${input.image})
    ON CONFLICT (google_sub) DO UPDATE
      SET email = EXCLUDED.email,
          name = EXCLUDED.name,
          image = EXCLUDED.image,
          updated_at = NOW()
    RETURNING id, email, name, image, avatar
  `;
  return rows[0] as AppUser;
}

export async function getUser(id: number): Promise<AppUser | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, email, name, image, avatar FROM meetup.users WHERE id = ${id}
  `;
  return (rows[0] as AppUser) ?? null;
}

/** Pass null to drop back to the Google picture. */
export async function setAvatar(id: number, avatar: string | null): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE meetup.users
    SET avatar = ${avatar}, updated_at = NOW()
    WHERE id = ${id}
  `;
}

/**
 * The password half of sign-in. Separate from upsertUser because the two doors
 * are deliberately separate rows — see 007_password_auth.sql for why an
 * unverified address is never allowed to meet a Google one.
 */

/** Trimmed and lowercased, which is how the partial unique index sees it. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Deliberately loose. Anything stricter rejects addresses that are perfectly
 * valid, and since nothing is mailed to this it is a label on the account
 * rather than a channel — the shape only has to rule out obvious typos.
 */
export function isEmailShaped(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export interface PasswordUser extends AppUser {
  passwordHash: string | null;
}

/** Password accounts only — a Google row with the same address is not this one. */
export async function getPasswordUserByEmail(email: string): Promise<PasswordUser | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, email, name, image, avatar, password_hash
    FROM meetup.users
    WHERE LOWER(email) = ${normalizeEmail(email)} AND password_hash IS NOT NULL
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id as number,
    email: row.email as string,
    name: (row.name as string | null) ?? null,
    image: (row.image as string | null) ?? null,
    avatar: (row.avatar as string | null) ?? null,
    passwordHash: (row.password_hash as string | null) ?? null,
  };
}

/**
 * Null when the address is already a password account, so the caller can say so
 * without a second round trip. ON CONFLICT rather than a check-then-insert,
 * because two people registering the same address at once is exactly the race a
 * check-then-insert loses — the partial unique index is what actually decides.
 */
export async function createPasswordUser(input: {
  email: string;
  name: string | null;
  passwordHash: string;
}): Promise<AppUser | null> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO meetup.users (email, name, password_hash)
    VALUES (${normalizeEmail(input.email)}, ${input.name}, ${input.passwordHash})
    ON CONFLICT (LOWER(email)) WHERE password_hash IS NOT NULL DO NOTHING
    RETURNING id, email, name, image, avatar
  `;
  return (rows[0] as AppUser) ?? null;
}

/**
 * The SFU door. Keyed on the computing ID rather than the address, for the same
 * reason upsertUser is keyed on Google's `sub`: the identifier CAS vouches for
 * is the ID, and the address is a thing derived from it.
 *
 * A row of its own, never reconciled with a Google or password row that shares
 * the address — 007 explains why two doors meeting silently is the wrong shape,
 * and that argument doesn't change just because this door is the trustworthy
 * one. Linking is something someone signed in should choose, not something a
 * sign-in does to them.
 *
 * `name` starts as the computing ID so defaultMemberName() has something to put
 * on a group roster; they can rename themselves there or on the profile page.
 *
 * UPDATE-then-INSERT rather than ON CONFLICT: Neon/Postgres expression unique
 * indexes are brittle to match from ON CONFLICT (parens, predicate, planner
 * quirks), and a missed match is exactly `step=db` after CAS succeeded. Two
 * statements plus a unique-violation retry cover the concurrent-create race
 * without needing the conflict target to name the index expression.
 */
export async function upsertSfuUser(input: {
  username: string;
  authtype: string | null;
}): Promise<AppUser> {
  const sql = getDb();
  const username = input.username.toLowerCase();
  const email = casEmail(username);

  const updated = await sql`
    UPDATE meetup.users
    SET sfu_authtype = ${input.authtype},
        updated_at = NOW()
    WHERE LOWER(sfu_username) = ${username}
    RETURNING id, email, name, image, avatar
  `;
  if (updated[0]) return updated[0] as AppUser;

  try {
    const inserted = await sql`
      INSERT INTO meetup.users (sfu_username, sfu_authtype, email, name)
      VALUES (${username}, ${input.authtype}, ${email}, ${username})
      RETURNING id, email, name, image, avatar
    `;
    const row = inserted[0] as AppUser | undefined;
    if (!row) throw new Error("upsertSfuUser returned no row");
    return row;
  } catch (err) {
    // Concurrent first sign-in: the other writer won the partial unique index.
    if (!isUniqueViolation(err)) throw err;
    const raced = await sql`
      UPDATE meetup.users
      SET sfu_authtype = ${input.authtype},
          updated_at = NOW()
      WHERE LOWER(sfu_username) = ${username}
      RETURNING id, email, name, image, avatar
    `;
    const row = raced[0] as AppUser | undefined;
    if (!row) throw err;
    return row;
  }
}

/** Postgres unique_violation — Neon surfaces it as `code` on NeonDbError. */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

/**
 * Short, non-secret classification for logs and optional `dbError=` query hints.
 * Never includes connection strings, SQL, or row values.
 */
export function sfuDbErrorHint(err: unknown): string {
  if (typeof err !== "object" || err === null) return "unknown";
  const e = err as {
    code?: unknown;
    message?: unknown;
    constraint?: unknown;
    column?: unknown;
  };
  const code = typeof e.code === "string" ? e.code : "";
  const message = typeof e.message === "string" ? e.message.toLowerCase() : "";

  if (code === "42703" || (message.includes("does not exist") && message.includes("column"))) {
    return "missing_column";
  }
  if (code === "42P01" || (message.includes("does not exist") && message.includes("relation"))) {
    return "missing_table";
  }
  // ON CONFLICT target that does not match any unique index (historical path).
  if (code === "42P10" || message.includes("no unique or exclusion constraint")) {
    return "conflict_target";
  }
  if (code === "23505") return "unique_violation";
  if (code === "23514") return "check_violation";
  if (code === "23502") return "not_null";
  if (code) return code;
  if (message.includes("fetch failed") || message.includes("connecting to database")) {
    return "unreachable";
  }
  return "unknown";
}
