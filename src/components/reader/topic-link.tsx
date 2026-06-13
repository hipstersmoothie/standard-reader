"use client";

import * as stylex from "@stylexjs/stylex";
import { useNavigate } from "@tanstack/react-router";
import { tagPagePath } from "#/components/reader/format";
import { primaryColor } from "#/design-system/theme/color.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  tracking,
} from "#/design-system/theme/typography.stylex";

/** Block parent card links from also navigating (see `stopSaveClick` in cards). */
function stopNestedNavigation(event: React.SyntheticEvent<HTMLElement>) {
  event.preventDefault();
  event.stopPropagation();
}

const styles = stylex.create({
  topic: {
    color: primaryColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.wide,
    textTransform: "uppercase",
  },
  link: {
    textDecoration: { default: "none", ":hover": "underline" },
    cursor: "pointer",
    textDecorationColor: "currentColor",
    textUnderlineOffset: "2px",
  },
  nestedInteractive: {
    pointerEvents: "auto",
    position: "relative",
    zIndex: 1,
  },
});

type TopicProps = {
  name: string | null;
  /** When false, render plain text (e.g. page headings). */
  linkable?: boolean;
  /**
   * Use a focusable span + client navigation instead of `<a>`. Required when
   * nested inside another link (e.g. article or publication cards).
   */
  nested?: boolean;
};

export function Topic({ name, linkable = true, nested = false }: TopicProps) {
  const navigate = useNavigate();

  if (!name) return null;

  const mergedStyle = stylex.props(styles.topic, linkable && styles.link);

  const goToTag = () => {
    void navigate({ to: "/tag/$tag", params: { tag: name } });
  };

  if (!linkable) {
    return <span {...mergedStyle}>{name}</span>;
  }

  const href = tagPagePath(name);

  if (nested) {
    return (
      <span
        // oxlint-disable-next-line jsx_a11y/prefer-tag-over-role -- nested inside parent card link
        role="link"
        tabIndex={0}
        onClick={(event) => {
          if (event.button === 0) {
            stopNestedNavigation(event);
            goToTag();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            stopNestedNavigation(event);
            goToTag();
          }
        }}
        {...stylex.props(styles.topic, styles.link, styles.nestedInteractive)}
      >
        {name}
      </span>
    );
  }

  return (
    <a
      href={href}
      onClick={(event) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        goToTag();
      }}
      {...mergedStyle}
    >
      {name}
    </a>
  );
}
