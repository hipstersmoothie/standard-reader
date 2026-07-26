/**
 * Labelers we know are about standard.site publishing.
 *
 * The Labelers directory lists a labeler when it either registered with an
 * `app.standard-reader.labeler.service` record or has demonstrably labeled
 * something in our corpus (see `labelersWithIndexedSubjects`). That second test
 * is evidence-based, so it can only pass *after* a labeler has emitted labels —
 * which leaves a relevant labeler invisible until it does.
 *
 * This list closes that gap: a small, explicit set of third-party labelers we
 * have looked at and judged to be about this network. It is a curation seam,
 * not a trust or allowlist boundary — being absent from it never blocks anyone
 * from finding a labeler by handle, subscribing to it, or syncing its labels.
 */
export const KNOWN_STANDARD_SITE_LABELERS: ReadonlySet<string> = new Set([
  // pub-search.waow.tech — labels accounts whose documents are generated from a
  // data source (`bulk-generated`) and excludes them from its own search index.
  // https://pub-search.waow.tech/labels
  "did:plc:aywbh7hovtsqpv2pzkldmqdv",
]);
