import * as stylex from "@stylexjs/stylex";

/**
 * Mirrors a direction-encoding glyph under RTL.
 *
 * Lives in its own module so `index.tsx` only exports components — the
 * fast-refresh lint rule (`react/only-export-components`) fires otherwise.
 *
 * Prefer the `<DirectionalIcon>` component. Reach for this style directly only
 * when the icon can't go through the component: e.g. the style being merged has
 * pseudo-selector values that `DirectionalIconProps["style"]` won't accept, or
 * the rotation lives on a wrapper rather than the glyph.
 *
 * See `--dir` in `src/styles.css` (1 in LTR, -1 under `[dir="rtl"]`).
 */
export const directionalIconStyles = stylex.create({
  mirror: {
    transform: "scaleX(var(--dir))",
  },
});
