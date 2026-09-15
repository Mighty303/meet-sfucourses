/**
 * The marks that sit at the left edge of a menu row.
 *
 * They started inside AuthButton, where the account menu was the only list of
 * rows in the app. The mobile nav menu is a second one, and it holds the same
 * Profile and Admin destinations plus the three pages the app is made of — so
 * the set moved here rather than being written twice in two hands.
 *
 * One hand for all of them: a 20-unit box, 1.75 stroke, no fill, drawn at 16px.
 * They take their colour from the row, which is what lets Sign out's turn red
 * on hover along with its label, and they are decorative — every row names its
 * destination in words, and the mark only repeats it for the eye.
 */

function RowIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

export function HomeIcon() {
  return (
    <RowIcon>
      <path d="M3.5 9.5L10 4l6.5 5.5" />
      <path d="M5.5 8.9V16h9V8.9" />
    </RowIcon>
  );
}

/* A list, because that is what the page hands back: the courses you picked. */
export function CoursesIcon() {
  return (
    <RowIcon>
      <path d="M4 6h.01M4 10h.01M4 14h.01" />
      <path d="M7.5 6H16M7.5 10H16M7.5 14H16" />
    </RowIcon>
  );
}

/* A calendar, not a week grid — at 16px the grid's cells close up into a box. */
export function ScheduleIcon() {
  return (
    <RowIcon>
      <rect x="3.5" y="5" width="13" height="11" rx="1.5" />
      <path d="M3.5 8.5h13" />
      <path d="M7 3.5V5M13 3.5V5" />
    </RowIcon>
  );
}

export function PersonIcon() {
  return (
    <RowIcon>
      <circle cx="10" cy="7" r="3" />
      <path d="M4.5 16.5c1.1-2.4 3-3.6 5.5-3.6s4.4 1.2 5.5 3.6" />
    </RowIcon>
  );
}

export function ShieldIcon() {
  return (
    <RowIcon>
      <path d="M10 3l5.5 2v4.3c0 3.2-2.2 5.7-5.5 6.7-3.3-1-5.5-3.5-5.5-6.7V5z" />
    </RowIcon>
  );
}

/* The arrow leaves through the gap in the box, which is the door. */
export function LeaveIcon() {
  return (
    <RowIcon>
      <path d="M8 4.5H5.5A1.5 1.5 0 0 0 4 6v8a1.5 1.5 0 0 0 1.5 1.5H8" />
      <path d="M12.5 13L15.5 10 12.5 7" />
      <path d="M15.5 10H8" />
    </RowIcon>
  );
}
