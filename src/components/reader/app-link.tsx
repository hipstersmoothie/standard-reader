"use client";

import type { LinkProps } from "@tanstack/react-router";

import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { parseInternalRoute } from "#/lib/internal-route";

type AppLinkProps = Omit<React.ComponentProps<"a">, "href"> & {
  href: string;
  linkStyle?: stylex.StyleXStyles;
};

/** In-app client navigation for internal URLs; external links open in a new tab. */
export function AppLink({
  href,
  children,
  linkStyle,
  onClick,
  ...rest
}: AppLinkProps) {
  const route = parseInternalRoute(href);

  if (route) {
    const linkProps = route.params
      ? ({ to: route.to, params: route.params } satisfies LinkProps)
      : ({ to: route.to } satisfies LinkProps);

    return (
      <Link
        {...linkProps}
        {...rest}
        onClick={onClick}
        {...(linkStyle ? stylex.props(linkStyle) : {})}
      >
        {children}
      </Link>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={onClick}
      {...rest}
      {...(linkStyle ? stylex.props(linkStyle) : {})}
    >
      {children}
    </a>
  );
}
