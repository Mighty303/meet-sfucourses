/**
 * A compact marker for the narrow claim made by SFU CAS: this member signed in
 * with an SFU computing ID. The boxed initials identify what was checked; the
 * check keeps the meaning clear without implying a broader identity review.
 */
export function SfuVerifiedBadge() {
  return (
    <span
      title="Signed in with an SFU computing ID"
      aria-label="SFU verified"
      className="inline-flex h-[18px] shrink-0 items-center gap-0.5 rounded border border-[#a6192e] px-1 text-[10px] font-bold leading-none tracking-wide text-[#a6192e] dark:border-red-400 dark:text-red-400"
    >
      SFU
      <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <path d="m1.5 5 2.2 2.2 4.8-4.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
