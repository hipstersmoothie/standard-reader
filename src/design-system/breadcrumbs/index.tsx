import type {
  BreadcrumbProps as AriaBreadcrumbProps,
  BreadcrumbsProps as AriaBreadcrumbsProps,
} from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { ChevronRight } from "lucide-react";
import {
  Breadcrumb as AriaBreadcrumb,
  Breadcrumbs as AriaBreadcrumbs,
} from "react-aria-components";

import type { StyleXComponentProps } from "../theme/types";

import { uiColor } from "../theme/color.stylex";
import { gap } from "../theme/semantic-spacing.stylex";
import { fontWeight } from "../theme/typography.stylex";

const styles = stylex.create({
  breadcrumbs: {
    marginBottom: 0,
    marginLeft: 0,
    marginRight: 0,
    marginTop: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    gap: gap["xs"],
    paddingRight: 0,
    listStyle: "none",
    paddingTop: 0,
    alignItems: "center",
    display: "flex",
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
        {...stylex.props(styles.separator)}
      />
    </AriaBreadcrumb>
  );
}
