import * as stylex from "@stylexjs/stylex";
import { ChevronRight } from "lucide-react";
import type {
  BreadcrumbProps as AriaBreadcrumbProps,
  BreadcrumbsProps as AriaBreadcrumbsProps,
} from "react-aria-components";
import {
  Breadcrumb as AriaBreadcrumb,
  Breadcrumbs as AriaBreadcrumbs,
} from "react-aria-components";

import { directionalIconStyles } from "../directional-icon/styles";
import { uiColor } from "../theme/color.stylex";
import { gap } from "../theme/semantic-spacing.stylex";
import type { StyleXComponentProps } from "../theme/types";
import { fontWeight } from "../theme/typography.stylex";

const styles = stylex.create({
  breadcrumbs: {
    gap: gap["xs"],
    listStyle: "none",
    alignItems: "center",
    display: "flex",
    marginBottom: 0,
    marginInlineStart: 0,
    marginInlineEnd: 0,
    marginTop: 0,
    paddingBottom: 0,
    paddingInlineStart: 0,
    paddingInlineEnd: 0,
    paddingTop: 0,
  },
  breadcrumb: {
    gap: gap["xs"],
    alignItems: "center",
    color: {
      default: uiColor.text2,
      ":is([data-current])": uiColor.text1,
    },
    display: "flex",
    fontWeight: {
      default: fontWeight.normal,
      ":is([data-current])": fontWeight.medium,
    },
  },
  separator: {
    alignItems: "center",
    color: uiColor.text2,
    display: {
      default: "flex",
      ":is([data-breadcrumb]:last-child *)": "none",
    },
    opacity: {
      ":is([data-disabled])": 0.5,
    },
  },
  disabled: {
    opacity: 0.5,
    pointerEvents: "none",
  },
});

export interface BreadcrumbsProps<
  T extends object = object,
> extends StyleXComponentProps<Omit<AriaBreadcrumbsProps<T>, "children">> {
  isDisabled?: boolean;
  children?: React.ReactNode;
}

export interface BreadcrumbProps extends StyleXComponentProps<
  Omit<AriaBreadcrumbProps, "children">
> {
  children?: React.ReactNode;
}

export function Breadcrumbs<T extends object = object>({
  style,
  isDisabled,
  ...props
}: BreadcrumbsProps<T>) {
  return (
    <AriaBreadcrumbs
      {...props}
      data-disabled={isDisabled ? "" : undefined}
      {...stylex.props(
        styles.breadcrumbs,
        isDisabled && styles.disabled,
        style,
      )}
    />
  );
}

export function Breadcrumb({ style, ...props }: BreadcrumbProps) {
  return (
    <AriaBreadcrumb
      {...props}
      {...stylex.props(styles.breadcrumb, style)}
      data-breadcrumb
    >
      {props.children}
      <ChevronRight
        size={16}
        aria-hidden="true"
        {...stylex.props(directionalIconStyles.mirror, styles.separator)}
      />
    </AriaBreadcrumb>
  );
}
