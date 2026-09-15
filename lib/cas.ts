/**
 * SFU's Central Authentication Service, which is the only way an application
 * outside SFU can check that someone is actually at SFU. There is no OIDC and
 * no public SAML to point next-auth at, so the protocol lives here and a
 * credentials provider in auth.ts hands it a ticket.
 *
 * The shape of it is small: send someone to CAS with a `service` URL, CAS sends
 * them back to that URL with a one-time ticket, and we ask CAS — server to
 * server — who the ticket belongs to. Their password is typed into cas.sfu.ca
 * and is never seen by, sent to, or stored on this site. That is the entire
 * reason to do it this way rather than the way a scraper would.
 */

/**
 * Overridable so `scripts/fake-cas.mjs` can stand in during development. The
 * real IdP accepts unregistered service URLs (with a warning banner) and still
 * releases the username; the fake is for walking the round trip offline. The
 * override is fenced off in production below.
 *
 * Read at call time (not module load) so check-cas-parse can point at a local
 * socket after setting SFU_CAS_BASE.
 */
function casBase(): string {
  return (process.env.SFU_CAS_BASE ?? "https://cas.sfu.ca/cas").replace(/\/+$/, "");
}

/**
 * Off unless deliberately turned on. Every entry point checks this so a
 * deployment without the flag shows no SFU button and accepts no ticket —
 * not half of each. Registration with SFU is not required for the username
 * attribute; see README.
 */
export function casEnabled(): boolean {
  if (process.env.SFU_CAS_ENABLED !== "1") return false;
  // The dev override must not become a way to point ticket validation at
  // someone else's server: whoever answers /serviceValidate decides who you
  // are signed in as.
  if (process.env.NODE_ENV === "production" && !casBase().startsWith("https://")) return false;
  return true;
}

/**
 * This site's own origin, from configuration rather than from the request.
 *
 * It has to be configuration. The origin decides the service URL, the service
 * URL decides which ticket validates, and a request header is something the
 * caller writes — deriving it from the Host would let someone claim a ticket
 * was minted for a service that isn't this one. AUTH_URL is already the value
 * next-auth trusts for the same reason.
 *
 * Never fall back to VERCEL_URL on the production deployment: that hostname is
 * per-deploy (meetup-xxxx.vercel.app), while the browser's cookies were set on
 * the custom domain. CAS would send the ticket to a host that never saw the
 * state cookie, and sign-in fails with error=sfu every time.
 */
export function casOrigin(): string {
  const configured = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (configured) return configured.replace(/\/+$/, "");

  // Stable production hostname Vercel injects (e.g. meet.sfucourses.com).
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.replace(
    /^https?:\/\//,
    ""
  );
  if (process.env.VERCEL_ENV === "production" && productionHost) {
    return `https://${productionHost}`;
  }

  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/**
 * Where CAS sends people back, and — byte for byte — the string we quote back
 * to it when validating. A ticket is bound to the service it was issued for,
 * so the two must match exactly; the usual way this breaks is a query string
 * on one side and not the other. Keeping it constant makes that impossible,
 * which is why `next` rides in a cookie instead of in here.
 */
export function casServiceUrl(): string {
  return `${casOrigin()}/api/auth/sfu/callback`;
}

export function casLoginUrl(service: string): string {
  return `${casBase()}/login?service=${encodeURIComponent(service)}`;
}

/**
 * Where they were headed before CAS, parked for the length of the round trip.
 * Lives here rather than in the start route because a route.ts may only export
 * handlers and Next's own config fields.
 */
export const SFU_NEXT_COOKIE = "sfu-cas-next";

/**
 * Browser-bound proof that *this* browser started the CAS round trip. Without
 * it, a callback URL carrying someone else's ticket would silently sign the
 * victim into that account. CAS has no OAuth-style `state` parameter, so the
 * cookie is the correlation.
 */
export const SFU_STATE_COOKIE = "sfu-cas-state";

/** Long enough to type a password and clear a 2FA prompt; nobody's standing state. */
export const SFU_NEXT_MAX_AGE = 10 * 60;

/** Cryptographically random opaque token for SFU_STATE_COOKIE. */
export function newCasState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface CasIdentity {
  /** The computing ID, lowercased. */
  username: string;
  /** Which handler authenticated them: student, faculty, staff, alumni… */
  authtype: string | null;
}

/** Computing IDs are short and alphanumeric; anything else isn't one. */
const USERNAME = /^[a-z0-9_-]{1,32}$/;

/**
 * Ask CAS who this ticket belongs to. Null means no — an expired ticket, a
 * reused one, one minted for a different service, or an invented one.
 *
 * The response is small, fixed XML from one known host, so it is read with
 * three expressions rather than by adding a parser dependency. The success
 * element is required before anything is believed: a failure response also
 * contains text, and matching on <cas:user> alone would be a way in.
 */
export async function validateTicket(ticket: string, service: string): Promise<CasIdentity | null> {
  if (!casEnabled()) return null;

  const url = `${casBase()}/serviceValidate?service=${encodeURIComponent(service)}&ticket=${encodeURIComponent(ticket)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;

  const xml = await res.text();
  if (!/<cas:authenticationSuccess/.test(xml)) return null;

  const username = xml.match(/<cas:user>\s*([^<\s]+)\s*<\/cas:user>/)?.[1]?.toLowerCase();
  if (!username || !USERNAME.test(username)) return null;

  const authtype = xml.match(/<cas:authtype>\s*([^<\s]+)\s*<\/cas:authtype>/)?.[1]?.toLowerCase() ?? null;
  return { username, authtype };
}

/**
 * Derived, never typed. Every SFU computing ID has this address, and because
 * the ID came from CAS this is the one email on the site that something other
 * than the person claiming it has confirmed.
 */
export function casEmail(username: string): string {
  return `${username}@sfu.ca`;
}
