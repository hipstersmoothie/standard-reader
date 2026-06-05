import * as stylex from "@stylexjs/stylex";
import { use } from "react";

import type { Size, StyleXComponentProps } from "../theme/types";

import { AspectRatio, AspectRatioImage } from "../aspect-ratio";
import { SizeContext } from "../context";
import { uiColor } from "../theme/color.stylex";
import { radius } from "../theme/radius.stylex";
import { ui } from "../theme/semantic-color.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import { shadow } from "../theme/shadow.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "../theme/typography.stylex";

const styles = stylex.create({
  card: {
    borderColor: uiColor.component2,
    borderRadius: radius.lg,
    borderStyle: "solid",
    borderWidth: 1,

    cornerShape: "squircle",
    overflow: "hidden",
    boxShadow: shadow["sm"],
    display: "flex",
    flexDirection: "column",
    fontFamily: fontFamily["sans"],

    "--card-gap": {
      ":is([data-card-size=lg])": gap["2xl"],
      ":is([data-card-size=md])": gap["2xl"],
      ":is([data-card-size=sm])": gap["xs"],
    },
    "--card-x-padding": {
      ":is([data-card-size=lg])": horizontalSpace["5xl"],
      ":is([data-card-size=md])": horizontalSpace["3xl"],
      ":is([data-card-size=sm])": horizontalSpace["lg"],
    },
    "--card-y-padding": {
      ":is([data-card-size=lg])": verticalSpace["5xl"],
      ":is([data-card-size=md])": verticalSpace["3xl"],
      ":is([data-card-size=sm])": verticalSpace["lg"],
    },
  },
  cardSection: {
    boxSizing: "border-box",
    paddingBottom: {
      default: "var(--card-gap)",
      ":last-child": "var(--card-y-padding)",
    },
    paddingLeft: "var(--card-x-padding)",
    paddingRight: "var(--card-x-padding)",
    paddingTop: { ":first-child": "var(--card-y-padding)" },
  },
  cardHeader: {
    gridTemplate: {
      default: `'title action'`,
      ":has([data-card-header-description])": `
        'title action'
        'description action'
      `,
    },
    gap: "calc(var(--card-gap) * 0.5)",
    alignItems: "center",
    display: "grid",
  },
  headerBorder: {
    borderColor: uiColor.component2,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    marginBottom: "var(--card-y-padding)",
    paddingBottom: verticalSpace["3xl"],
  },
  cardHeaderAction: {
    gridColumnEnd: "action",
    gridColumnStart: "action",
    gridRowEnd: "action",
    gridRowStart: "action",
    gap: gap["xs"],
    display: "flex",
    justifyContent: "flex-end",
  },
  cardTitle: {
    // eslint-disable-next-line @stylexjs/valid-styles
    textBoxEdge: "cap alphabetic",
    // eslint-disable-next-line @stylexjs/valid-styles
    textBoxTrim: "trim-both",
    gridColumnEnd: "title",
    gridColumnStart: "title",
    gridRowEnd: "title",
    gridRowStart: "title",
    gap: gap["xl"],
    alignItems: "center",
    display: "flex",
    fontFamily: fontFamily["title"],
    fontSize: {
      ":is([data-card-size='lg'] *)": fontSize["2xl"],
      ":is([data-card-size='md'] *)": fontSize["xl"],
      ":is([data-card-size='sm'] *)": fontSize["base"],
    },
    fontWeight: fontWeight["bold"],
  },
  cardDescription: {
    gridColumnEnd: "description",
    gridColumnStart: "description",
    gridRowEnd: "description",
    gridRowStart: "description",
    marginBottom: 0,
    marginLeft: 0,
    fontSize: fontSize["sm"],
    marginRight: 0,
    fontWeight: fontWeight["normal"],
    marginTop: 0,
    lineHeight: lineHeight["sm"],
  },
  cardBody: {
    // eslint-disable-next-line @stylexjs/valid-styles
    textBoxEdge: "cap alphabetic",
    // eslint-disable-next-line @stylexjs/valid-styles
    textBoxTrim: "trim-both",
    gap: "calc(var(--card-gap) * 0.5)",
    display: "flex",
    flexDirection: "column",
    fontSize: {
      ":is([data-card-size='lg'] *)": fontSize["lg"],
      ":is([data-card-size='md'] *)": fontSize["base"],
      ":is([data-card-size='sm'] *)": fontSize["xs"],
    },
  },
  cardFooter: {
    gap: gap["md"],
    display: "flex",
    justifyContent: "flex-end",
  },
  cardImage: {
    overflow: "hidden",
    borderBottomLeftRadius: { default: 0, ":last-child": radius.md },
    borderBottomRightRadius: { default: 0, ":last-child": radius.md },
    borderTopLeftRadius: { default: 0, ":first-child": radius.md },
    borderTopRightRadius: { default: 0, ":first-child": radius.md },
    marginBottom: "var(--card-y-padding)",
  },
});

export interface CardProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {
  size?: Size;
}

export const Card = ({ style, size: sizeProp, ...props }: CardProps) => {
  const size = sizeProp || use(SizeContext);

  return (
    <SizeContext value={size}>
      <div
        {...props}
        data-card-size={size}
        {...stylex.props(styles.card, ui.bg, ui.text, style)}
      />
    </SizeContext>
  );
};

export interface CardHeaderProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {
  hasBorder?: boolean;
}

export const CardHeader = ({ style, hasBorder, ...props }: CardHeaderProps) => {
  return (
    <div
      {...props}
      {...stylex.props(
        styles.cardSection,
        styles.cardHeader,
        hasBorder && styles.headerBorder,
        style,
      )}
    />
  );
};

export interface CardTitleProps extends StyleXComponentProps<
  React.ComponentProps<"h2">
> {}

export const CardTitle = ({ style, ...props }: CardTitleProps) => {
  return <div {...props} {...stylex.props(styles.cardTitle, style)} />;
};

export interface CardDescriptionProps extends StyleXComponentProps<
  React.ComponentProps<"p">
> {}

export const CardDescription = ({ style, ...props }: CardDescriptionProps) => {
  return (
    <p
      {...props}
      data-card-header-description
      {...stylex.props(styles.cardDescription, ui.textDim, style)}
    />
  );
};

export interface CardHeaderActionProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {}

export const CardHeaderAction = ({
  style,
  ...props
}: CardHeaderActionProps) => {
  return <div {...props} {...stylex.props(styles.cardHeaderAction, style)} />;
};
export interface CardBodyProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {}

export const CardBody = ({ style, ...props }: CardBodyProps) => {
  return (
    <div
      {...props}
      {...stylex.props(styles.cardSection, styles.cardBody, style)}
    />
  );
};

export interface CardFooterProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {}

export const CardFooter = ({ style, ...props }: CardFooterProps) => {
  return (
    <div
      {...props}
      {...stylex.props(styles.cardSection, styles.cardFooter, style)}
    />
  );
};

export interface CardImageProps extends StyleXComponentProps<
  React.ComponentProps<"img">
> {
  aspectRatio?: number;
  imageStyle?: stylex.StyleXStyles;
  children?: React.ReactNode;
}

export const CardImage = ({
  style,
  aspectRatio,
  imageStyle,
  children,
  ...props
}: CardImageProps) => {
  return (
    <AspectRatio aspectRatio={aspectRatio} style={[styles.cardImage, style]}>
      <AspectRatioImage {...props} style={imageStyle} />
      {children}
    </AspectRatio>
  );
};
