/**
 * Self-labels on an `app.bsky.actor.profile` record.
 *
 * An account declares things about itself in the profile record's `labels`
 * field, a `com.atproto.label.defs#selfLabels` object
 * (`{ values: [{ val: "bot" }] }`). This is the account's own statement, not a
 * third party's, so it needs no labeler and no signature check.
 *
 * We previously ran a first-party labeler whose only job was to re-publish this
 * same declaration as a label on that account's posts. The signal was already in
 * a record we index, so the labeler bought a network round trip and a moderation
 * service to learn something we already had.
 */

interface SelfLabels {
  values?: Array<{ val?: unknown } | null | undefined>;
}

/** The `val`s an account has self-declared, lowercased and de-duplicated. */
export function selfLabelValues(record: unknown): Array<string> {
  const labels = (record as { labels?: SelfLabels } | null | undefined)?.labels;
  const values = labels?.values;
  if (!Array.isArray(values)) return [];
  const out = new Set<string>();
  for (const entry of values) {
    const val = entry?.val;
    if (typeof val === "string" && val.trim().length > 0) {
      out.add(val.trim().toLowerCase());
    }
  }
  return [...out];
}

/** Whether a profile record self-declares `bot`. */
export function declaresBot(record: unknown): boolean {
  return selfLabelValues(record).includes("bot");
}

/**
 * Whether an AppView profile *view* carries a `bot` self-label.
 *
 * `app.bsky.actor.getProfile(s)` returns self-labels in `labels` alongside any
 * third-party labels, distinguished by `src` being the account's own DID. Same
 * declaration as {@link declaresBot}, just as the AppView presents it rather
 * than as the raw record — which is how we read it for accounts whose profile
 * record we have not seen come past on the firehose.
 */
export function viewDeclaresBot(did: string, labels: unknown): boolean {
  if (!Array.isArray(labels)) return false;
  return labels.some((label) => {
    const entry = label as { src?: unknown; val?: unknown } | null | undefined;
    return (
      entry?.src === did &&
      typeof entry.val === "string" &&
      entry.val.trim().toLowerCase() === "bot"
    );
  });
}
