import {
  primaryColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import { fontFamily } from "@standard-reader/design-system/theme/typography.stylex";
import type { CSSProperties } from "react";

/**
 * The Almanac palette, expressed against the shared design-system tokens.
 *
 * The design (`Standard Writer.dc.html`) referenced the compiled StyleX custom
 * properties directly. Here each role maps to the semantic token it came from,
 * so the app inherits the reused editorial theme (`../theme.ts`) — including its
 * light/dark values — instead of hard-coding hashes. StyleX rewrites each token
 * reference to its `var(--…)` string at build time, so these are usable inline.
 *
 * Neutral steps come from `uiColor` (warm paper → ink); the bronze accent
 * (`a9`/`a11`) comes from `primaryColor`, whose `solid1` is the `#ad7f58`
 * editorial accent.
 */
export const C = {
  pageBg: uiColor.bg,
  warm: uiColor.bgSubtle,
  ui3: uiColor.component1,
  hover4: uiColor.component2,
  sel5: uiColor.component3,
  b6: uiColor.border1,
  b7: uiColor.border2,
  b8: uiColor.border3,
  a9: primaryColor.solid1,
  a11: primaryColor.text1,
  t12: uiColor.text2,
  mut: uiColor.text1,
  ink: uiColor.text2,
  serif: fontFamily.serif,
  sans: fontFamily.sans,
  mono: fontFamily.mono,
} as const;

/** Small uppercase section label used across the workbench + forms. */
export const sectLabel: CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: C.mut,
  marginBottom: 12,
};

/** Rounded warm card container used by the publish + new-publication forms. */
export const cardBox: CSSProperties = {
  border: `1px solid ${C.b6}`,
  borderRadius: 16,
  background: C.warm,
};
