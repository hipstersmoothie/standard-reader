import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "#/design-system/badge";
import { authorApi } from "#/integrations/tanstack-query/api-author.functions";

const styles = stylex.create({
  link: {
    textDecoration: "none",
    color: "inherit",
  },
  placeholder: {
    flexShrink: 0,
    visibility: "hidden",
  },
});

export function SifaResumeChip({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      {...stylex.props(styles.link)}
    >
      <Badge size="sm" variant="default">
        Resume
      </Badge>
    </a>
  );
}

/** Invisible badge matching {@link SifaResumeChip} dimensions — reserves space while loading. */
function SifaResumeChipPlaceholder() {
  return (
    <Badge size="sm" variant="default" aria-hidden style={styles.placeholder}>
      Resume
    </Badge>
  );
}

export function AuthorSifaResumeChip({
  did,
  handle,
}: {
  did: string;
  handle: string | null;
}) {
  const { data: sifaProfileUrl, isPending } = useQuery(
    authorApi.getAuthorSifaProfileQueryOptions(did, handle),
  );

  if (sifaProfileUrl) {
    return <SifaResumeChip href={sifaProfileUrl} />;
  }
  if (isPending) {
    return <SifaResumeChipPlaceholder />;
  }
  return null;
}
