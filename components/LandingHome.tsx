import { GroupActions } from "@/components/GroupActions";
import { GuestSchedule } from "@/components/GuestSchedule";

/**
 * What "/" is for someone who hasn't signed in: what the thing is, and then
 * the thing.
 *
 * It used to be four blocks stacked down the middle — a pitch, a card offering
 * an account two ways, a demo of invented people, and two open forms for
 * starting or joining a group. Five calls to action and two forms, none of
 * which showed you anything about your own week, and all of it on screen at
 * once. The account card is gone entirely: nothing here writes to the database
 * until you ask it to, so there is nothing to sign in for yet, and the nav
 * still has the door for people who already have a key.
 *
 * What replaces it is one question — which courses are you in — answered in a
 * search box, drawn as a real week underneath. See GuestSchedule for where
 * those sections live before there is an account to put them on.
 *
 * Wider than it was, because a week grid is now the centre of the page rather
 * than a screenshot under it.
 */
export function LandingHome() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-6 pb-20 sm:pb-24">
      {/* Staggered a couple of hundred milliseconds apart: the page is a few
          blocks stacked down the middle, and arriving together makes them read
          as one wall. Inline delays rather than nth-child utilities, because
          the two halves of the home page have different numbers of blocks and
          a positional rule would have to be rewritten per half. */}
      <div className="fade-up mx-auto w-full max-w-lg">
        {/* The mark's two colours, run across the name it belongs to. Green
            holds through "meet." and the turn to yellow takes the rest, so the
            dot lands where the colour changes.

            `w-fit` because a clipped background is the size of its box, not
            its type — left as a block it would stretch the ramp across the
            column and show only the green end. */}
        <h1 className="w-fit bg-gradient-to-r from-[#0f8a6d] from-30% to-[#b8860b] bg-clip-text text-4xl font-semibold tracking-tight text-transparent dark:from-[#24a98b] dark:to-[#ffdf00]">
          meet.sfucourses.com
        </h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Everyone drops their SFU schedule in. The grid shows when you&apos;re all free
          on campus at the same time.
        </p>
        <ol className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4" aria-label="How it works">
          {[
            "Search & add",
            "Create group",
            "Sign in",
            "Invite friends",
          ].map((step, index) => (
            <li key={step} className="flex items-start gap-2 text-neutral-500 dark:text-neutral-400">
              <span className="font-semibold text-neutral-900 dark:text-neutral-100">{index + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="fade-up" style={{ animationDelay: "120ms" }}>
        <GuestSchedule />
      </div>

      {/* Last, because it is the second question. Your own week is worth
          something on its own — the group is what you do with it once you've
          seen it, and asking before then is asking someone to invite friends
          to a thing they haven't looked at. */}
      <GroupActions startDelay={240} />
    </main>
  );
}
