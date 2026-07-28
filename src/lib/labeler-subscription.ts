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
