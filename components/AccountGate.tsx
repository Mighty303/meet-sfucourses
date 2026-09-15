"use client";

import { Modal } from "@/components/Modal";
import { useSfuDoor } from "@/components/SfuDoor";
import { SignInPanel } from "@/components/SignInPanel";

/**
 * The account, asked for at the moment it is actually needed.
 *
 * Reading a group's week needs nothing, and the page says so by simply drawing
 * it. What needs an account is putting your own classes on it: a schedule is
 * stored against a user, and there is nowhere to put one until there is a
 * user. So the ask is attached to that press rather than to arriving — which
 * is what the panel above the grid used to do, spending a heading, a paragraph
 * and two links on a decision the visitor had no information to make yet.
 *
 * SignInPanel unchanged inside it: the SFU door, Google, email and password,
 * and the flip between signing in and creating an account. `next` lands them
 * back here with `join=1`, which the group page acts on by adding them without
 * a second press.
 */
export function AccountGate({
  open,
  onClose,
  groupName,
  next,
}: {
  open: boolean;
  onClose: () => void;
  /** Named in the sentence, so the modal says which group it is about. */
  groupName: string;
  /** Already a path on this site — see joinHref on the group page. */
  next: string;
}) {
  // From the root layout rather than a prop: every component between here and
  // it is "use client", so there is nothing on the way down that could ask.
  const sfu = useSfuDoor();
  return (
    <Modal open={open} onClose={onClose} title="Add your schedule" width="28rem">
      <div className="flex flex-col gap-4 px-5 py-5">
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          Your classes are saved against an account, so this is the one part
          that needs one. You&apos;ll be added to{" "}
          <span className="font-medium text-neutral-900 dark:text-neutral-100">{groupName}</span>{" "}
          as soon as you&apos;re back.
        </p>
        <SignInPanel next={next} sfu={sfu} />
      </div>
    </Modal>
  );
}
