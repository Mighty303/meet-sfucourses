import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { isAdminEmail } from "@/lib/admin";
import { casEnabled, casServiceUrl, validateTicket } from "@/lib/cas";
import { googleEnabled } from "@/lib/google-auth";
import { touchLastSeen } from "@/lib/last-seen";
import { verifyPassword } from "@/lib/password";
import { getPasswordUserByEmail, getUser, upsertSfuUser, upsertUser } from "@/lib/users";

/**
 * Register Google only when both env vars are present. Auth.js will start the
 * OAuth redirect with just a client id; the token exchange needs the secret,
 * and a missing one becomes the opaque `error=Configuration` page.
 */
const google = googleEnabled()
  ? Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    })
  : null;

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Send Auth.js failures to our sign-in page instead of the stock
  // /api/auth/error HTML, so Configuration / AccessDenied get a real message.
  pages: {
    error: "/signin",
    signIn: "/signin",
  },
  providers: [
    ...(google ? [google] : []),
    /**
     * The other door: an address and a password kept here, for people who would
     * rather not hand a third party the list of groups they're in. Accounts are
     * made by POST /api/auth/register; this only checks one.
     */
    Credentials({
      id: "password",
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;

        const user = await getPasswordUserByEmail(email);
        // verifyPassword on a null hash still runs the comparison path and
        // returns false, so an unknown address and a wrong password take
        // roughly the same time and neither answer tells you which it was.
        if (!(await verifyPassword(password, user?.passwordHash ?? null))) return null;
        if (!user) return null;

        return {
          id: String(user.id),
          email: user.email,
          name: user.name,
          image: user.avatar ?? user.image,
        };
      },
    }),
    /**
     * The SFU door, kept registered so Auth.js lists it and so a future form
     * path can reuse it. The live round trip does not call signIn("sfu-cas"):
     * /api/auth/sfu/callback validates the ticket, upserts the user, and mints
     * the session JWT on the redirect itself (see lib/cas-session.ts). The
     * password was typed into cas.sfu.ca and never came near us.
     */
    Credentials({
      id: "sfu-cas",
      name: "SFU computing ID",
      credentials: { ticket: {} },
      async authorize(credentials) {
        if (!casEnabled()) return null;
        const ticket = typeof credentials?.ticket === "string" ? credentials.ticket : "";
        if (!ticket) return null;

        // The service URL is built here from configuration, never taken from
        // the caller. A ticket is only good for the service it was minted for,
        // so naming that service is the one thing a caller must not get to do.
        const cas = await validateTicket(ticket, casServiceUrl());
        if (!cas) return null;

        const row = await upsertSfuUser(cas);
        return {
          id: String(row.id),
          email: row.email,
          name: row.name,
          image: row.avatar ?? row.image,
        };
      },
    }),
  ],
  // Vercel serves this under a few hostnames (alias + per-deployment URLs).
  trustHost: true,
  session: { strategy: "jwt" },
  callbacks: {
    // Runs only on sign-in, when `profile` (Google) or `user` (password) is
    // present. We keep our own users row and carry its id on the token, so no
    // database adapter is needed.
    async jwt({ token, user, profile, account, trigger }) {
      if (profile?.sub) {
        const row = await upsertUser({
          googleSub: profile.sub,
          email: profile.email ?? "",
          name: profile.name ?? null,
          image: typeof profile.picture === "string" ? profile.picture : null,
        });
        token.appUserId = row.id;
        token.avatar = row.avatar;
        token.hasGoogle = true;
      } else if ((account?.provider === "password" || account?.provider === "sfu-cas") && user?.id) {
        // authorize() already did the checking; its id is our users row. Both
        // of these are non-Google doors, which is all hasGoogle records — see
        // the session callback for what that flag is actually for.
        token.appUserId = Number(user.id);
        token.avatar = (await getUser(Number(user.id)))?.avatar ?? null;
        token.hasGoogle = false;
      } else if (trigger === "update" && typeof token.appUserId === "number") {
        // The client asks for this after changing its picture. Re-reading here
        // rather than on every session lookup keeps the common path free of a
        // database round trip.
        token.avatar = (await getUser(token.appUserId))?.avatar ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (typeof token.appUserId === "number") {
        session.appUserId = token.appUserId;
        // Every server-side session resolution comes through here, which makes
        // it the one hook that sees an ordinary page view rather than only a
        // sign-in. It schedules the write for after the response and throttles
        // itself, so this stays a synchronous no-op on the common path.
        touchLastSeen(token.appUserId);
      }
      // Computed here rather than stamped on the token at sign-in, so adding an
      // address to the allowlist takes effect without everyone signing out
      // again. It only decides whether the nav shows the link — the portal
      // itself re-checks against the database.
      //
      // Gated on the account being a Google one, because a password account's
      // address is self-asserted: without this, registering an admin's email
      // would light up the Admin link. adminFor() refuses the same way, so this
      // is the cosmetic half of one rule.
      //
      // `!== false` rather than `=== true`, because tokens issued before the
      // password provider existed carry no flag at all — and Google was the
      // only way in when they were signed, so undefined means Google. Only the
      // password branch above ever writes false.
      session.isAdmin = token.hasGoogle !== false && isAdminEmail(token.email);
      // A chosen picture wins over Google's everywhere the session is read.
      if (session.user && typeof token.avatar === "string") {
        session.user.image = token.avatar;
      }
      return session;
    },
  },
});
