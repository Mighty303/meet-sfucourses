/**
 * Does lib/cas.ts read what cas.sfu.ca actually sends?
 *
 *   node --experimental-strip-types scripts/check-cas-parse.mts
 *
 * The ticket response is parsed with three expressions rather than an XML
 * dependency, which is fine right up until SFU's "slightly modified version of
 * Jasig CAS" phrases something differently. This serves each shape to the real
 * validateTicket() off a local socket: SFU's documented sample, the exact bytes
 * cas.sfu.ca returned for a bad ticket, the maillist extension, the CAS 3.0
 * attributes wrapper we don't use yet, and two things that must not parse as a
 * success.
 *
 * Expected: the first four name a user, the last three are null.
 */
import { createServer } from "node:http";
import { validateTicket } from "../lib/cas.ts";

process.env.SFU_CAS_ENABLED = "1";
process.env.SFU_CAS_BASE = "http://127.0.0.1:8123/cas";

const cases: Record<string, string> = {
  // Exactly SFU's documented success sample — no xmlns, two elements.
  "docs sample": `<cas:serviceResponse>
  <cas:authenticationSuccess>
    <cas:user>userID</cas:user>
    <cas:authtype>sfu</cas:authtype>
  </cas:authenticationSuccess>
</cas:serviceResponse>`,
  // The namespace/quoting style cas.sfu.ca actually returned today.
  "real quoting": `<cas:serviceResponse xmlns:cas='http://www.yale.edu/tp/cas'>
    <cas:authenticationSuccess>
        <cas:user>mwa123</cas:user>
        <cas:authtype>student</cas:authtype>
    </cas:authenticationSuccess>
</cas:serviceResponse>`,
  // The documented maillist extension, extra element in the middle.
  "with maillist": `<cas:serviceResponse xmlns:cas='http://www.yale.edu/tp/cas'>
  <cas:authenticationSuccess>
    <cas:user>abc7</cas:user>
    <cas:authtype>staff</cas:authtype>
    <cas:maillist>sfu-cas</cas:maillist>
  </cas:authenticationSuccess>
</cas:serviceResponse>`,
  // CAS 3.0 wraps extras in cas:attributes — SFU's docs don't, but if they
  // ever switch, user must still parse.
  "p3 attributes wrapper": `<cas:serviceResponse xmlns:cas='http://www.yale.edu/tp/cas'>
  <cas:authenticationSuccess>
    <cas:user>zz9</cas:user>
    <cas:attributes>
      <cas:authtype>alumni</cas:authtype>
    </cas:attributes>
  </cas:authenticationSuccess>
</cas:serviceResponse>`,
  // The real failure bytes from cas.sfu.ca today.
  "real failure": `<cas:serviceResponse xmlns:cas='http://www.yale.edu/tp/cas'>
    <cas:authenticationFailure code="INVALID_TICKET">Ticket &#39;ST-invented-abc&#39; not recognized</cas:authenticationFailure>
</cas:serviceResponse>`,
  // A failure that mentions a username — must not be read as a success.
  "failure naming a user": `<cas:serviceResponse xmlns:cas='http://www.yale.edu/tp/cas'>
  <cas:authenticationFailure code="INVALID_SERVICE">ticket for &lt;cas:user&gt;victim&lt;/cas:user&gt; not for this service</cas:authenticationFailure>
</cas:serviceResponse>`,
  // Junk, in case something other than CAS answers.
  "html error page": `<!doctype html><html><body>502 Bad Gateway</body></html>`,
};

let body = "";
const server = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(body);
}).listen(8123);

for (const [label, xml] of Object.entries(cases)) {
  body = xml;
  const got = await validateTicket("ST-x", "http://localhost:3000/api/auth/sfu/callback");
  console.log(label.padEnd(24), "→", got ? `user=${got.username} authtype=${got.authtype}` : "null");
}
server.close();
