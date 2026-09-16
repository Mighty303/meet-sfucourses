/**
 * Linking one person's accounts together, and folding the rows when they are.
 *
 * The proof is possession of both, never a matching address. 007 spends a page
 * on why: a password row's email is typed into a form, so anything that merged
 * on addresses alone would be a way to absorb somebody else's account by
 * registering theirs. So the shape is: signed in as A, make a challenge, go
 * and complete an ordinary sign-in as B in the same browser, come back holding
 * both halves.
 *
 * That shape is also why no door needs a link mode. Google, password and CAS
 * all sign somebody in exactly as they already do; the challenge cookie is
 * what makes the round trip mean something afterwards.
 */

import { getDb } from "./db";
import { casEmail } from "./cas";
import { getUser, type AppUser } from "./users";

/** Carries the raw token for the length of the round trip. httpOnly, Lax. */
export const LINK_COOKIE = "link-challenge";

/** Long enough to sign in somewhere else, short enough not to be left lying. */
export const LINK_MAX_AGE = 10 * 60;

/** Opaque, 32 bytes. Same shape as newCasState(), and for the same job. */
export function newLinkToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The cookie holds the token; the row holds this. A token is a bearer
 * credential for ten minutes — enough to matter, not enough to keep in the
 * clear beside every other row somebody might read.
 */
async function hashLinkToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Returns the raw token to hand to the browser; only its hash is stored. */
export async function createLinkChallenge(userId: number): Promise<string> {
  const sql = getDb();
  const token = newLinkToken();
  await sql`
    INSERT INTO meetup.link_challenges (token_hash, user_id, expires_at)
    VALUES (${await hashLinkToken(token)}, ${userId}, NOW() + INTERVAL '10 minutes')
  `;
  // Swept here rather than on a schedule: this is the only write the table
  // gets, so it is the only moment anything is known to have expired.
  await sql`DELETE FROM meetup.link_challenges WHERE expires_at < NOW() - INTERVAL '1 day'`;
  return token;
}

export interface LinkChallenge {
  id: number;
  /** The account that started the link — the one to fold together with. */
  userId: number;
}

/** Null for a token that is unknown, expired, or already spent. */
export async function readLinkChallenge(token: string): Promise<LinkChallenge | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const sql = getDb();
  const rows = await sql`
    SELECT id, user_id FROM meetup.link_challenges
    WHERE token_hash = ${await hashLinkToken(token)}
      AND consumed_at IS NULL
      AND expires_at > NOW()
  `;
  const row = rows[0];
  return row ? { id: row.id as number, userId: row.user_id as number } : null;
}

/**
 * Spend it. False means somebody else already did — a double-submitted confirm
 * or a resent request — and the caller must not merge again on the strength of
 * a challenge that has already been used once.
 */
export async function consumeLinkChallenge(id: number): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`
    UPDATE meetup.link_challenges SET consumed_at = NOW()
    WHERE id = ${id} AND consumed_at IS NULL AND expires_at > NOW()
    RETURNING id
  `;
  return rows.length > 0;
}

/**
 * The Google account whose verified address is this computing ID's, if there
 * is one — the only case where offering a link unprompted is defensible.
 *
 * Verified means Google said so, in the `email_verified` claim on the ID
 * token. NULL is not verified: rows that predate 011 have never been asked,
 * and an unasked address is exactly as good as a typed one.
 *
 * This only ever produces an *offer*. Nothing is written, and the person still
 * has to sign in to the Google account before anything folds — so being wrong
 * here costs a prompt, not an account.
 */
export async function findVerifiedGoogleAccount(sfuUsername: string): Promise<number | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT id FROM meetup.users
    WHERE google_sub IS NOT NULL
      AND google_email_verified IS TRUE
      AND LOWER(google_email) = ${casEmail(sfuUsername.toLowerCase())}
      AND merged_into IS NULL
    LIMIT 1
  `;
  return rows[0] ? (rows[0].id as number) : null;
}

/** One side of a proposed link, as far as choosing a survivor cares. */
export interface LinkSide {
  id: number;
  hasSfu: boolean;
}

export type SurvivorChoice =
  | { survivorId: number; absorbedId: number }
  | { error: "same-account" | "two-sfu-accounts" };

/**
 * Which row keeps its id.
 *
 * The SFU one, whenever exactly one side has an SFU credential. Its address is
 * derived from a computing ID that CAS checked a password for, which makes it
 * the only address on this site anybody has vouched for — and letting that row
 * survive is what puts that address on the merged account without rewriting a
 * column to get it there.
 *
 * Otherwise the initiator: the account they were sitting on when they started,
 * which is the one the confirm screen can describe as a fact rather than as a
 * rule.
 *
 * Two SFU rows is not a merge. idx_meetup_users_sfu_username means they cannot
 * share a computing ID, so they are two different people and somebody has
 * mis-clicked.
 */
export function chooseSurvivor(initiator: LinkSide, other: LinkSide): SurvivorChoice {
  if (initiator.id === other.id) return { error: "same-account" };
  if (initiator.hasSfu && other.hasSfu) return { error: "two-sfu-accounts" };
  if (other.hasSfu) return { survivorId: other.id, absorbedId: initiator.id };
  return { survivorId: initiator.id, absorbedId: other.id };
}

/** What the confirm screen shows about one of the two accounts. */
export interface AccountSummary {
  id: number;
  email: string;
  name: string | null;
  avatar: string | null;
  createdAt: string;
  doors: { google: boolean; password: boolean; sfu: boolean };
  groups: number;
  terms: number;
}

export async function describeAccount(id: number): Promise<AccountSummary | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT u.id, u.email, u.name, u.avatar, u.created_at,
           (u.google_sub IS NOT NULL) AS has_google,
           (u.password_hash IS NOT NULL) AS has_password,
           (u.sfu_username IS NOT NULL) AS has_sfu,
           (SELECT COUNT(*)::int FROM meetup.members m WHERE m.user_id = u.id) AS groups,
           (SELECT COUNT(DISTINCT c.term)::int FROM meetup.user_courses c WHERE c.user_id = u.id) AS terms
    FROM meetup.users u
    WHERE u.id = ${id} AND u.merged_into IS NULL
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id as number,
    email: row.email as string,
    name: (row.name as string | null) ?? null,
    avatar: (row.avatar as string | null) ?? null,
    createdAt: new Date(row.created_at as string).toISOString(),
    doors: {
      google: Boolean(row.has_google),
      password: Boolean(row.has_password),
      sfu: Boolean(row.has_sfu),
    },
    groups: row.groups as number,
    terms: row.terms as number,
  };
}

export interface MergePlan {
  survivor: AccountSummary;
  absorbed: AccountSummary;
  /**
   * Groups both accounts are in. Those are the only rows a merge genuinely
   * loses — one member row has to go, and its name, colour and busy blocks go
   * with it — so the confirm screen names them rather than reporting a count.
   */
  sharedGroups: { code: string; name: string }[];
}

export type PlanResult = MergePlan | { error: SurvivorError };

export type SurvivorError = "same-account" | "two-sfu-accounts" | "missing-account";

/**
 * Everything the confirm screen needs, and nothing written. Read-only on
 * purpose: the person has to be able to look at this and walk away.
 */
export async function planMerge(initiatorId: number, otherId: number): Promise<PlanResult> {
  const [initiator, other] = await Promise.all([
    describeAccount(initiatorId),
    describeAccount(otherId),
  ]);
  if (!initiator || !other) return { error: "missing-account" };

  const choice = chooseSurvivor(
    { id: initiator.id, hasSfu: initiator.doors.sfu },
    { id: other.id, hasSfu: other.doors.sfu }
  );
  if ("error" in choice) return { error: choice.error };

  const survivor = choice.survivorId === initiator.id ? initiator : other;
  const absorbed = choice.absorbedId === initiator.id ? initiator : other;

  const sql = getDb();
  const rows = await sql`
    SELECT g.code, g.name
    FROM meetup.members a
    JOIN meetup.members b ON b.group_id = a.group_id
    JOIN meetup.groups g ON g.id = a.group_id
    WHERE a.user_id = ${survivor.id} AND b.user_id = ${absorbed.id}
    ORDER BY g.name
  `;
  return {
    survivor,
    absorbed,
    sharedGroups: rows.map((r) => ({ code: r.code as string, name: r.name as string })),
  };
}

export type Door = "google" | "password" | "sfu";

/**
 * How many rows of this account hold each door, counting its tombstones.
 *
 * Counting rather than testing, because an account can hold two of the same
 * door: a merge only moves a credential into a gap, so the second Google
 * account of a linked pair keeps its sub on the tombstone, where it goes on
 * opening this account through merged_into.
 */
export async function countDoors(accountId: number): Promise<Record<Door, number>> {
  const sql = getDb();
  const rows = await sql`
    SELECT COUNT(*) FILTER (WHERE google_sub IS NOT NULL)::int AS google,
           COUNT(*) FILTER (WHERE password_hash IS NOT NULL)::int AS password,
           COUNT(*) FILTER (WHERE sfu_username IS NOT NULL)::int AS sfu
    FROM meetup.users
    WHERE id = ${accountId} OR merged_into = ${accountId}
  `;
  const row = rows[0];
  return {
    google: row.google as number,
    password: row.password as number,
    sfu: row.sfu as number,
  };
}

/**
 * Clear one door everywhere it sits on this account, tombstones included.
 *
 * The caller checks first that something else is left — users_has_credential
 * would catch it, but only as a 500 after the fact.
 */
export async function unlinkDoor(accountId: number, door: Door): Promise<void> {
  const sql = getDb();
  if (door === "google") {
    await sql`
      UPDATE meetup.users
      SET google_sub = NULL, google_email = NULL, google_email_verified = NULL,
          google_hd = NULL, updated_at = NOW()
      WHERE id = ${accountId} OR merged_into = ${accountId}
    `;
    return;
  }
  if (door === "password") {
    await sql`
      UPDATE meetup.users SET password_hash = NULL, updated_at = NOW()
      WHERE id = ${accountId} OR merged_into = ${accountId}
    `;
    return;
  }
  await sql`
    UPDATE meetup.users SET sfu_username = NULL, sfu_authtype = NULL, updated_at = NOW()
    WHERE id = ${accountId} OR merged_into = ${accountId}
  `;
}

export interface MergeResult {
  survivor: number;
  absorbed: number;
  moved: Record<string, number>;
  dropped: Record<string, number>;
}

/**
 * Fold the two rows together and return the surviving account.
 *
 * All the work is in meetup.merge_accounts — see 011 for why it lives in the
 * database rather than here. This is the call and the read-back.
 */
export async function mergeAccounts(
  survivorId: number,
  absorbedId: number
): Promise<{ result: MergeResult; account: AppUser }> {
  const sql = getDb();
  const rows = await sql`SELECT meetup.merge_accounts(${survivorId}, ${absorbedId}) AS result`;
  const result = rows[0].result as MergeResult;
  const account = await getUser(survivorId);
  if (!account) throw new Error(`merge_accounts lost the survivor ${survivorId}`);
  return { result, account };
}
