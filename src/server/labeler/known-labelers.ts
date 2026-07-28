/**
 * Third-party labelers we seed into the directory.
 *
 * A labeler that declares itself on the network (DID doc `#atproto_labeler` +
 * `app.bsky.labeler.service`) has no `labeler_services` row until something
 * resolves it, and nothing resolves it until someone searches for it by name —
 * so a labeler nobody has heard of stays invisible forever. These DIDs are
 * resolved eagerly when the directory loads (`ensureKnownLabelersResolved`) to
 * break that circle.
 *
 * This is a **seed list, not a filter**: the directory lists every labeler it
 * knows of, and being absent from here only means a labeler has to be surfaced
 * some other way — resolved by handle lookup, or ported in with a reader's
 * Bluesky subscriptions — before it appears. It never gates access.
 */
export const KNOWN_STANDARD_SITE_LABELERS: ReadonlySet<string> = new Set([
  // pub-search.waow.tech — labels accounts whose documents are generated from a
  // data source (`bulk-generated`) and excludes them from its own search index.
  // https://pub-search.waow.tech/labels
  "did:plc:aywbh7hovtsqpv2pzkldmqdv",
]);
