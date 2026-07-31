/**
 * Whether a labeler subscription record means "apply this labeler's labels".
 *
 * `enabled` is absent on every subscription written before the field existed,
 * and on every subscription a reader has not muted — so **absent means
 * enabled**. Only an explicit `false` mutes. Getting this backwards would
 * silently mute every existing subscription on the network, which is why it is
 * a named, tested helper rather than an inline truthiness check.
 */
export function labelerSubscriptionEnabled(record: {
  enabled?: boolean;
}): boolean {
  return record.enabled !== false;
}

export type LabelVisibility = "ignore" | "warn" | "hide";
export interface LabelPref {
  val: string;
  visibility: LabelVisibility;
}

/**
 * What a label does when the reader has expressed no opinion about it.
 *
 * `warn` rather than the labeler's own `defaultSetting`: subscribing should
 * surface what a labeler flags, not silently hide things (`hide` would make
 * documents vanish with no explanation) and not ignore them (`ignore` would make
 * the subscription look broken). Warning is the reversible middle — the reader
 * sees the label and can then choose.
 */
export const DEFAULT_LABEL_VISIBILITY: LabelVisibility = "warn";

/**
 * The prefs to store for a new subscription: one entry per label value the
 * labeler declares.
 *
 * Every declared label gets an explicit pref rather than relying on a render-time
 * fallback, so what the reader sees in the UI is what is actually written in
 * their repo — and so a labeler later changing its own `defaultSetting` cannot
 * retroactively change how an existing subscription behaves.
 *
 * `preset` carries visibilities decided elsewhere (a reader's ported Bluesky
 * `contentLabelPref` entries) and wins over the default.
 */
export function subscriptionLabelPrefs(
  labelValues: Array<string>,
  preset?: Map<string, LabelVisibility>,
): Array<LabelPref> {
  const seen = new Set<string>();
  const out: Array<LabelPref> = [];
  for (const val of labelValues) {
    if (val.length === 0 || seen.has(val)) continue;
    seen.add(val);
    out.push({
      val,
      visibility: preset?.get(val) ?? DEFAULT_LABEL_VISIBILITY,
    });
  }
  return out;
}
