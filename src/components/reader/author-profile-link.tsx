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
  onClick,
  ...rest
}: AuthorProfileLinkProps) {
  const navigate = useNavigate();
  const did = normalizeAuthorRef(authorRef);
  const href = authorProfilePath(did);

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
        void navigate({ to: "/u/$did", params: { did } });
      }}
      {...rest}
      {...stylex.props(
        styles.link,
        ...(linkStyle
          ? Array.isArray(linkStyle)
            ? linkStyle
            : [linkStyle]
          : []),
      )}
    >
      {children}
    </a>
  );
}
