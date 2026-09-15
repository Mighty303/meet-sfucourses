# meet.sfucourses.com

Everyone in a group drops their SFU schedule in; the grid shows when you're all
free on campus at the same time.

## How it works

Course data comes from the public [sfucourses API](https://api.sfucourses.com)
(`/v1/rest/sections?term=2025-fall`) — no key, open CORS. **This repo does not
fork sfucourses.com**, it only consumes that endpoint.

Sections are added in-app at **`/courses`**: search the term's course list and
add each one you're in. Tutorials and labs are their own class numbers, so each
is added separately.

Only class numbers are persisted. Meeting times are always resolved against the
API at read time, so an upstream schedule change is picked up without a migration.

### Finding the overlap

1. Expand each member's sections into busy intervals per weekday, dropping any
   section whose date range doesn't cover the displayed week.
2. Merge each member's overlapping intervals.
3. Complement within the search window (default 08:00–22:00) to get free time.
4. Intersect across members; keep windows at least `minMinutes` long.
5. Tag each window with the campus each member's nearest adjacent class is on.
   Different campuses means they can't actually meet — those render amber, not green.

Members who haven't added a schedule yet are excluded from the intersection,
otherwise they'd read as "free always" and silently widen everyone's overlap.

### Who's actually going

The timetable says where you're enrolled, which is not the same as where you'll
be. Any class on any date can be marked **skipping** or **online** — from the
block itself, or for a whole day from the day's heading:

- **Skipping** drops that class out of step 1, so the hour stops being busy and
  a real free window opens for the group. The block stays on the detailed grid,
  hollowed out and dashed — and on the availability heatmap as a dashed outline
  over the greener band — because seeing *why* a window opened is the point.
- **Online** stops anchoring you to a campus. If it's your only class that day,
  you drop out of availability entirely (same as having no campus day). If you
  also have in-person classes, the online hour stays busy so it isn't offered as
  a meetup slot. The heatmap uses a blue hatch (and a blue outline) so an
  all-online hour doesn't read as the same "in a room" state as an on-campus
  lecture.

Statuses are stored against the user and a date — not against a group — so
marking Thursday's lecture skipped shows in every group you're in at once. Only
deviations are stored: no row means you're going, so an ordinary week writes
nothing, and a status expires on its own once the date has passed.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL
npm run migrate              # creates the `meetup` schema; safe to re-run
npm run dev
```

### Google sign-in

Create a **Web application** OAuth client in the Google Cloud Console with these
redirect URIs, one per origin you use:

```
http://localhost:3000/api/auth/callback/google
https://meet.sfucourses.com/api/auth/callback/google
```

Then, to write the credentials to `.env.local` and all three Vercel
environments without them appearing on screen:

```bash
./scripts/set-google-oauth.sh
```

### SFU sign-in

The third door, and the only one that proves the person is at SFU. SFU
publishes no OIDC or public SAML for outside applications — only **CAS** — so
the protocol lives in `lib/cas.ts` and a `sfu-cas` credentials provider in
`auth.ts` redeems the ticket it brings back. The password is typed at
`cas.sfu.ca` and never reaches this site; what comes back is a one-time ticket
we validate server to server.

It is off unless `SFU_CAS_ENABLED=1`, and turning it on is not enough on its
own: **SFU Information Systems has to register the origin as a CAS service
first**, or `cas.sfu.ca` refuses the `service` URL and nobody gets in. The
callback to put on the [CAS service application
form](https://www.sfu.ca/information-systems/services/cas/cas-services-application-form/)
is `<origin>/api/auth/sfu/callback`.

To walk the flow without that approval:

```bash
node scripts/fake-cas.mjs    # stands in for cas.sfu.ca, on :8099
SFU_CAS_ENABLED=1 SFU_CAS_BASE=http://localhost:8099/cas npm run dev
```

`SFU_CAS_BASE` is ignored in production unless it is https, because whoever
answers `/serviceValidate` decides who you are signed in as. The service URL is
built from `AUTH_URL`, never from a request header, for the same reason — and
it carries no query string, so the string CAS binds the ticket to can't drift
between the redirect out and the validation. Where the visitor was headed rides
in a short-lived `sfu-cas-next` cookie instead.

A CAS account is its own `meetup.users` row, keyed on the computing ID and
never merged with a Google or password row that happens to share the address —
see `db/migrations/007_password_auth.sql` for why two doors meeting silently is
the wrong shape. Group rosters show a ✓ next to members who came in this way;
only that boolean crosses the wire, never the computing ID.

Sign-in is required to join a group, edit a schedule, or set an attendance
status; anyone with the invite link can still view one. A member row is owned by the user who created it, so
only they can change their schedule or name.

Members added before sign-in existed have no owner. They stay editable by
anyone with the link, and a signed-in user can **claim** one to take it over
along with its saved schedule, rather than starting a duplicate row.

Your schedule is stored per person, per term, in `meetup.user_courses` — not
per group, and not behind one. `/courses` edits it directly through
`/api/me/courses`, so you can say what you're enrolled in before you've joined
anything; signing up lands there, with a way past it for people who'd rather
not. Join a second group in the same term and your classes are already
there; edit them anywhere and every group in that term follows. Terms are kept
apart because a class number is only unique inside one, so a flat list would
resolve a fall section against the spring catalogue and quietly draw the wrong
course. Ownerless rows have no profile to read from and keep their own courses
in `meetup.member_courses`; `meetup.member_courses_effective` is the view that
decides which of the two a member row shows.

A group page therefore shows your saved sections but doesn't edit them — the
search box lives at `/courses`, because when everyone is free and which classes
you're in are two different questions and only one of them needs a week grid
on screen to answer.

## Admin portal

`/admin` shows every group, every user, what's in the database and how much
space it takes. It's server-gated: the session id on the JWT is resolved to a
`meetup.users` row and that row's email must be on `ADMIN_EMAILS` — which is
only ever written from Google's verified profile at sign-in, never from
anything the browser sends. A signed-in visitor who isn't on the list gets a
404, so the portal doesn't confirm it exists.

`ADMIN_EMAILS` has no default. This repository is public, so a baked-in address
would become the allowlist of every clone of it; leave it unset and the portal
is closed to everyone, including you.

Set `ADMIN_GOOGLE_SUB` to your `meetup.users.google_sub` to pin access to one
Google account rather than an address. The nav link is driven by
`session.isAdmin`, so the allowlist never reaches the client bundle.
`/api/admin/metrics` returns the same figures as JSON, gated identically.

## Scripts

| command | does |
|---|---|
| `npm run migrate` | applies `db/migrations/*.sql` in order (idempotent) |
| `npm run inspect` | prints row counts and term-cache status |
| `node scripts/reset-demo.mjs` | deletes smoke-test groups |
| `./scripts/set-google-oauth.sh` | writes Google OAuth credentials locally and to Vercel |

## Tests

Vitest, in `tests/`. Three suites, split by what they need rather than by what
they cover — so the default one needs nothing at all.

| command | does | needs |
|---|---|---|
| `npm test` | the unit suite: interval maths, the heat map, attendance, the sfucourses parsers | nothing |
| `npm run test:watch` | the same, in watch mode | nothing |
| `npm run test:smoke` | checks the live sfucourses API still has the shape `lib/sfu.ts` expects | the network |
| `npm run test:db` | group, membership and attendance SQL against a throwaway Neon branch | `NEON_API_KEY` |
| `npm run test:all` | all three | both |
| `npm run test:fixture` | regenerates `tests/fixtures/term-sample.json` from the live API | the network |

`npm test` is offline and deterministic: the parsers are checked against a
committed slice of a real term dump rather than invented data, so the awkward
shapes SFU actually publishes — sections with no campus, sections with no
meeting days at all — stay covered without a network call.

### A note on `package-lock.json`

Regenerate it on Linux, not on a Mac:

```
docker run --rm -v "$PWD":/w -w /w node:22-bookworm npm install --package-lock-only
```

`sharp` and `@tailwindcss/oxide` ship wasm builds whose own dependencies npm
prunes from the lockfile when it resolves on macOS. The result installs fine
there and then fails `npm ci` on every Linux runner with two `@emnapi` packages
"missing from lock file". A lockfile written on Linux covers both.

`npm run test:db` creates its own Neon branch, migrates it, and deletes it
afterwards; it never touches the `DATABASE_URL` in `.env.local`, and it skips
with a message rather than failing when `NEON_API_KEY` is unset. Without a key
the branch is never created, so there is nothing to clean up.

The rule that online is not on campus — a lecture attended from home is busy
time but puts nobody in a building — is pinned in `tests/unit/on-campus.test.ts`
and again end-to-end in `tests/db/attendance.test.ts`. Reverting any one of
`onCampus`, `busyForMeetup` or `anchorCampus` in `lib/overlap.ts` turns that
suite red.

## Schema

Everything lives in the `meetup` Postgres schema so it can share a database with
another app without collisions. `meetup.sections_cache` holds one term dump
(~227 kB for Fall 2025) with a 24h TTL, so every member of every group shares a
single upstream fetch.

## Scope

A group is still a secret invite code — anyone with the link can view it. What
sign-in adds is ownership: your schedule and name are yours to edit, and your
identity follows you across devices instead of living in `localStorage`.

After signing in, **Schedule** in the navigation opens just your saved classes
and free time in the current group. The `?view=mine` link keeps this view selected
when refreshed or bookmarked; **Schedule** switches back to the group. From home,
it opens your newest group.

With no group at all it draws your week on its own, from `meetup.user_courses`
through `/api/me/schedule` — the same grid, the same per-course colours and the
same going/skipping/online controls, with nobody else's column beside yours. A
schedule saved at `/courses` is worth looking at before there is anyone to
compare it with.

Not built yet: custom busy blocks (the `meetup.member_blocks` table exists and is
read, but there's no UI to add them), calendar export, meeting-spot suggestions.
