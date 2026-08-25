import type { ArticleCardLabel } from "#/integrations/tanstack-query/api-shapes";

/**
 * Pure label-subject logic, split out from `labels.server.ts` so it carries no
 * database import and can be unit-tested directly.
 *
 * A label's subject is either a **document AT-URI** or an **account DID**.
 * Standard Reader's own labelers score prose and so label documents; labelers
 * on the wider AT Protocol network (pub-search's `bulk-generated`, Bluesky
 * moderation services) label accounts. A card therefore has to be resolved
 * against both: its own URI and its author's DID.
 */

/** A card that can carry labels — by its own URI and by its author's DID. */
export interface LabelableCard {
  uri: string;
  did?: string | null;
  labels?: Array<ArticleCardLabel>;
}

/**
 * Every subject a set of cards could be labelled under — each card's document
 * URI *and* its author's DID — so one query covers both kinds of labeler.
 */
export function labelSubjects(cards: Array<LabelableCard>): Array<string> {
  const subjects: Array<string> = [];
  for (const card of cards) {
    subjects.push(card.uri);
    if (card.did) subjects.push(card.did);
  }
  return subjects;
}

/** Whether a card is hidden — by a label on the document or on its author. */
export function isCardHidden(
  card: LabelableCard,
  hidden: Set<string>,
): boolean {
  return hidden.has(card.uri) || (card.did != null && hidden.has(card.did));
}

/**
 * Merge two label lists, keeping one entry per `(src, val)`. Document labels
 * win over account labels for the same pair, so a labeler that labels both a
 * document and its author does not badge the card twice.
 */
export function mergeLabels(
  a: Array<ArticleCardLabel> | undefined,
  b: Array<ArticleCardLabel> | undefined,
): Array<ArticleCardLabel> | undefined {
  if (!a || a.length === 0) return b;
  if (!b || b.length === 0) return a;
  const seen = new Set(a.map((l) => `${l.src} ${l.val}`));
  return [...a, ...b.filter((l) => !seen.has(`${l.src} ${l.val}`))];
}

/**
 * Attach labels from an already-read map, merging each card's own document
 * labels with any labels on its author's account.
 */
export function attachLabelsFromMap<T extends LabelableCard>(
  cards: Array<T>,
  byUri: Map<string, Array<ArticleCardLabel>>,
): Array<T> {
  if (byUri.size === 0) return cards;
  return cards.map((card) => {
    const labels = mergeLabels(
      byUri.get(card.uri),
      card.did ? byUri.get(card.did) : undefined,
    );
    return labels ? { ...card, labels } : card;
  });
}

/**
 * Of an already-read label map, which subjects the reader has chosen to hide.
 * Returns subjects (URIs and/or DIDs) — pair with {@link isCardHidden} rather
 * than testing card URIs against it directly.
 */
export function hiddenUrisFromLabels(
  byUri: Map<string, Array<ArticleCardLabel>>,
): Set<string> {
  const hidden = new Set<string>();
  for (const [uri, labels] of byUri) {
    if (labels.some((l) => l.visibility === "hide")) hidden.add(uri);
  }
  return hidden;
}

/**
 * Whether a label's subject is one this app can ever render.
 *
 * Every read path resolves labels for exactly two kinds of subject: a
 * `site.standard.document` URI (article cards and article pages) and an account
 * DID (profiles, publication headers, and a document's byline). A labeler that
 * also labels Bluesky posts is the norm — most of them do almost nothing else —
 * and those labels have no surface here at all.
 *
 * Mirroring them anyway made 62% of `document_labels` dead weight: 207k of 331k
 * rows across just eleven labelers, none of it ever read. Filtering at sync time
 * is what makes mirroring the whole active directory affordable.
 */
export function isRenderableLabelSubject(uri: string): boolean {
  return uri.startsWith("did:") || uri.includes("/site.standard.document/");
}
