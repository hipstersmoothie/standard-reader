import type { LinkProps as AriaLinkProps } from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { use } from "react";
import { Link as AriaLink } from "react-aria-components";

import type { StyleXComponentProps } from "../theme/types";

import { primaryColor, uiColor } from "../theme/color.stylex";
import { gap, verticalSpace } from "../theme/semantic-spacing.stylex";
import { fontFamily, fontWeight } from "../theme/typography.stylex";
import { LinkContext } from "./link-context";

const styles = stylex.create({
  link: {
    "--underline-opacity": {
      default: 0,
      ":is([aria-expanded=true])": 1,
      ":is([data-breadcrumb] *)": 0,
      ":is([data-hovered])": 1,
    },
    gap: gap["md"],
    textDecoration: "none",
    alignItems: "center",
    color: {
      default: primaryColor.text2,
      ":is([data-breadcrumb] *)": uiColor.text1,
      ":is([data-breadcrumb][data-current] *)": uiColor.text2,
    },
    cursor: "pointer",
    display: "inline-flex",
    fontFamily: fontFamily["sans"],
    fontWeight: fontWeight["normal"],
    position: "relative",

    // eslint-disable-next-line @stylexjs/no-legacy-contextual-styles, @stylexjs/valid-styles
    ":is(*) svg": {
      height: "1.2em",
      width: "1.2em",
    },

    "::after": {
      backgroundColor: "currentColor",
      content: '""',
      display: "block",
      opacity: "var(--underline-opacity)",
      pointerEvents: "none",
      position: "absolute",
      bottom: `calc(${verticalSpace["xxs"]} * -1)`,
      height: "2px",
      left: 0,
      right: 0,
      width: "100%",
    },
  },
});

export interface LinkProps extends StyleXComponentProps<
  Omit<AriaLinkProps, "children">
> {
  children: React.ReactNode;
}

export function Link({ style, ...props }: LinkProps) {
  const context = use(LinkContext);

  return (
    <AriaLink {...props} {...stylex.props(styles.link, context.style, style)} />
  );
}
