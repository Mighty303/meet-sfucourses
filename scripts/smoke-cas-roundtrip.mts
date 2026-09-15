/**
 * End-to-end ticket mint + validate against scripts/fake-cas.mjs.
 *
 *   node --experimental-strip-types scripts/smoke-cas-roundtrip.mts
 *
 * Proves lib/cas.ts will accept a ticket the way the real IdP issues one, and
 * that a spent or invented ticket is refused. No database involved — that is
 * the authorize() half, exercised separately once DATABASE_URL is available.
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

process.env.SFU_CAS_ENABLED = "1";
process.env.SFU_CAS_BASE = "http://127.0.0.1:8099/cas";

const fake = spawn("node", ["scripts/fake-cas.mjs"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, FAKE_CAS_PORT: "8099", FAKE_CAS_USER: "smoketest" },
});

let ready = false;
fake.stdout.on("data", (buf) => {
  const s = String(buf);
  process.stdout.write(`[fake-cas] ${s}`);
  if (s.includes("fake CAS on")) ready = true;
});
fake.stderr.on("data", (buf) => process.stderr.write(`[fake-cas] ${buf}`));

for (let i = 0; i < 50 && !ready; i++) await sleep(50);
if (!ready) {
  fake.kill();
  throw new Error("fake CAS did not start");
}

const { casLoginUrl, casServiceUrl, validateTicket } = await import("../lib/cas.ts");

const service = casServiceUrl();
const login = casLoginUrl(service);
console.log("login URL:", login);

const bounced = await fetch(login, { redirect: "manual" });
const location = bounced.headers.get("location");
if (!location || bounced.status !== 302) {
  fake.kill();
  throw new Error(`expected 302 from fake login, got ${bounced.status}`);
}
const ticket = new URL(location).searchParams.get("ticket");
if (!ticket) {
  fake.kill();
  throw new Error("no ticket on fake CAS redirect");
}
console.log("ticket:", ticket);

const ok = await validateTicket(ticket, service);
console.log("first validate:", ok);
if (!ok || ok.username !== "smoketest") {
  fake.kill();
  throw new Error("expected smoketest identity");
}

const reused = await validateTicket(ticket, service);
console.log("reuse validate:", reused);
if (reused !== null) {
  fake.kill();
  throw new Error("spent ticket must not validate again");
}

const invented = await validateTicket("ST-invented", service);
console.log("invented validate:", invented);
if (invented !== null) {
  fake.kill();
  throw new Error("invented ticket must not validate");
}

fake.kill();
console.log("smoke-cas-roundtrip: ok");
