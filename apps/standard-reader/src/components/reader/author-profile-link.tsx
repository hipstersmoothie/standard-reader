"use client";

import * as stylex from "@stylexjs/stylex";
import { useNavigate } from "@tanstack/react-router";

import { authorProfilePath, normalizeAuthorRef } from "#/lib/author-profile";

const styles = stylex.create({
  link: {
    textDecoration: { default: "none", ":hover": "underline" },
    color: "inherit",
    textDecorationColor: "currentColor",
    textUnderlineOffset: "2px",
  },
});

type AuthorProfileLinkProps = Omit<
  React.ComponentProps<"a">,
  "href" | "children"
> & {
  /** Author DID or handle. */
  authorRef: string;
  children: React.ReactNode;
  linkStyle?:
    | stylex.StyleXStyles
    | Array<stylex.StyleXStyles | false | undefined>;
  /**
   * Use a focusable span + client navigation instead of `<a>`. Required when
   * nested inside another link (e.g. article card bylines).
   */
  nested?: boolean;
};

/**
 * Link to `/u/$did`. Uses client navigation when possible; `stopPropagation`
 * keeps nested cards (publication rows, comment cards) from triggering their
 * parent click targets.
 */
export function AuthorProfileLink({
  authorRef,
  children,
  linkStyle,
  nested = false,
  onClick,
  ...rest
}: AuthorProfileLinkProps) {
  const navigate = useNavigate();
  const did = normalizeAuthorRef(authorRef);
  const href = authorProfilePath(did);

  const mergedStyle = stylex.props(
    styles.link,
    ...(linkStyle ? (Array.isArray(linkStyle) ? linkStyle : [linkStyle]) : []),
  );

  const goToProfile = () => {
    void navigate({ to: "/u/$did", params: { did } });
  };

  if (nested) {
    return (
      <span
        // oxlint-disable-next-line jsx_a11y/prefer-tag-over-role -- nested inside parent card link
        role="link"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          onClick?.(event as unknown as React.MouseEvent<HTMLAnchorElement>);
          if (
            !event.defaultPrevented &&
            event.button === 0 &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.shiftKey &&
            !event.altKey
          ) {
            // Cancel the enclosing article link's native navigation so a click
            // on the author only opens the profile, not the article too.
            event.preventDefault();
            goToProfile();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            goToProfile();
          }
        }}
        {...rest}
        {...mergedStyle}
      >
        {children}
      </span>
    );
  }

  return (
    <a
      href={href}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        goToProfile();
      }}
      {...rest}
      {...mergedStyle}
    >
      {children}
    </a>
  );
}
