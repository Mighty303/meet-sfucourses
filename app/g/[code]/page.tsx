"use client";

import { useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccountGate } from "@/components/AccountGate";
import { CalendarTools } from "@/components/CalendarTools";
import { HeatGrid } from "@/components/HeatGrid";
import { GroupPageSkeleton } from "@/components/Skeleton";
import { WeekGrid, type AttendanceControl } from "@/components/WeekGrid";
import { STATUS_EFFECT, resolveStatus } from "@/lib/attendance-status";
import { readGuestMember, type GuestMember } from "@/lib/guest-schedule";
import type { AttendanceRow, AttendanceStatus } from "@/lib/attendance-status";
import { rememberLastGroup } from "@/lib/last-group";
import { commonFree, weekDates } from "@/lib/overlap";
import type { BusyBlock, FreeWindow, UnscheduledSection } from "@/lib/overlap";
import { fromTermCode, WEEKDAYS } from "@/lib/sfu";
import type { DayKey } from "@/lib/sfu";
import { addDays, mondayOf, shortDate, toISODate, writeDate } from "@/lib/week-dates";

interface Member {
  id: number;
  displayName: string;
  color: string;
  classNumbers: string[];
  userId: number | null;
  image: string | null;
  /** Signed in through SFU, so somebody checked. Never says who. */
  sfuVerified: boolean;
}

/**
 * One row of the group switcher: a group you have a member row in. A slice of
 * what /api/me returns — the rest of that payload is the profile page's.
 */
interface GroupOption {
  memberId: number;
  /** Your colour in that group, so the dot matches its grid. */
  color: string;
  group: { code: string; name: string; term: string };
}

interface GroupState {
  group: {
    id: number;
    code: string;
    name: string;
    term: string;
    /** The group's admin — the only person who can delete it. */
    ownerUserId: number | null;
  };
  members: Member[];
  busyByMember: Record<number, BusyBlock[]>;
  free: FreeWindow[];
  unresolved: Record<number, string[]>;
  unscheduled: Record<number, UnscheduledSection[]>;
  week: string;
  termBounds: { start: string; end: string; typicalStart: string } | null;
  /** Everyone's attendance deviations for this week — see lib/attendance.ts. */
  attendance: AttendanceRow[];
}

// Shorter than this isn't worth crossing campus for, and nobody was going to
// tune it — so it's fixed rather than a control.
const MIN_MINUTES = 60;

const DAY_START = 8 * 60;
const DAY_END = 22 * 60;

export default function GroupPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  return (
    <Suspense fallback={<GroupPageSkeleton />}>
      <GroupSchedule key={code} code={code} />
    </Suspense>
  );
}

function GroupSchedule({ code }: { code: string }) {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [state, setState] = useState<GroupState | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Null until the server tells us which week is actually inside the term.
  const [week, setWeek] = useState<string | null>(null);
  // Member ids ticked off in the list. Kept as ids, not indices, so it survives
  // someone joining or leaving mid-session.
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  // Which of the two week views to draw, when the URL says. In the URL so a
  // reload — and a shared link — keeps whichever view you were reading; absent,
  // the group's own size decides (see `grid`, below the member counts).
  const gridParam = searchParams.get("grid");
  const pinnedGrid = gridParam === "detailed" || gridParam === "heat" ? gridParam : null;
  const [saving, setSaving] = useState(false);
  // Furniture, not a reading of the data — so it stays in component state
  // rather than in the URL the way `grid` does. A shared link shouldn't decide
  // whether the person opening it sees the member list.
  const [listOpen, setListOpen] = useState(true);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  // Every group you're in, for the switcher. Null until the fetch lands.
  const [myGroups, setMyGroups] = useState<GroupOption[] | null>(null);
  // The account modal, asked for by the guest bar.
  const [gateAsked, setGateAsked] = useState(false);
  // The row this browser started the group with, if it did. Undefined until
  // localStorage has been read, which can't happen during render.
  const [guestMember, setGuestMember] = useState<GuestMember | null | undefined>(undefined);

  const load = useCallback(async () => {
    // No minMinutes here: the page derives its own windows from busyByMember, so
    // changing the duration (or ticking someone off) is instant, not a round-trip.
    const res = await fetch(`/api/groups/${code}${week ? `?week=${week}` : ""}`);
    if (!res.ok) {
      setError(
        res.status === 404
          ? "No group with that code."
          : res.status === 502
            ? "SFU hasn't published this term's timetable yet, so there's nothing to draw."
            : "Could not load this group."
      );
      return;
    }
    setError(null);
    const next: GroupState = await res.json();
    setState(next);
    // First load: adopt the server's clamped week so the picker matches the grid.
    setWeek((cur) => cur ?? next.week);
  }, [code, week]);

  // Fetch on mount and whenever the week/duration filters change. The state
  // updates happen after an await, not synchronously, so the cascading-render
  // concern behind this rule doesn't apply.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // Identity comes from the session — no localStorage, so your schedule follows
  // you to any device you sign in on.
  const signedIn = authStatus === "authenticated";
  const gateOpen = !signedIn && gateAsked;
  const me = signedIn ? state?.members.find((m) => m.userId === session?.appUserId) ?? null : null;
  // Rows with no owner: claimable by whoever signs in and says that's them.
  const unclaimed = state?.members.filter((m) => m.userId === null) ?? [];
  // The row this browser started the group with, still unclaimed. Matched
  // against the live roster rather than trusted from storage: the id there is
  // a note to self, and the row may have been claimed or deleted since.
  const mine =
    !signedIn && guestMember
      ? unclaimed.find((m) => m.id === guestMember.memberId) ?? null
      : null;
  // The group's admin: whoever created it. The server checks this again on the
  // delete itself — this only decides whether the button is worth showing.
  const isAdmin =
    signedIn &&
    state?.group.ownerUserId != null &&
    state.group.ownerUserId === session?.appUserId;

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setGuestMember(readGuestMember(code)); }, [code]);

  // Where the nav's Calendar row points next time. Gated on `state` rather than
  // on the code in the URL, so a typo or a group you've been removed from
  // doesn't become the place you land.
  useEffect(() => { if (state) rememberLastGroup(state.group.code); }, [state]);

  // Your other groups, so switching between them doesn't mean a trip via Home.
  // Independent of the group fetch: it's keyed on you, not on the code, so it
  // survives navigating from one group to the next.
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (live && data) setMyGroups(data.memberships); })
      .catch(() => {});
    return () => { live = false; };
  }, [signedIn]);

  /**
   * Sign in and come straight back into the group, from the invite panel below.
   * The button that sent you to /signin already said "join", so joining is the
   * landing — not a second click on a page you thought you'd finished with.
   */
  const wantsJoin = searchParams.get("join") === "1";
  // The POST reloads the group, and `me` only appears on the reload after that,
  // so `wantsJoin` alone would fire twice. The ref is what makes it once.
  const autoJoined = useRef(false);

  /** Drop `join` once it's been acted on, so a reload doesn't re-run it. */
  const clearJoinParam = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("join");
    router.replace(`/g/${code}${params.size > 0 ? `?${params}` : ""}`, { scroll: false });
  }, [code, router, searchParams]);

  useEffect(() => {
    if (!wantsJoin || !signedIn || !state || autoJoined.current) return;
    // Already in, or there's an unclaimed name here that might be yours: both
    // are reasons not to add a row silently — claiming past your own old name
    // would put you on the grid twice. Those still go through the buttons.
    if (me || unclaimed.length > 0) { clearJoinParam(); return; }
    autoJoined.current = true;
    join().finally(clearJoinParam);
    // `join` is a plain function redeclared each render; the ref, not the dep
    // list, is what keeps this to one call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsJoin, signedIn, state, me, unclaimed.length, clearJoinParam]);

  /**
   * Where one pill in the switcher points. The detailed/availability choice
   * carries across; the week doesn't, because another group can be another term
   * entirely, so it re-clamps from the server.
   */
  function pillHref(nextCode: string): string {
    const params = new URLSearchParams();
    // The pin travels, the derived choice doesn't: carrying this group's answer
    // into another one would pin a view the reader never picked.
    if (pinnedGrid) params.set("grid", pinnedGrid);
    return `/g/${nextCode}${params.size > 0 ? `?${params}` : ""}`;
  }

  function setGrid(next: "detailed" | "heat") {
    const params = new URLSearchParams(searchParams.toString());
    // Both values are written, not just the non-default one: with no param the
    // view is chosen by group size, so "clean URL" no longer means "heat".
    params.set("grid", next);
    // replace, not push: toggling a view isn't a step you want to hit Back through.
    router.replace(`/g/${code}${params.size > 0 ? `?${params}` : ""}`, { scroll: false });
  }

  async function claim(memberId: number) {
    setSaving(true);
    const res = await fetch(`/api/groups/${code}/members/${memberId}/claim`, { method: "POST" });
    setSaving(false);
    if (!res.ok) { setError((await res.json()).error); return; }
    setError(null);
    load();
  }

  async function join() {
    setSaving(true);
    const res = await fetch(`/api/groups/${code}/members`, { method: "POST" });
    setSaving(false);
    if (!res.ok) { setError((await res.json()).error); return; }
    setError(null);
    load();
  }


  /**
   * Save whichever status was pressed. Written against the user and the date,
   * not against this group — the same Thursday is the same Thursday in every
   * group you're in, so the answer travels with you.
   *
   * `repeat` is the Google Calendar move: write the same answer on this
   * weekday through the end of term, so "I'm skipping this lecture for the
   * rest of the semester" is one press instead of twelve.
   */
  async function saveStatus(
    date: string,
    classNumber: string | null,
    status: AttendanceStatus,
    note: string | null,
    opts?: { repeat?: boolean }
  ) {
    setSaving(true);
    const res = await fetch("/api/attendance", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        classNumber,
        status,
        note,
        repeat: opts?.repeat === true,
        until: opts?.repeat ? state?.termBounds?.end ?? undefined : undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) { setError((await res.json()).error ?? "could not save that"); return; }
    setError(null);
    load();
  }



  // Only people with a schedule can constrain anything — someone who hasn't
  // pasted theirs would read as "free always" and silently widen every window.
  const scheduled = useMemo(
    () =>
      (state?.members ?? []).filter(
        (m) => m.classNumbers.length > 0 || (state?.busyByMember[m.id]?.length ?? 0) > 0
      ),
    [state]
  );
  const shown = useMemo(
    () => scheduled.filter((m) => !hidden.has(m.id)),
    [scheduled, hidden]
  );

  /**
   * Two readings of the same week, and which one a group opens on depends on
   * how many schedules are in it.
   *
   * Availability shades each band by how many people are free, and past two
   * schedules it's the only view that survives the clash — that's why it used
   * to be the flat default. But it draws no classes at all, so a group with one
   * or two schedules in it opens on a heatmap of almost nothing, which is
   * exactly the group every new user is looking at. The labelled blocks say
   * what's actually in the way, so those come first until the third schedule
   * lands.
   *
   * `scheduled` is known before the first render — the page is gated on
   * `state` below — so this never flips under the reader.
   */
  const grid: "detailed" | "heat" = pinnedGrid ?? (scheduled.length < 3 ? "detailed" : "heat");

  const schedules = useMemo(
    () => shown.map((m) => ({ name: m.displayName, busy: state?.busyByMember[m.id] ?? [] })),
    [shown, state]
  );

  // Recomputed here rather than refetched. Ticking someone off is a filter over
  // data the page already holds, and a round-trip would make it feel like a
  // reload — the server's own `free` is for API callers, not for this view.
  const free = useMemo(
    () =>
      schedules.length >= 2
        ? commonFree({ members: schedules, dayStart: DAY_START, dayEnd: DAY_END, minMinutes: MIN_MINUTES })
        : [],
    [schedules]
  );

  /**
   * The five dates the grid is currently showing. A status is about a date, not
   * about "Thursday" in the abstract — skipping one week's lecture says nothing
   * about the next — so every read and write here goes through this.
   */
  const dates = useMemo(
    () => (state ? weekDates(new Date(`${state.week}T12:00:00`)) : null),
    [state]
  );

  /** Your own whole-day statuses this week, for the day headings. */
  const myUserId = me?.userId ?? null;
  const myDayStatus = useMemo(() => {
    const out: Partial<Record<DayKey, { status: AttendanceStatus; note: string | null }>> = {};
    if (!state || !dates || myUserId === null) return out;
    for (const day of WEEKDAYS) {
      const row = state.attendance.find(
        (r) => r.userId === myUserId && r.classNumber === null && r.onDate === dates[day]
      );
      if (row) out[day] = { status: row.status, note: row.note };
    }
    return out;
  }, [state, dates, myUserId]);

  if (error && !state) {
    return <main className="mx-auto w-full max-w-lg p-6"><p className="text-red-600">{error}</p></main>;
  }
  if (!state) {
    return <GroupPageSkeleton />;
  }

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/g/${code}` : "";
  const thisMonday = mondayOf(new Date());
  // "Who's around today" is the question the member list gets opened for, so it
  // only answers it when today is actually the week on screen.
  const today = toISODate(new Date());
  const todayShown = dates !== null && WEEKDAYS.some((d) => dates[d] === today);

  // Pair each member with their untimetabled sections, dropping anyone who has
  // none — and anyone ticked off, since nothing else on the page counts them.
  const unscheduledMembers = shown
    .map((m) => [m, state.unscheduled[m.id] ?? []] as const)
    .filter(([, sections]) => sections.length > 0);

  // A week counts as in-term if any of it overlaps the term's date range;
  // paging past either end would just show a grid with no classes on it.
  function weekInTerm(monday: string): boolean {
    const b = state?.termBounds;
    if (!b) return true;
    return addDays(monday, 6) >= b.start && monday <= b.end;
  }

  function canPage(direction: -1 | 1): boolean {
    return week !== null && weekInTerm(addDays(week, direction * 7));
  }

  /**
   * Handed to the grids, which hang the three buttons off the hover card of
   * anything of yours. Absent when you're not in this group, which is what
   * makes everyone else's week read-only.
   */
  const attendance: AttendanceControl | undefined =
    me && dates
      ? {
          memberId: me.id,
          color: me.color,
          dayStatus: myDayStatus,
          dayLabel: (day) => writeDate(dates[day]),
          setBlock: (block, status, note, opts) =>
            saveStatus(dates[block.day], block.classNumber ?? null, status, note, opts),
          setDay: (day, status, note, opts) =>
            saveStatus(dates[day], null, status, note, opts),
        }
      : undefined;

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 p-5 sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{state.group.name}</h1>
          <p className="text-sm text-neutral-500">
            {fromTermCode(state.group.term)} · code <span className="font-mono">{state.group.code}</span>
          </p>
        </div>
        {/* The two things you do to a group rather than read from it, on one
            row. The invite used to be a labelled panel with the URL always on
            screen — a paragraph and a text field permanently occupying the top
            of a page you opened to look at a week. It is a one-time action, so
            it is a button, and the field only appears if the copy actually
            failed. Everything rarer than that is behind the ⋮. */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              // Optimistic — the promise may never settle, so don't wait on it.
              setCopyState("copied");
              setTimeout(() => setCopyState("idle"), 2000);
              navigator.clipboard?.writeText(shareUrl).catch(() => setCopyState("failed"));
            }}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium transition-colors hover:bg-neutral-100 active:scale-[0.98] dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              className="shrink-0 text-neutral-500 dark:text-neutral-400"
            >
              {copyState === "copied" ? (
                <path d="M4.5 10.5l3.5 3.5 7.5-8" />
              ) : (
                <>
                  <rect x="7.25" y="7.25" width="9" height="9" rx="2" />
                  <path d="M12.75 4.75a2 2 0 00-2-2h-6a2 2 0 00-2 2v6a2 2 0 002 2" />
                </>
              )}
            </svg>
            {copyState === "copied" ? "Copied" : "Copy invite link"}
          </button>

          {/* Everything you do to a group rather than read from it lives on
              one page now — its name, its people, and the two ways out. The ⋮
              this replaces held four items and could not hold a fifth. */}
          <Link
            href={`/g/${code}/settings`}
            aria-label="Group settings"
            title="Group settings"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-300 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:border-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            <GearIcon />
          </Link>
        </div>
      </header>

      {copyState === "failed" && (
        <div className="-mt-4 flex items-center gap-2">
          <p className="text-sm text-neutral-500">Copying didn&apos;t work. Take it from here:</p>
          <input
            readOnly
            autoFocus
            value={shareUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="w-64 rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-600 sm:w-96 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
          />
        </div>
      )}

      {/* Which group you're reading. One pill is selected at a time, and
          switching is a real navigation, so these are links — middle-click and
          Back both behave. Your own week isn't one of them: /courses draws it,
          beside the list of sections it is made of. */}
      {signedIn && (
        <div className="-mt-2 flex flex-col gap-2">
        <h2 className="font-medium">Your groups</h2>
        <nav aria-label="Group to show" className="flex flex-wrap items-center gap-2">
          {/* Until /api/me lands there's still the group you're on, so the row
              renders at once and fills in rather than popping into place. */}
          {(myGroups ?? [{ memberId: 0, color: me?.color ?? "#a3a3a3", group: state.group }]).map((g) => (
            <Pill
              key={g.group.code}
              href={pillHref(g.group.code)}
              current={g.group.code === code}
              title={`${g.group.name} · ${fromTermCode(g.group.term)}`}
            >
              {/* Your colour in that group — the same key its grid uses. */}
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: g.color }} />
              <span className="truncate">{g.group.name}</span>
            </Pill>
          ))}
        </nav>
        </div>
      )}

      {!signedIn ? (
        /* One line, not the panel this was: a heading, a paragraph and two
           links, above the grid, telling someone who had just followed an
           invite that they couldn't do the thing they hadn't tried yet.
           Reading the week is the default and needs no account, so the page
           gets on with drawing it and puts the ask on the press that needs
           one. */
        <p className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-500">
          {/* Two guests, two different sentences. Whoever started this group
              signed out is already on the grid and has nothing to add — what
              they have is a row only this browser knows is theirs. */}
          {mine ? (
            <>
              <span>
                You&apos;re on this grid as{" "}
                <span className="font-medium text-neutral-700 dark:text-neutral-300">{mine.displayName}</span>,
                saved in this browser only.
              </span>
              <button
                type="button"
                onClick={() => setGateAsked(true)}
                className="font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
              >
                Sign in to keep it →
              </button>
            </>
          ) : (
            <>
              You&apos;re reading this as a guest.
              <button
                type="button"
                onClick={() => setGateAsked(true)}
                className="font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
              >
                Add my schedule →
              </button>
            </>
          )}
        </p>
      ) : !me ? (
        <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          {unclaimed.length > 0 ? (
            <>
              {/* People added before sign-in existed. Claiming keeps their
                  saved schedule instead of making them start over. */}
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                Already in this group under one of these names? Pick yours to keep
                your saved schedule.
              </p>
              <div className="flex flex-wrap gap-2">
                {unclaimed.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => claim(m.id)}
                    disabled={saving}
                    className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                  >
                    <span style={{ color: m.color }}>{m.displayName}</span>
                    {m.classNumbers.length > 0 && (
                      <span className="text-neutral-500"> · {m.classNumbers.length}</span>
                    )}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              You&apos;re not in this group yet.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={join}
              disabled={saving}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
            >
              {saving ? "Joining…" : unclaimed.length > 0 ? "Add me instead" : "Join group"}
            </button>
            {error && <p className="text-sm text-amber-600">{error}</p>}
          </div>
        </div>
      ) : (
        /* Nothing. Being in the group used to be a card here: your saved
           sections, a link to change them, and the two buttons for getting out.
           It sat between the heading and the week, which meant the thing the
           page is named after started below the fold.

           The sections moved into the member list, onto your own row, where
           they cost no vertical space at all and sit beside the grid they
           describe. Leaving and deleting moved into the ⋮ — both are done once
           and never read. What is left here is the error line, because a failed
           join or rename has to land somewhere you are already looking. */
        error && <p className="-mt-4 text-sm text-amber-600">{error}</p>
      )}

      {/* The people and the week they add up to, side by side from `lg`. Ticking
          someone off is a question asked *of* the grid, and with the list a
          screen above it you had to scroll back and forth to see the answer.
          Below `lg` there is no room for a second column, so they stack in the
          old order and the list keeps its own multi-column layout. */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* The handle on its right edge folds it away sideways, which is the
          point on a laptop: the detailed grid truncates course codes to make
          room for this column, and collapsed it hands all of that back. The
          arrow stays put across both states — it is the edge of the list, so
          it is where you reach for the list whether it is open or not. */}
      <aside
        className={`flex flex-col gap-2 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:shrink-0 ${
          listOpen ? "lg:w-56 xl:w-64" : "lg:w-auto"
        }`}
      >
        {/* justify-end plus mr-auto on the headings, rather than absolute
            positioning: collapsed there is nothing else in this row, and the
            arrow still lands on the right edge without the aside needing a
            height of its own. */}
        <div className="flex items-start justify-end gap-x-3">
          {listOpen && (
            <div className="mr-auto flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="font-medium">Group Member List</h2>
              <p className="text-xs text-neutral-500">
                Click a name to toggle them out
              </p>
              {shown.length < scheduled.length && (
                <button
                  onClick={() => setHidden(new Set())}
                  className="text-xs text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
                >
                  Include everyone
                </button>
              )}
              {/* The second door to the settings page, and the one people will
                  actually find: a name that needs fixing is read here, not up
                  in the header. Neutral rather than blue — the link above it
                  undoes a filter, which is this list's own business, and two
                  blue words side by side would read as a pair. */}
              {isAdmin && (
                <Link
                  href={`/g/${code}/settings`}
                  className="text-xs text-neutral-500 underline-offset-2 transition-colors hover:text-neutral-900 hover:underline dark:hover:text-neutral-100"
                >
                  Manage
                </Link>
              )}
            </div>
          )}
          {/* The heading stays when it's folded away, so the rail says what
              it is rather than leaving a bare arrow to be guessed at. It costs
              some of the width the collapse was buying back, which is the
              right trade — an unlabelled control nobody presses saves nothing. */}
          {!listOpen && <span className="mr-auto font-medium whitespace-nowrap">Group Member List</span>}
          <CollapseHandle open={listOpen} onToggle={() => setListOpen((v) => !v)} />
        </div>
        {listOpen && (
        <>
        {/* The scroll lives on the list alone, so a long group scrolls under a
            heading and a note that stay put. `min-h-0` because a flex child
            defaults to its content's height and would push the column past the
            viewport instead of scrolling inside it. */}
        <ul id="group-list" className="grid gap-2 sm:grid-cols-2 lg:min-h-0 lg:flex-1 lg:grid-cols-1 lg:overflow-y-auto xl:grid-cols-1">
          {state.members.map((m) => {
            const hasSchedule = scheduled.some((s) => s.id === m.id);
            const on = hasSchedule && !hidden.has(m.id);
            const unresolved = state.unresolved[m.id]?.length ?? 0;
            return (
              <li key={m.id}>
                <label
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                    hasSchedule
                      ? on
                        ? "border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
                        : "border-dashed border-neutral-300 opacity-55 hover:opacity-80 dark:border-neutral-700"
                      : "cursor-not-allowed border-dashed border-neutral-200 opacity-55 dark:border-neutral-800"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!hasSchedule}
                    onChange={() =>
                      setHidden((cur) => {
                        const next = new Set(cur);
                        if (next.has(m.id)) next.delete(m.id);
                        else next.add(m.id);
                        return next;
                      })
                    }
                    className="peer sr-only"
                  />
                  {/* A hairline ring that fills when they're counted — the row
                      already carries the state in its border and opacity, so
                      the toggle only has to hint, not shout. */}
                  <span
                    aria-hidden
                    className="h-3 w-3 shrink-0 rounded-full border border-neutral-400 transition-colors peer-checked:border-neutral-900 peer-checked:bg-neutral-900 peer-focus-visible:ring-2 peer-focus-visible:ring-neutral-400 dark:border-neutral-600 dark:peer-checked:border-white dark:peer-checked:bg-white"
                  />
                  {m.image ? (
                    <Image src={m.image} alt="" width={18} height={18} className="shrink-0 rounded-full" />
                  ) : (
                    <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: m.color }} />
                  )}
                  <span className="truncate font-medium" style={{ color: m.color }}>
                    {m.displayName}
                  </span>
                  {m.sfuVerified && (
                    /* An invite code is the only lock on this page, so a
                       roster can fill up with names you half-recognise. This
                       says one narrow, checkable thing: CAS let them in, so
                       they're at SFU. It deliberately doesn't say who — the
                       computing ID never leaves the server. */
                    <span
                      title="Signed in with an SFU computing ID"
                      aria-label="SFU verified"
                      className="shrink-0 text-xs leading-none text-[#a6192e] dark:text-red-400"
                    >
                      ✓
                    </span>
                  )}
                  {m.userId !== null && m.userId === state.group.ownerUserId && (
                    <span
                      title="Created this group"
                      className="shrink-0 rounded border border-neutral-300 px-1 text-[10px] uppercase tracking-wide text-neutral-500 dark:border-neutral-700"
                    >
                      Admin
                    </span>
                  )}
                  {/* Their word on the whole of today. Nothing shows for the
                      ordinary case, so a badge here always means a deviation —
                      which is the only reason to look. */}
                  {todayShown && m.userId !== null && (() => {
                    const { status, note } = resolveStatus(state.attendance, m.userId, today, null);
                    if (status === "going") return null;
                    return (
                      <span
                        title={note ?? `${STATUS_EFFECT[status].label} today`}
                        className={`shrink-0 rounded border px-1 text-[10px] uppercase tracking-wide ${
                          status === "remote"
                            ? "border-blue-300 text-blue-600 dark:border-blue-800 dark:text-blue-400"
                            : "border-dashed border-neutral-400 text-neutral-500 dark:border-neutral-600"
                        }`}
                      >
                        {status === "remote" ? "Online" : "Not in"}
                      </span>
                    );
                  })()}
                  {/* On your own row the count is the way to change it.
                      A list of the sections themselves used to sit under here,
                      and it was a stack of identical chips restating the blocks
                      three inches to the right — in a group every course of
                      yours is drawn in your one member colour, so the swatches
                      were five copies of the same dot. The count is the part
                      that was telling you something.

                      A link, not a button inside the label: interactive content
                      inside a <label> doesn't forward its click to the control,
                      so following it doesn't also tick you off the grid. */}
                  {me && m.id === me.id ? (
                    <Link
                      href={`/courses?term=${state.group.term}&next=${encodeURIComponent(`/g/${code}`)}`}
                      className="ml-auto shrink-0 text-xs text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {hasSchedule
                        ? `${m.classNumbers.length} section${m.classNumbers.length === 1 ? "" : "s"} →`
                        : "add your courses →"}
                    </Link>
                  ) : (
                    <span className="ml-auto shrink-0 text-xs text-neutral-500">
                      {!hasSchedule
                        ? "no schedule yet"
                        : `${m.classNumbers.length} section${m.classNumbers.length === 1 ? "" : "s"}`}
                    </span>
                  )}
                  {unresolved > 0 && (
                    <span
                      className="shrink-0 text-xs text-amber-600"
                      title={`Not in ${fromTermCode(state.group.term)}: ${state.unresolved[m.id].join(", ")}`}
                    >
                      ⚠ {unresolved}
                    </span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
        {/* Why the grid below isn't answering the question yet. Three
            different problems with three different fixes, so they get three
            lines — but a line each, in a column this narrow. */}
        {shown.length < 2 && (
          <p className="text-sm text-amber-600 lg:text-xs">
            {scheduled.length === 0
              ? "No schedules yet. Add yours, then share the link."
              : scheduled.length === 1
                ? "One schedule so far. Share the link to find overlap."
                : "Tick two people back on to see an overlap."}
          </p>
        )}
        </>
        )}
      </aside>

      <div className="@container flex min-w-0 flex-1 flex-col gap-6">
      {!weekInTerm(thisMonday) && (
        <p className="text-xs text-neutral-500">
          Today falls outside {fromTermCode(state.group.term)}, so this starts at
          the first week of term.
        </p>
      )}

      {/* Three tracks so the date sits dead centre no matter what flanks it:
          the "This week" button comes and goes, and the toggle is wider than
          it, so putting either beside the arrows would drag the date off
          centre. Otherwise there is one wrapped, centred row.

          A container query, not a media query: what decides whether the three
          tracks fit is the width of this column, and that stopped tracking the
          viewport the day the member list started sitting beside it. The
          threshold is what the layout actually costs — the outer tracks are
          `1fr` each, so the empty left one is forced to mirror the right one,
          and the row needs twice the controls plus the date. Under that it
          squeezed instead, clipping "Detailed" and wrapping "Export Calendar"
          onto two lines. */}
      <div className="flex flex-wrap items-center justify-center gap-2 @min-[68rem]:grid @min-[68rem]:grid-cols-[1fr_auto_1fr]">
        <div className="flex items-center gap-2 @min-[68rem]:justify-self-start">
          {week !== thisMonday && weekInTerm(thisMonday) && (
            <button
              onClick={() => setWeek(thisMonday)}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              This week
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => week && setWeek(addDays(week, -7))}
            disabled={!canPage(-1)}
            aria-label="Previous week"
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-lg leading-none transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            ←
          </button>
          <span className="min-w-[12rem] text-center text-lg font-medium tabular-nums">
            {week ? `${shortDate(week)} – ${shortDate(addDays(week, 4))}` : "—"}
          </span>
          <button
            onClick={() => week && setWeek(addDays(week, 7))}
            disabled={!canPage(1)}
            aria-label="Next week"
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-lg leading-none transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            →
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 @min-[68rem]:flex-nowrap @min-[68rem]:justify-self-end">
          {/* Two readings of the same week, and picking one here pins it —
              otherwise `grid` above decides from how many schedules are in. */}
          <div className="flex shrink-0 overflow-hidden rounded-lg border border-neutral-300 text-sm dark:border-neutral-700">
            {(["heat", "detailed"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setGrid(mode)}
                aria-pressed={grid === mode}
                className={`px-3 py-1.5 transition-colors ${
                  grid === mode
                    ? "bg-neutral-900 font-medium text-white dark:bg-white dark:text-neutral-900"
                    : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
                }`}
              >
                {mode === "detailed" ? "Detailed" : "Availability"}
              </button>
            ))}
          </div>

          {/* Same row as the view toggle: these all act on the week on screen,
              and "this week's free windows" means whichever week that is. */}
          <CalendarTools groupCode={code} memberId={me?.id ?? null} />
        </div>
      </div>

      {grid === "heat" ? (
        <HeatGrid
          members={shown}
          busyByMember={state.busyByMember}
          dayStart={DAY_START}
          dayEnd={DAY_END}
          weekStart={week ?? undefined}
          attendance={attendance}
        />
      ) : (
        <WeekGrid
          members={shown}
          busyByMember={state.busyByMember}
          free={free}
          dayStart={DAY_START}
          dayEnd={DAY_END}
          weekStart={week ?? undefined}
          attendance={attendance}
        />
      )}

      {/* Directly under the grid, because that is where you go looking for a
          course you know someone is taking and can't find a block for. Set
          further off than the column's own gap: the grid ends on a row of
          empty evening cells, so a heading 24px under it reads as part of
          Friday rather than as the next thing. */}
      {unscheduledMembers.length > 0 && (
        <section className="my-6 sm:my-8">
          <h2 className="mb-1 font-medium">Async Classes</h2>
          <p className="mb-2 text-xs text-neutral-500">
            Online, async, co-op and independent study sections. They have no
            timetable slot, so they don&apos;t appear on the grid or affect the
            shading.
          </p>
          <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
            {unscheduledMembers.map(([member, sections]) =>
              sections.map((sec) => (
                <li
                  key={`${member.id}-${sec.classNumber}`}
                  className="flex items-baseline gap-2 rounded-lg border border-dashed border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
                >
                  <span className="h-2.5 w-2.5 shrink-0 translate-y-0.5 rounded-sm" style={{ backgroundColor: member.color }} />
                  <span className="font-medium">{sec.course}</span>
                  <span className="text-xs text-neutral-500">
                    {sec.section}{sec.sectionCode ? ` ${sec.sectionCode}` : ""}
                  </span>
                  <span className="ml-auto text-xs text-neutral-500">
                    {member.displayName}
                    {sec.deliveryMethod && sec.deliveryMethod !== "In Person" && (
                      <span className="ml-1 text-blue-600 dark:text-blue-400">
                        · {sec.deliveryMethod}
                      </span>
                    )}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      )}
      </div>
      </div>

      {/* Outside the flow: it is in the top layer when open and nothing at all
          when closed. `join=1` is what the auto-join effect above acts on. */}
      <AccountGate
        open={gateOpen}
        onClose={() => setGateAsked(false)}
        groupName={state.group.name}
        next={`/g/${code}?join=1`}
      />
    </main>
  );
}

/** One option in the group switcher. Selected reads as filled, like the nav. */
function Pill({
  href,
  current,
  title,
  children,
}: {
  href: string;
  current: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      title={title}
      className={`flex max-w-[14rem] items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
        current
          ? "border-neutral-900 bg-neutral-900 font-medium text-white dark:border-white dark:bg-white dark:text-neutral-900"
          : "border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
      }`}
    >
      {children}
    </Link>
  );
}

/**
 * The member list's collapse handle, on its right edge.
 *
 * Points the way the list will move: left to fold it away, right to bring it
 * back. The arrow never moves between the two states, so it stays the thing
 * you reach for either way.
 */
function CollapseHandle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const label = open ? "Collapse group member list" : "Expand group member list";
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="group-list"
      aria-label={label}
      title={label}
      className="-mr-1 shrink-0 rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className={`transition-transform ${open ? "rotate-180" : ""}`}
      >
        <path d="M4 2l4 4-4 4" />
      </svg>
    </button>
  );
}

function GearIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* A toothed cog, not a hub with rays — the rays read as brightness. */}
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

