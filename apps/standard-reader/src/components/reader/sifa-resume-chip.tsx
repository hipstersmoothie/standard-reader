import { Trans, useLingui } from "@lingui/react/macro";
import { Badge } from "@standard-reader/design-system/badge";
import { IconButton } from "@standard-reader/design-system/icon-button";
import { tracking } from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { useEffect, useState } from "react";

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
  badge: {
    letterSpacing: tracking.wide,
    textTransform: "uppercase",
  },
});

function openResume(href: string) {
  window.open(href, "_blank", "noopener,noreferrer");
}

export function SifaResumeChip({
  href,
  style,
  variant = "badge",
}: {
  href: string;
  style?: stylex.StyleXStyles;
  variant?: "badge" | "icon";
}) {
  const { t } = useLingui();

  if (variant === "icon") {
    return (
      <IconButton
        variant="secondary"
        size="md"
        label={t`Resume`}
        style={style}
        onPress={() => openResume(href)}
      >
        <FileText size={15} />
      </IconButton>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      {...stylex.props(styles.link)}
    >
      <Badge size="sm" variant="default" style={[styles.badge, style]}>
        <Trans>Resume</Trans>
      </Badge>
    </a>
  );
}

/** Invisible placeholder matching {@link SifaResumeChip} dimensions — reserves space while loading. */
function SifaResumeChipPlaceholder({
  style,
  variant = "badge",
}: {
  style?: stylex.StyleXStyles;
  variant?: "badge" | "icon";
}) {
  const { t } = useLingui();

  if (variant === "icon") {
    return (
      <IconButton
        variant="secondary"
        size="md"
        label={t`Resume`}
        aria-hidden
        style={[styles.placeholder, style]}
      >
        <FileText size={15} />
      </IconButton>
    );
  }

  return (
    <Badge
      size="sm"
      variant="default"
      aria-hidden
      style={[styles.badge, styles.placeholder, style]}
    >
      <Trans>Resume</Trans>
    </Badge>
  );
}

export function AuthorSifaResumeChip({
  did,
  handle,
  style,
  variant = "badge",
}: {
  did: string;
  handle: string | null;
  style?: stylex.StyleXStyles;
  variant?: "badge" | "icon";
}) {
  // The query result (chip, placeholder, or nothing) can legitimately differ
  // between the server render and the client's first pass — the loader's
  // prefetch for this is fire-and-forget, so whether it's settled by the time
  // the response is sent is timing-dependent. Gating on mount keeps the
  // hydration pass itself branch-free (always renders nothing), and only
  // resolves the real state in a client-only render right after.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data: sifaProfileUrl, isPending } = useQuery({
    ...authorApi.getAuthorSifaProfileQueryOptions(did, handle),
    enabled: mounted,
  });

  if (!mounted) return null;
  if (sifaProfileUrl) {
    return (
      <SifaResumeChip href={sifaProfileUrl} style={style} variant={variant} />
    );
  }
  if (isPending) {
    return <SifaResumeChipPlaceholder style={style} variant={variant} />;
  }
  return null;
}
