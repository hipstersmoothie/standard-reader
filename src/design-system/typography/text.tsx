import * as stylex from "@stylexjs/stylex";

import type { TextVariant, ThemeKeys } from "../theme/types";

import { criticalColor, uiColor } from "../theme/color.stylex";
import { breakpoints } from "../theme/media-queries.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking as trackingStyles,
} from "../theme/typography.stylex";

const styles = stylex.create({
  trim: {
    // eslint-disable-next-line @stylexjs/valid-styles
    textBoxEdge: "cap alphabetic",
    // eslint-disable-next-line @stylexjs/valid-styles
    textBoxTrim: "trim-both",
  },

  title: { fontFamily: fontFamily["title"] },
  sans: { fontFamily: fontFamily["sans"] },
  serif: { fontFamily: fontFamily["serif"] },
  mono: { fontFamily: fontFamily["mono"] },

  weight: (
    defaultWeight: keyof typeof fontWeight,
    smWeight?: keyof typeof fontWeight,
    mdWeight?: keyof typeof fontWeight,
    lgWeight?: keyof typeof fontWeight,
    xlWeight?: keyof typeof fontWeight,
  ) => ({
    fontWeight: {
      default: fontWeight[defaultWeight],
      [breakpoints.sm]: smWeight ? fontWeight[smWeight] : undefined,
      [breakpoints.md]: mdWeight ? fontWeight[mdWeight] : undefined,
      [breakpoints.lg]: lgWeight ? fontWeight[lgWeight] : undefined,
      [breakpoints.xl]: xlWeight ? fontWeight[xlWeight] : undefined,
    },
  }),

  font: (
    defaultSize: keyof typeof fontSize,
    smSize?: keyof typeof fontSize,
    mdSize?: keyof typeof fontSize,
    lgSize?: keyof typeof fontSize,
    xlSize?: keyof typeof fontSize,
  ) => ({
    fontSize: {
      default: fontSize[defaultSize],
      [breakpoints.sm]: smSize ? fontSize[smSize] : undefined,
      [breakpoints.md]: mdSize ? fontSize[mdSize] : undefined,
      [breakpoints.lg]: lgSize ? fontSize[lgSize] : undefined,
      [breakpoints.xl]: xlSize ? fontSize[xlSize] : undefined,
    },
  }),

  leading: (
    defaultLeading: keyof typeof lineHeight,
    smLeading?: keyof typeof lineHeight,
    mdLeading?: keyof typeof lineHeight,
    lgLeading?: keyof typeof lineHeight,
    xlLeading?: keyof typeof lineHeight,
  ) => ({
    lineHeight: {
      default: lineHeight[defaultLeading],
      [breakpoints.sm]: smLeading ? lineHeight[smLeading] : undefined,
      [breakpoints.md]: mdLeading ? lineHeight[mdLeading] : undefined,
      [breakpoints.lg]: lgLeading ? lineHeight[lgLeading] : undefined,
      [breakpoints.xl]: xlLeading ? lineHeight[xlLeading] : undefined,
    },
  }),

  tracking: (
    defaultTracking: keyof typeof trackingStyles,
    smTracking?: keyof typeof trackingStyles,
    mdTracking?: keyof typeof trackingStyles,
    lgTracking?: keyof typeof trackingStyles,
    xlTracking?: keyof typeof trackingStyles,
  ) => ({
    letterSpacing: {
      default: trackingStyles[defaultTracking],
      [breakpoints.sm]: smTracking ? trackingStyles[smTracking] : undefined,
      [breakpoints.md]: mdTracking ? trackingStyles[mdTracking] : undefined,
      [breakpoints.lg]: lgTracking ? trackingStyles[lgTracking] : undefined,
      [breakpoints.xl]: xlTracking ? trackingStyles[xlTracking] : undefined,
    },
  }),

  "variant-primary": { color: uiColor.text2 },
  "variant-secondary": { color: uiColor.text1 },
  "variant-critical": { color: criticalColor.text1 },

  strikethrough: { textDecoration: "line-through" },

  left: { textAlign: "left" },
  center: { textAlign: "center" },
  right: { textAlign: "right" },

  textEllipsis: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

type ResponsiveValue<TKey extends string> =
  | TKey
  | {
      default: TKey;
      sm?: TKey;
      md?: TKey;
      lg?: TKey;
      xl?: TKey;
    };

type FontThemeTypes = "weight" | "font" | "leading" | "tracking";
type ThemeValue<TKey extends FontThemeTypes> = TKey extends "weight"
  ? typeof fontWeight
  : TKey extends "font"
    ? typeof fontSize
    : TKey extends "leading"
      ? typeof lineHeight
      : TKey extends "tracking"
        ? typeof trackingStyles
        : never;

function getResponsiveStyle<TType extends FontThemeTypes>(
  type: TType,
  value: ResponsiveValue<ThemeKeys<ThemeValue<TType>>>,
) {
  type StyleFn = (
    defaultVal: keyof ThemeValue<TType>,
    smVal?: keyof ThemeValue<TType>,
    mdVal?: keyof ThemeValue<TType>,
    lgVal?: keyof ThemeValue<TType>,
    xlVal?: keyof ThemeValue<TType>,
  ) => stylex.StyleXStyles;

  const styleFn = styles[type] as StyleFn;

  if (typeof value === "string") {
    return styleFn(value as keyof ThemeValue<TType>);
  }

  return styleFn(
    value.default as keyof ThemeValue<TType>,
    value.sm as keyof ThemeValue<TType> | undefined,
    value.md as keyof ThemeValue<TType> | undefined,
    value.lg as keyof ThemeValue<TType> | undefined,
    value.xl as keyof ThemeValue<TType> | undefined,
  );
}

interface TextProps extends Omit<
  React.ComponentProps<"span">,
  "style" | "className"
> {
  style?: stylex.StyleXStyles | Array<stylex.StyleXStyles>;
  font?: ThemeKeys<typeof fontFamily>;

  weight?: ResponsiveValue<ThemeKeys<typeof fontWeight>>;
  size?: ResponsiveValue<ThemeKeys<typeof fontSize>>;
  leading?: ResponsiveValue<ThemeKeys<typeof lineHeight>>;
  tracking?: ResponsiveValue<ThemeKeys<typeof trackingStyles>>;

  variant?: TextVariant;
  strikethrough?: boolean;
  align?: "left" | "center" | "right";
  hasEllipsis?: boolean;
}

export const Text = ({
  style,
  font = "sans",
  weight,
  size,
  leading,
  tracking,
  variant,
  strikethrough = false,
  align,
  hasEllipsis = false,
  ...props
}: TextProps) => {
  return (
    <span
      {...props}
      {...stylex.props(
        styles[font],
        weight && getResponsiveStyle("weight", weight),
        size && getResponsiveStyle("font", size),
        leading ? getResponsiveStyle("leading", leading) : styles.trim,
        tracking && getResponsiveStyle("tracking", tracking),
        variant && styles[`variant-${variant}`],
        strikethrough && styles.strikethrough,
        align && styles[align],
        hasEllipsis && styles.textEllipsis,
        style,
      )}
    />
  );
};
