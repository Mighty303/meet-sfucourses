import Link from "next/link";
import type { LinkSfuOffer } from "@/lib/link-sfu-offer";

/** Same chrome as SignInPanel's SFU door — crimson, mark, full-width feel. */
const SFU_BUTTON =
  "flex items-center justify-center gap-2.5 rounded-lg bg-[#a6192e] px-4 py-2.5 font-medium text-white transition-opacity hover:opacity-90";

/**
 * Profile copy for attaching an SFU Computing ID (or the generic fold blurb
 * when CAS is off). Visibility is decided by `linkSfuOffer` so the page and
 * the unit tests share one rule.
 */
export function LinkSfuCta({ offer }: { offer: LinkSfuOffer }) {
  if (offer === "link") {
    return (
      <div className="mt-3 flex flex-col gap-2">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Sign in with your SFU ID and keep the groups on this account.
        </p>
        <Link href="/profile/link?intent=sfu" className={`self-start ${SFU_BUTTON}`}>
          <SfuMark />
          Link your SFU ID
        </Link>
      </div>
    );
  }
  if (offer === "linked") {
    return <p className="mt-2 text-xs text-neutral-500">SFU ID linked.</p>;
  }
  if (offer === "fold") {
    return (
      <p className="mt-2 text-xs text-neutral-500">
        Signed in here another way before?{" "}
        <Link
          href="/profile/link"
          className="text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
        >
          Fold your accounts into one
        </Link>
        .
      </p>
    );
  }
  return null;
}

/** SFU's own red mark — same glyph as the sign-in panel, not an official logo. */
function SfuMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M9 1.5 16 5v8L9 16.5 2 13V5l7-3.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
