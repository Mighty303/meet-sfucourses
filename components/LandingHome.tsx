import Image from "next/image";
import { GroupActions } from "@/components/GroupActions";
import { GuestSchedule } from "@/components/GuestSchedule";
import { Logo } from "@/components/Logo";

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
 * The pitch is now a full-bleed Burnaby campus hero — same photo and dark
 * gradient treatment as sfucourses (MIT; see LICENSE.sfucourses), with the
 * brand sitting on top of the place the free time is about. Under that, one
 * question — which courses are you in — answered in a search box and drawn as
 * a real week. See GuestSchedule for where those sections live before there
 * is an account to put them on.
 *
 * Wider than it was, because a week grid is now the centre of the page rather
 * than a screenshot under it.
 */
export function LandingHome() {
  return (
    <>
      <section
        aria-label="Introduction"
        className="relative flex min-h-[min(72vh,36rem)] w-full items-center justify-center overflow-hidden"
      >
        <Image
          src="/landing-hero.webp"
          alt="Simon Fraser University Burnaby campus panorama"
          fill
          preload
          sizes="100vw"
          className="hero-image object-cover object-center"
        />
        {/* Dark wash so white type holds over bright sky and glass — same
            #141515 → transparent stop sfucourses uses on its landing hero. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-[#141515] to-[rgba(20,21,21,0.75)]"
        />

        <div className="hero-copy relative z-10 mx-auto flex w-full max-w-2xl flex-col items-center px-6 py-16 text-center text-white sm:py-20">
          <Logo size={56} />
          <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
            meet.sfucourses.com
          </h1>
          <p className="mt-3 max-w-md text-base text-white/80 sm:text-lg">
            Everyone drops their SFU schedule in. The grid shows when you&apos;re
            all free on campus at the same time.
          </p>
          <a
            href="#your-week"
            className="mt-8 rounded-lg bg-white px-5 py-2.5 font-medium text-neutral-900 transition-opacity hover:opacity-90"
          >
            Add your courses
          </a>
        </div>
      </section>

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 p-6 pb-20 sm:pb-24">
        {/* Staggered a couple of hundred milliseconds apart: the page is a few
            blocks stacked down the middle, and arriving together makes them read
            as one wall. Inline delays rather than nth-child utilities, because
            the two halves of the home page have different numbers of blocks and
            a positional rule would have to be rewritten per half. */}
        <div id="your-week" className="fade-up scroll-mt-6">
          <GuestSchedule />
        </div>

        {/* Last, because it is the second question. Your own week is worth
            something on its own — the group is what you do with it once you've
            seen it, and asking before then is asking someone to invite friends
            to a thing they haven't looked at. */}
        <GroupActions startDelay={120} />
      </main>
    </>
  );
}
