import { Avatar } from "@standard-reader/design-system/avatar";

/** First letters of the first two name parts, e.g. "Mara Delgado" → "MD". */
function initials(name: string): string {
  const parts = name
    .replace(/^@/, "")
    .split(/[\s.]+/)
    .filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

interface NameAvatarProps {
  name: string;
  /** Optional avatar image URL; falls back to initials when absent/broken. */
  src?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
}

/** Design-system Avatar seeded from a display name, with an optional image. */
export function NameAvatar({ name, src, size }: NameAvatarProps) {
  return (
    <Avatar
      src={src ?? undefined}
      fallback={initials(name)}
      alt={name}
      size={size}
    />
  );
}
