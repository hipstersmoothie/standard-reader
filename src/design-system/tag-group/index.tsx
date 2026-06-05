import type {
  TagGroupProps as AriaTagGroupProps,
  TagProps as AriaTagProps,
  TagListProps,
} from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { X } from "lucide-react";
import {
  Tag as AriaTag,
  TagGroup as AriaTagGroup,
  Button,
  TagList,
} from "react-aria-components";

import type { StyleXComponentProps } from "../theme/types";

import { Description, ErrorMessage, Label } from "../label";
import { animationDuration } from "../theme/animations.stylex";
import { primaryColor, uiColor } from "../theme/color.stylex";
import { mediaQueries } from "../theme/media-queries.stylex";
import { radius } from "../theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  size as sizeSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import { typeramp } from "../theme/typography.stylex";

const styles = stylex.create({
  group: {
    gap: gap["md"],
    display: "flex",
    flexDirection: "column",
  },
  list: {
    alignItems: "center",
    columnGap: gap["sm"],
    display: "flex",
    flexWrap: "wrap",
    rowGap: gap["lg"],
  },
  tag: {
    borderColor: {
      default: uiColor.border2,
      ":is([data-hovered])": uiColor.border3,
      ":is([data-selected])": primaryColor.border3,
    },
    borderRadius: radius.full,
    borderStyle: "solid",
    borderWidth: 1,
    gap: gap["sm"],
    alignItems: "center",
    backgroundColor: {
      default: uiColor.component1,
      ":is([data-hovered])": uiColor.component2,
      ":is([data-pressed])": uiColor.component3,
      ":is([data-selected])": primaryColor.component1,
    },
    color: {
      default: uiColor.text1,
      ":is([data-hovered])": uiColor.text2,
      ":is([data-selected])": primaryColor.text2,
    },
    cursor: "default",
    display: "flex",
    justifyContent: "center",
    opacity: {
      ":is([data-disabled])": 0.5,
    },
    paddingBottom: verticalSpace["xs"],
    paddingLeft: horizontalSpace["lg"],
    paddingRight: {
      default: horizontalSpace["lg"],
      ":has(button)": horizontalSpace["xs"],
    },
    paddingTop: verticalSpace["xs"],
  },
  removeButton: {
    marginBottom: 0,
    marginLeft: 0,
    marginRight: 0,
    marginTop: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    borderRadius: radius.full,
    paddingRight: 0,
    borderWidth: 0,
    paddingTop: 0,
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":is([data-hovered])": uiColor.component2,
      ":is([data-pressed])": uiColor.component3,
    },
    color: {
      default: uiColor.text1,
      ":is([data-hovered])": uiColor.text2,
    },
    display: "flex",
    justifyContent: "center",
    transitionDuration: animationDuration.fast,
    transitionProperty: {
      default: "background-color",
      [mediaQueries.reducedMotion]: "none",
    },
    transitionTimingFunction: "ease-in-out",
    height: sizeSpace["md"],
    width: sizeSpace["md"],
  },
  tagText: {
    // eslint-disable-next-line @stylexjs/valid-styles
    textBoxEdge: "cap alphabetic",
    // eslint-disable-next-line @stylexjs/valid-styles
    textBoxTrim: "trim-both",
    paddingBottom: verticalSpace["xxs"],
    paddingTop: verticalSpace["xxs"],
  },
});

interface TagGroupBaseProps<T>
  extends
    StyleXComponentProps<Omit<AriaTagGroupProps, "children">>,
    Pick<TagListProps<T>, "items" | "children" | "renderEmptyState"> {
  label?: string;
  description?: string;
  errorMessage?: string;
}

export function TagGroup<T extends object>({
  children,
  style,
  label,
  items,
  renderEmptyState,
  description,
  errorMessage,
  ...props
}: TagGroupBaseProps<T>) {
  return (
    <AriaTagGroup {...props} {...stylex.props(styles.group, style)}>
      {label != null && <Label>{label}</Label>}
      <TagList
        items={items}
        renderEmptyState={renderEmptyState}
        {...stylex.props(styles.list)}
      >
        {children}
      </TagList>
      {description && (
        <Description slot="description">{description}</Description>
      )}
      {errorMessage && <ErrorMessage>{errorMessage}</ErrorMessage>}
    </AriaTagGroup>
  );
}

export interface TagProps extends StyleXComponentProps<
  Omit<AriaTagProps, "children">
> {
  children?: React.ReactNode;
}

export function Tag({ children, style, ...props }: TagProps) {
  const textValue = typeof children === "string" ? children : undefined;

  return (
    <AriaTag
      textValue={textValue}
      {...props}
      {...stylex.props(styles.tag, typeramp.label, style)}
    >
      {({ allowsRemoving }) => (
        <>
          <span {...stylex.props(styles.tagText)}>{children}</span>
          {allowsRemoving && (
            <Button slot="remove" {...stylex.props(styles.removeButton)}>
              <X size={12} />
            </Button>
          )}
        </>
      )}
    </AriaTag>
  );
}
