declare module "next-auth" {
  interface Session {
    /**
     * Our meetup.users row id. Deliberately not Session.user.id — that field
     * already exists as a string (Google's subject) and this is our own serial.
     */
    appUserId?: number;
    /** Only gates the nav link; every admin surface re-checks server-side. */
    isAdmin?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    appUserId?: number;
    /** The picture they chose, if any. Null once they've reverted to Google's. */
    avatar?: string | null;
    /**
     * Whether the account holds a Google credential.
     *
     * It used to mean "came in by the Google door", which was the same thing
     * until 011 let one row hold all three. It isn't any more: after linking,
     * a session minted at cas.sfu.ca belongs to an account that may well have
     * a Google sub on it, and the admin allowlist turns on the credential
     * rather than on the door. Stamped from the row — see stampAccount().
     *
     * Undefined on tokens signed before the flag existed, when Google was the
     * only way in; the session callback reads that as true.
     */
    hasGoogle?: boolean;
    /**
     * The address Google vouched for, which is not the session's address once
     * a linked account wears its verified @sfu.ca one. The admin allowlist is
     * a list of Google addresses, so this is the one it compares against.
     */
    googleEmail?: string | null;
  }
}

export {};
