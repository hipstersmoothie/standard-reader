import { Avatar } from "@standard-reader/design-system/avatar";

/** First letters of the first two name parts, e.g. "Mara Delgado" → "MD". */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

interface NameAvatarProps {
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
}

/** Design-system Avatar seeded from a display name (initials fallback). */
export function NameAvatar({ name, size }: NameAvatarProps) {
  return <Avatar fallback={initials(name)} alt={name} size={size} />;
}
