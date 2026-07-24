import {
  criticalColor,
  primaryColor,
  successColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import { fontFamily } from "@standard-reader/design-system/theme/typography.stylex";

/**
 * Standard Newsletter's warm editorial palette ("Almanac"), expressed as design
 * tokens rather than hex literals.
 *
 * Every value below is a StyleX variable reference (a `var(--…)` string at
 * runtime), so it resolves against whatever theme is applied on `<body>` — see
 * `./theme-editorial`, which is Standard Reader's editorial theme copied verbatim.
 * That is what keeps the hand-rolled newsletter chrome and the design-system
 * components (Button, Menu, Avatar) on the *same* palette; before, the chrome
 * was hardcoded warm hexes while the components fell through to the design
 * system's stock **pink** `primaryColor`.
 *
 * Because these are variables and not literals they work anywhere CSS does —
 * including the inline `style={{…}}` objects these screens are built from, and
 * inside `color-mix()` / gradient / `border` shorthands. For the places CSS
 * variables *cannot* reach (email HTML, standalone `Response` pages, DB
 * defaults) use the flattened hex mirror in `./theme-palette` instead.
 *
 * The key names are the original Radix-ish scale steps, kept so call sites read
 * the same as before.
 */
export const C = {
  /** Recessed page background. */
  pageBg: uiColor.bgSubtle,
  /** Raised surface — cards, sidebar, section bands. */
  warm: uiColor.bg,
  /** Subtle fill — progress-bar tracks, inset wells. */
  ui3: uiColor.component2,
  /** Hover fill. */
  hover4: uiColor.component1,
  /** Accent-tinted fill — icon chips, selected rows, pills. */
  sel5: primaryColor.component1,
  /** Hairline border. */
  b6: uiColor.border1,
  /** Border. */
  b7: uiColor.border2,
  /** Emphasized border. */
  b8: uiColor.border3,
  /** Solid terracotta accent. */
  a9: primaryColor.solid1,
  /** Accent text — links, secondary body copy. */
  a11: primaryColor.text1,
  /** Ink — primary text. */
  t12: uiColor.text2,
  /** Muted text — labels, meta, captions. */
  mut: uiColor.text1,
  /** Text sitting on a solid accent fill. */
  onAccent: primaryColor.textContrast,
  serif: fontFamily.serif,
  sans: fontFamily.sans,
  mono: fontFamily.mono,
  /** Alias of {@link C.t12}. */
  ink: uiColor.text2,
} as const;

/** Semantic accents: positive/negative deltas, delivery health. */
export const POS = successColor.text1;
export const POSD = successColor.solid1;
export const NEG = criticalColor.text1;

/** Tinted surface + border for a critical (error) callout. */
export const NEG_BG = criticalColor.component1;
export const NEG_BORDER = criticalColor.border1;

/**
 * Corner radii, from the design system's scale. Matching its own conventions:
 * `md` for controls (buttons, inputs, icon tiles — `useButtonStyles` /
 * `useInputStyles`), `lg` for cards and panels (`Card`), `full` for pills and
 * circles.
 *
 * Note each step is dual-valued: browsers that support `corner-shape: squircle`
 * get a noticeably larger radius, which is intended — the shape reads tighter
 * at the same visual weight.
 */
export const R = radius;

export const fmt = (n: number): string => n.toLocaleString("en-US");

export const kfmt = (n: number): string =>
  n >= 1000
    ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1).replace(".0", "")}k`
    : String(n);

export const sectLabel = {
  fontSize: 11,
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
  color: C.mut,
  marginBottom: 12,
};

export const cardBox = {
  border: `1px solid ${C.b6}`,
  borderRadius: R.lg,
  background: C.warm,
};
