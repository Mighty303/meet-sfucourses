import Link from "next/link";
import type { LinkSfuOffer } from "@/lib/link-sfu-offer";

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
        <Link
          href="/profile/link?intent=sfu"
          className="self-start rounded-lg border border-neutral-300 px-3 py-1.5 text-sm transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
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
