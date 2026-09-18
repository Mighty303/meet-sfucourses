import { Avatar } from "@/components/Avatar";
import { LinkSfuCta } from "@/components/LinkSfuCta";
import type { LinkSfuOffer } from "@/lib/link-sfu-offer";

/**
 * Static fixture for the profile Link-SFU CTA and the intent=sfu link page.
 * Not linked from the app — open /dev/link-sfu. Preview deployments cannot
 * complete Google/CAS sign-in, so this is how to review the copy and layout.
 */

const CASES: { title: string; email: string; offer: LinkSfuOffer; note: string }[] = [
  {
    title: "Google account, no SFU yet (CAS on)",
    email: "martinwong303@gmail.com",
    offer: "link",
    note: "The CTA this PR ships. Personal Gmail never hits the first-SFU collision offer.",
  },
  {
    title: "Already linked",
    email: "mwa147@sfu.ca",
    offer: "linked",
    note: "Button hidden once this account holds an SFU door.",
  },
  {
    title: "CAS off",
    email: "martinwong303@gmail.com",
    offer: "fold",
    note: "Falls back to the generic fold blurb when SFU sign-in is not enabled.",
  },
];

function ProfileCard({
  email,
  offer,
}: {
  email: string;
  offer: LinkSfuOffer;
}) {
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <Avatar src={null} name={email} size={56} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{email}</p>
        <p className="truncate text-sm text-neutral-500">{email}</p>
        <p className="mt-2 text-xs text-neutral-500">
          The name above is the one on your account. The per-group names below
          are the ones you can change.
        </p>
        <LinkSfuCta offer={offer} />
      </div>
    </section>
  );
}

export default function LinkSfuPreviewPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-4 sm:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Link SFU preview</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          No sign-in. Fixture of the profile CTA states and the{" "}
          <code className="text-xs">/profile/link?intent=sfu</code> start screen.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="font-medium">On /profile</h2>
        {CASES.map((c) => (
          <div key={c.title} className="flex flex-col gap-2">
            <div>
              <h3 className="text-sm font-medium">{c.title}</h3>
              <p className="text-xs text-neutral-500">{c.note}</p>
            </div>
            <ProfileCard email={c.email} offer={c.offer} />
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-medium">On /profile/link?intent=sfu</h2>
          <p className="text-xs text-neutral-500">
            Start screen before the challenge round-trip. Button is inert here.
          </p>
        </div>
        <div className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <h3 className="text-xl font-semibold tracking-tight">
            One account, several sign-ins
          </h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Sign in with your SFU ID to fold it into this account. Your groups
            stay; afterwards either sign-in opens them, and the account wears
            your @sfu.ca address.
          </p>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Nothing happens on an address alone. You&apos;ll be signed out, sign
            in as the other account, and come back here to see exactly what
            would move before anything does.
          </p>
          <button
            type="button"
            disabled
            className="flex items-center justify-center gap-2.5 self-start rounded-lg bg-[#a6192e] px-4 py-2.5 font-medium text-white opacity-50"
          >
            <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden>
              <path
                d="M9 1.5 16 5v8L9 16.5 2 13V5l7-3.5Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
            Continue with your SFU ID
          </button>
        </div>
      </section>
    </main>
  );
}
