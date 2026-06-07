import { uiColor } from "#/design-system/theme/color.stylex";

/**
 * Blend a publication-defined callout tint with the editorial surface token so
 * light pastels don't blow out dark mode.
 */
export function themedCalloutBackground(
  color: string | undefined,
): string | undefined {
  if (!color?.trim()) return undefined;
  return `color-mix(in oklch, ${color} 22%, ${uiColor.component1})`;
}
