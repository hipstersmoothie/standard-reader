"use client";

import * as stylex from "@stylexjs/stylex";
import { use } from "react";

import type { Size, StyleXComponentProps } from "../theme/types";

import { SizeContext } from "../context";
import { ui } from "../theme/semantic-color.stylex";
import {
  gap,
  horizontalSpace,
  size as sizeSpace,
} from "../theme/semantic-spacing.stylex";
import { fontFamily, fontSize, fontWeight } from "../theme/typography.stylex";

const styles = stylex.create({
  emptyState: {
    "--empty-state-image-size": {
      ":is([data-empty-state-size=lg])": sizeSpace["7xl"],
      ":is([data-empty-state-size=md])": sizeSpace["5xl"],
      ":is([data-empty-state-size=sm])": sizeSpace["4xl"],
    },
    gridTemplateAreas: {
      // eslint-disable-next-line @stylexjs/valid-styles
      ":is([data-empty-state-size=md],[data-empty-state-size=lg])": {
        default: `
          "image"
          "title"
          "description"
        `,
        ":has([data-empty-state-actions])": `
          "image"
          "title"
          "description"
          "actions"
        `,
      },
      // eslint-disable-next-line @stylexjs/valid-styles
      ":is([data-empty-state-size=sm])": {
        default: `
          "image title"
          "image description"
        `,
        ":has([data-empty-state-actions])": `
          "image title actions"
          "image description actions"
        `,
      },
    },
    alignItems: "center",
    columnGap: {
      ":is([data-empty-state-size=sm])": sizeSpace["md"],
    },
    display: "grid",
    fontFamily: fontFamily["sans"],
    gridTemplateColumns: {
      // eslint-disable-next-line @stylexjs/valid-styles
      ":is([data-empty-state-size=sm])": {
        default: "min-content 1fr",
        ":has([data-empty-state-actions])": "min-content 1fr max-content",
      },
    },
    justifyItems: {
      ":is([data-empty-state-size=md],[data-empty-state-size=lg])": "center",
      ":is([data-empty-state-size=sm])": "start",
    },
    rowGap: {
      ":is([data-empty-state-size=lg])": sizeSpace["xl"],
      ":is([data-empty-state-size=md])": sizeSpace["md"],
      ":is([data-empty-state-size=sm])": sizeSpace["sm"],
    },
    textAlign: "center",
  },
  image: {
    gridColumnEnd: 'image',
    gridColumnStart: 'image',
    gridRowEnd: 'image',
    gridRowStart: 'image',
    alignItems: "center",
    display: "flex",
    justifyContent: "center",
    objectFit: "contain",
    height: "var(--empty-state-image-size)",
    width: "var(--empty-state-image-size)",
  },
  title: {
    gridColumnEnd: 'title',
    gridColumnStart: 'title',
    gridRowEnd: 'title',
    gridRowStart: 'title',
    marginBottom: 0,
    marginLeft: 0,
    fontSize: {
      ":is([data-empty-state-size='lg'] *)": fontSize["2xl"],
      ":is([data-empty-state-size='md'] *)": fontSize["xl"],
      ":is([data-empty-state-size='sm'] *)": fontSize["lg"],
    },
    marginRight: 0,
    fontWeight: fontWeight["semibold"],
    marginTop: 0,
  },
  description: {
    gridColumnEnd: 'description',
    gridColumnStart: 'description',
    gridRowEnd: 'description',
    gridRowStart: 'description',
    marginBottom: 0,
    marginLeft: 0,
    fontSize: fontSize["sm"],
    marginRight: 0,
    fontWeight: fontWeight["normal"],
    marginTop: 0,
    maxWidth: {
      ":is([data-empty-state-size=lg])": "480px",
      ":is([data-empty-state-size=md])": "400px",
      ":is([data-empty-state-size=sm])": "320px",
    },
  },
  actions: {
    gridColumnEnd: 'actions',
    gridColumnStart: 'actions',
    gridRowEnd: 'actions',
    gridRowStart: 'actions',
    gap: gap["md"],
    alignItems: "center",
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",

    paddingLeft: {
      ":is([data-empty-state-size=sm] *)": horizontalSpace["3xl"],
    },
  },
});

export interface EmptyStateProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {
  /**
   * The size of the empty state component.
   * @default "md"
   */
  size?: Size;
}

export const EmptyState = ({
  style,
  size: sizeProp,
  ...props
}: EmptyStateProps) => {
  const size = sizeProp || use(SizeContext);

  return (
    <div
      {...props}
      data-empty-state-size={size}
      {...stylex.props(styles.emptyState, style)}
    />
  );
};

export interface EmptyStateImageProps extends StyleXComponentProps<
  Omit<React.ComponentProps<"div">, "src" | "alt">
> {
  /**
   * The source URL of the image.
   * When provided, renders an img element instead of a div.
   */
  src?: string;
  /**
   * The alt text for the image.
   * Required when src is provided.
   */
  alt?: string;
}

export const EmptyStateImage = ({
  style,
  src,
  alt,
  children,
  ...props
}: EmptyStateImageProps) => {
  if (src) {
    return <img src={src} alt={alt} {...stylex.props(styles.image, style)} />;
  }

  return (
    <div {...props} {...stylex.props(styles.image, style)}>
      {children}
    </div>
  );
};

export interface EmptyStateTitleProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {}

export const EmptyStateTitle = ({ style, ...props }: EmptyStateTitleProps) => {
  return <div {...props} {...stylex.props(styles.title, ui.text, style)} />;
};

export interface EmptyStateDescriptionProps extends StyleXComponentProps<
  React.ComponentProps<"p">
> {}

export const EmptyStateDescription = ({
  style,
  ...props
}: EmptyStateDescriptionProps) => {
  return (
    <p {...props} {...stylex.props(styles.description, ui.textDim, style)} />
  );
};

export interface EmptyStateActionsProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {}

export const EmptyStateActions = ({
  style,
  ...props
}: EmptyStateActionsProps) => {
  return (
    <div
      {...props}
      data-empty-state-actions
      {...stylex.props(styles.actions, style)}
    />
  );
};
