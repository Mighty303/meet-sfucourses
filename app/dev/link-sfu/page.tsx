import { Avatar } from "@/components/Avatar";
import { LinkSfuCta } from "@/components/LinkSfuCta";
import type { LinkSfuOffer } from "@/lib/link-sfu-offer";

/**
 * Static fixture for the profile Link-SFU CTA states. Not linked from the app —
 * open /dev/link-sfu. Preview deployments cannot complete Google/CAS sign-in,
 * so this is how to review the copy and layout. The real button starts the
 * challenge and goes straight to CAS (no middle explainer page).
 */

const CASES: { title: string; email: string; offer: LinkSfuOffer; note: string }[] = [
  {
    title: "Google account, no SFU yet (CAS on)",
    email: "martinwong303@gmail.com",
    offer: "link",
    note: "Clicking Link your SFU email starts the challenge and sends you to CAS — then /profile/link only for the confirm screen.",
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
    <section className="flex flex-wrap items-center gap-4 rounded-lg border border-neutral-200 p-6 dark:border-neutral-800">
      <Avatar src={null} name={email} size={56} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{email}</p>
        <p className="truncate text-sm text-neutral-500">{email}</p>
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
          No sign-in. Fixture of the profile CTA states. Buttons here are inert
          (no session to start a challenge from).
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
    </main>
  );
}
