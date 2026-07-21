"use client";

import * as stylex from "@stylexjs/stylex";
import type { LinkProps } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useHover, mergeProps } from "react-aria";

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
  const { hoverProps, isHovered } = useHover({});
  // `linkProps` (a huge `LinkProps` union) can't flow through `mergeProps`
  // without collapsing to a non-spreadable type, so merge only the plain DOM
  // props and spread the route props directly.
  const domProps = mergeProps(rest, hoverProps, { onClick });

  if (route) {
    const linkProps = route.params
      ? ({ to: route.to, params: route.params } satisfies LinkProps)
      : ({ to: route.to } satisfies LinkProps);

    return (
      <Link
        {...linkProps}
        {...domProps}
        data-hovered={isHovered || undefined}
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
      {...domProps}
      data-hovered={isHovered || undefined}
      {...(linkStyle ? stylex.props(linkStyle) : {})}
    >
      {children}
    </a>
  );
}
