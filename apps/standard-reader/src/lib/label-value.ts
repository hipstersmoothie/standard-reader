import type { LabelValueDef } from "#/server/labeler/resolve.server";

/**
 * Label-value presentation helpers. A label `val` (e.g. `"claudeslop"`) is just
 * an identifier; its human-readable name + description live on the emitting
 * labeler's `labelValueDefinitions`. These resolve the display text from a set
 * of defs, falling back to the raw `val`/`identifier` so a pill is never empty
 * even before the labeler view has loaded.
 */

export function labelValueDisplayName(
  defs: Array<LabelValueDef> | undefined,
  val: string,
): string {
  const def = defs?.find((d) => d.identifier === val);
  if (!def) return val;
  return def.locales?.[0]?.name ?? def.identifier ?? val;
}

export function labelValueDescription(
  defs: Array<LabelValueDef> | undefined,
  val: string,
): string | undefined {
  const def = defs?.find((d) => d.identifier === val);
  return def?.locales?.[0]?.description;
}
