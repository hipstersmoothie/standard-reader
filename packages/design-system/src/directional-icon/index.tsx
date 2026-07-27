import * as stylex from "@stylexjs/stylex";

import type { StyleXComponentProps } from "../theme/types";
import { directionalIconStyles } from "./styles";

/**
 * Icons that encode a reading direction — arrows, chevrons, "next/previous" —
 * do not mirror on their own. Layout mirrors via logical CSS properties, but a
 * `>` glyph keeps pointing right under RTL, where it now means "backwards".
 *
 * This flips the glyph with `scaleX(var(--dir))` (see `--dir` in
 * `src/styles.css`) rather than swapping to a different icon at render time:
 * it needs no direction-aware JS, stays correct during SSR, and — because
 * `--dir` is inherited — it respects the NEAREST `dir` ancestor rather than
 * just the document. That matters for article content, which sets its own
 * direction via `dir="auto"`.
 *
 * Use for: next/previous, expand/collapse chevrons, "go to" row arrows,
 * back buttons, submit/continue affordances.
 *
 * Do NOT use for direction-neutral glyphs (close, search, settings) or for
 * icons whose meaning is absolute rather than directional — a "download"
 * arrow, a chart trend line, or a logo must not flip.
 */

export interface DirectionalIconProps extends StyleXComponentProps<
  React.SVGProps<SVGSVGElement>
> {
  /** The lucide (or any SVG) icon component to render, e.g. `ArrowRight`. */
  as: React.ComponentType<{
    size?: number | string;
    className?: string;
    "aria-hidden"?: boolean;
  }>;
  size?: number | string;
}

export function DirectionalIcon({
  as: Icon,
  size,
  style,
  ...props
}: DirectionalIconProps) {
  const { className } = stylex.props(directionalIconStyles.mirror, style);
  return <Icon {...props} aria-hidden className={className} size={size} />;
}
