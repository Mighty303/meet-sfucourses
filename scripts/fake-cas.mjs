/**
 * A stand-in for cas.sfu.ca, for local work.
 *
 * The real one only answers for service URLs SFU has registered, which means
 * the SFU sign-in path can't be walked — or reviewed, or regression-tested —
 * until an approval lands. This serves the two endpoints lib/cas.ts talks to
 * and nothing else.
 *
 *   node scripts/fake-cas.mjs
 *   SFU_CAS_ENABLED=1 SFU_CAS_BASE=http://localhost:8099/cas npm run dev
 *
 * Whoever answers /serviceValidate decides who you get signed in as, which is
 * why casEnabled() refuses a non-https base in production. This is a toy and
 * belongs on a laptop.
 */
import { createServer } from "node:http";

const PORT = Number(process.env.FAKE_CAS_PORT ?? 8099);
/** Who you'll be. Change it to test a second account. */
const USER = process.env.FAKE_CAS_USER ?? "dev";
const AUTHTYPE = process.env.FAKE_CAS_AUTHTYPE ?? "student";

/** Issued once and spent once, like the real thing — ticket reuse must fail. */
const issued = new Map();

createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/cas/login") {
    const service = url.searchParams.get("service");
    if (!service) return end(res, 400, "text/plain", "no service");
    const ticket = `ST-${Math.random().toString(36).slice(2, 12)}`;
    issued.set(ticket, service);
    const back = new URL(service);
    back.searchParams.set("ticket", ticket);
    console.log(`login  → ${USER}, ticket ${ticket} for ${service}`);
    res.writeHead(302, { Location: back.toString() });
    return res.end();
  }

  if (url.pathname === "/cas/serviceValidate") {
    const ticket = url.searchParams.get("ticket") ?? "";
    const service = url.searchParams.get("service") ?? "";
    const issuedFor = issued.get(ticket);
    issued.delete(ticket);
    const ok = issuedFor !== undefined && issuedFor === service;
    console.log(`verify → ticket ${ticket}: ${ok ? "ok" : "refused"}`);
    return end(res, 200, "text/xml", ok ? success(USER, AUTHTYPE) : failure());
  }

  end(res, 404, "text/plain", "not found");
}).listen(PORT, () => console.log(`fake CAS on http://localhost:${PORT}/cas as "${USER}"`));

function success(user, authtype) {
  return `<cas:serviceResponse xmlns:cas="http://www.yale.edu/tp/cas">
  <cas:authenticationSuccess>
    <cas:user>${user}</cas:user>
    <cas:authtype>${authtype}</cas:authtype>
  </cas:authenticationSuccess>
</cas:serviceResponse>`;
}

function failure() {
  return `<cas:serviceResponse xmlns:cas="http://www.yale.edu/tp/cas">
  <cas:authenticationFailure code="INVALID_TICKET">ticket not recognised</cas:authenticationFailure>
</cas:serviceResponse>`;
}

function end(res, status, type, body) {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}
