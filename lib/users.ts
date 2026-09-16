import { casEmail } from "./cas";
import { getDb } from "./db";

export interface AppUser {
  id: number;
  /**
   * The account's own address. After a merge this is the @sfu.ca one whenever
   * an SFU credential is involved — CAS derived it from a computing ID, which
   * makes it the only address here anybody has vouched for.
   */
  email: string;
  name: string | null;
  /** Google's picture, refreshed on every sign-in. */
  image: string | null;
  /** A picture they chose instead. Null means Google's is the one to show. */
  avatar: string | null;
  /**
   * Whether this row has a Google credential at all — which, after a merge, is
   * no longer the same question as which door the session came through. The
   * admin allowlist turns on it; see lib/admin.ts.
   */
  hasGoogle: boolean;
  /**
   * The address Google vouched for, kept apart from `email` so that linking an
   * SFU account doesn't take the admin allowlist's key away with it.
   */
  googleEmail: string | null;
}

/**
 * Every query below RETURNs the same seven columns — `id, email, name, image,
 * avatar, google_email, (google_sub IS NOT NULL) AS has_google` — spelled out
 * each time rather than shared as a constant, because a tagged template turns
 * an interpolated string into a bind parameter rather than into SQL.
 */
function toAppUser(row: Record<string, unknown>): AppUser {
  return {
    id: row.id as number,
    email: row.email as string,
    name: (row.name as string | null) ?? null,
    image: (row.image as string | null) ?? null,
    avatar: (row.avatar as string | null) ?? null,
    hasGoogle: Boolean(row.has_google),
    googleEmail: (row.google_email as string | null) ?? null,
  };
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
 *
 * Two things it does not do, both of them consequences of merging (011).
 *
 * It does not overwrite `email` on a row that holds an SFU credential. The
 * verified @sfu.ca address is the merged account's address, and refreshing it
 * from the Google profile on every sign-in would quietly undo that. Google's
 * own address goes to `google_email`, where lib/admin.ts reads it.
 *
 * And the row it conflicts onto may be a tombstone that kept this `sub` — the
 * merge only moves a credential into a gap — so the account it belongs to is
 * resolved before returning. Without that, signing in through the second of
 * two linked Google accounts would hand back a dead id and an empty schedule.
 */
export async function upsertUser(input: {
  googleSub: string;
  email: string;
  name: string | null;
  image: string | null;
  /** Google's `email_verified` claim. Unknown is not verified. */
  emailVerified?: boolean | null;
  /** Google's `hd` claim: the Workspace tenant, absent on personal accounts. */
  hd?: string | null;
}): Promise<AppUser> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO meetup.users
      (google_sub, email, name, image, google_email, google_email_verified, google_hd)
    VALUES (
      ${input.googleSub}, ${input.email}, ${input.name}, ${input.image},
      ${input.email}, ${input.emailVerified ?? null}, ${input.hd ?? null}
    )
    ON CONFLICT (google_sub) DO UPDATE
      SET email = CASE
            WHEN meetup.users.sfu_username IS NULL THEN EXCLUDED.email
            ELSE meetup.users.email
          END,
          name = EXCLUDED.name,
          image = EXCLUDED.image,
          google_email = EXCLUDED.google_email,
          google_email_verified = EXCLUDED.google_email_verified,
          google_hd = EXCLUDED.google_hd,
          updated_at = NOW()
    RETURNING id, email, name, image, avatar, google_email, merged_into,
              (google_sub IS NOT NULL) AS has_google
  `;
  return resolveAccount(rows[0] as Record<string, unknown>);
}

/**
 * The account a row belongs to: itself, or — if it is a tombstone — the row it
 * was merged into. One hop and no loop: merge_accounts() re-points any
 * tombstone aimed at the row it absorbs, so merged_into is always terminal.
 */
async function resolveAccount(row: Record<string, unknown>): Promise<AppUser> {
  const mergedInto = (row.merged_into as number | null) ?? null;
  if (mergedInto === null) return toAppUser(row);
  const account = await getUser(mergedInto);
  if (!account) throw new Error(`user ${row.id} points at missing account ${mergedInto}`);
  return account;
}

/**
 * Follows a tombstone, which is what keeps a session cookie minted before a
 * merge working on somebody's other device: the id in it is still a row, and
 * that row still says which account it is.
 */
export async function getUser(id: number): Promise<AppUser | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT a.id, a.email, a.name, a.image, a.avatar, a.google_email,
           (a.google_sub IS NOT NULL) AS has_google
    FROM meetup.users u
    JOIN meetup.users a ON a.id = COALESCE(u.merged_into, u.id)
    WHERE u.id = ${id}
  `;
  return rows[0] ? toAppUser(rows[0] as Record<string, unknown>) : null;
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

/**
 * Password accounts only — a Google row with the same address is not this one.
 *
 * The hash and the identity can come from two different rows. A merge leaves a
 * password credential on the tombstone whenever the surviving account already
 * had one of its own, so the row that holds the hash to check may not be the
 * row to sign anybody in as. Verify against the match, return the account.
 */
export async function getPasswordUserByEmail(email: string): Promise<PasswordUser | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, email, name, image, avatar, google_email, password_hash, merged_into,
           (google_sub IS NOT NULL) AS has_google
    FROM meetup.users
    WHERE LOWER(email) = ${normalizeEmail(email)} AND password_hash IS NOT NULL
  `;
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const account = await resolveAccount(row);
  return { ...account, passwordHash: (row.password_hash as string | null) ?? null };
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
    RETURNING id, email, name, image, avatar, google_email,
              (google_sub IS NOT NULL) AS has_google
  `;
  return rows[0] ? toAppUser(rows[0] as Record<string, unknown>) : null;
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
 *
 * `created` says whether this was the computing ID's first ever sign-in, which
 * is the only moment worth offering a link: a brand new, empty SFU account
 * whose address already belongs to somebody's Google row is exactly the split
 * issue #31 describes, and the callback offers to fold it before they have
 * built anything on top of it.
 */
export async function upsertSfuUser(input: {
  username: string;
  authtype: string | null;
}): Promise<{ user: AppUser; created: boolean }> {
  const sql = getDb();
  const username = input.username.toLowerCase();
  const email = casEmail(username);

  const updated = await sql`
    UPDATE meetup.users
    SET sfu_authtype = ${input.authtype},
        updated_at = NOW()
    WHERE LOWER(sfu_username) = ${username}
    RETURNING id, email, name, image, avatar, google_email, merged_into,
              (google_sub IS NOT NULL) AS has_google
  `;
  // Resolved like the other two doors even though a merge always moves an SFU
  // credential rather than leaving it on a tombstone — a later change to that
  // rule should not quietly turn into a signed-in-as-nobody bug.
  if (updated[0]) {
    return { user: await resolveAccount(updated[0] as Record<string, unknown>), created: false };
  }

  try {
    const inserted = await sql`
      INSERT INTO meetup.users (sfu_username, sfu_authtype, email, name)
      VALUES (${username}, ${input.authtype}, ${email}, ${username})
      RETURNING id, email, name, image, avatar, google_email,
                (google_sub IS NOT NULL) AS has_google
    `;
    const row = inserted[0] as Record<string, unknown> | undefined;
    if (!row) throw new Error("upsertSfuUser returned no row");
    return { user: toAppUser(row), created: true };
  } catch (err) {
    // Concurrent first sign-in: the other writer won the partial unique index.
    if (!isUniqueViolation(err)) throw err;
    const raced = await sql`
      UPDATE meetup.users
      SET sfu_authtype = ${input.authtype},
          updated_at = NOW()
      WHERE LOWER(sfu_username) = ${username}
      RETURNING id, email, name, image, avatar, google_email, merged_into,
                (google_sub IS NOT NULL) AS has_google
    `;
    const row = raced[0] as Record<string, unknown> | undefined;
    if (!row) throw err;
    return { user: await resolveAccount(row), created: false };
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
