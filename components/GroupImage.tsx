import Image from "next/image";

interface Props {
  src: string | null;
  name: string;
  size?: number;
  color?: string;
  className?: string;
}

/** A group's chosen square image, with the existing people icon as fallback. */
export function GroupImage({
  src,
  name,
  size = 44,
  color = "#737373",
  className = "",
}: Props) {
  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        className={`shrink-0 rounded-lg object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-hidden
      title={name}
      className={`flex shrink-0 items-center justify-center rounded-lg ${className}`}
      style={{ width: size, height: size, backgroundColor: `${color}22`, color }}
    >
      <GroupIcon size={Math.max(14, Math.round(size / 2))} />
    </span>
  );
}

function GroupIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="7.5" cy="7" r="2.75" />
      <path d="M2.5 16c0-2.5 2.2-4.25 5-4.25S12.5 13.5 12.5 16" />
      <path d="M13.25 5.1a2.75 2.75 0 0 1 0 5.3" />
      <path d="M14.5 12.2c1.9.5 3 1.9 3 3.8" />
    </svg>
  );
}
