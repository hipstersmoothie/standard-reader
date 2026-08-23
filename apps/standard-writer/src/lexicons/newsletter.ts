/**
 * Hand-written types + builders for the `app.standard-newsletter.*` records we
 * write into a publication's permissioned space (HappyView / AT Proto Proposal
 * 0016). The JSON lexicons in `lexicons/app/standard-newsletter/` are the
 * durable source of truth (ready to publish to the network later); these mirror
 * them so the app stays typed without wiring codegen for a not-yet-published
 * authority.
 *
 * Two record kinds:
 * - `subscription` — one per Bluesky subscriber, in the subscriber's own repo.
 * - `subscriberList` — the author's aggregate email list, in the author's repo.
 */

/** NSID of the permissioned-space type (one space per publication). */
export const SPACE_TYPE = "app.standard-newsletter.list";

/** NSID of the per-subscriber private subscription record. */
export const SUBSCRIPTION_COLLECTION = "app.standard-newsletter.subscription";

/** NSID of the author-owned aggregate email-list record. */
export const SUBSCRIBER_LIST_COLLECTION =
  "app.standard-newsletter.subscriberList";

/** rkey of the (single) subscriber-list record in the author's space repo. */
export const SUBSCRIBER_LIST_RKEY = "self";

export interface SubscriptionRecord {
  $type: typeof SUBSCRIPTION_COLLECTION;
  publicationUri: string;
  email: string;
  createdAt: string;
}

export interface SubscriberListEntry {
  email: string;
  addedAt: string;
  /** Set when unsubscribed; kept so re-imports don't re-add the address. */
  unsubscribedAt?: string;
}

export interface SubscriberListRecord {
  $type: typeof SUBSCRIBER_LIST_COLLECTION;
  publicationUri: string;
  entries: Array<SubscriberListEntry>;
  updatedAt: string;
}

/** Build a subscription record (Bluesky subscriber's own repo). */
export function buildSubscriptionRecord(input: {
  publicationUri: string;
  email: string;
  createdAt: string;
}): SubscriptionRecord {
  return {
    $type: SUBSCRIPTION_COLLECTION,
    publicationUri: input.publicationUri,
    email: input.email.trim().toLowerCase(),
    createdAt: input.createdAt,
  };
}

/** Build an empty subscriber-list record for a publication. */
export function emptySubscriberList(
  publicationUri: string,
  updatedAt: string,
): SubscriberListRecord {
  return {
    $type: SUBSCRIBER_LIST_COLLECTION,
    publicationUri,
    entries: [],
    updatedAt,
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Merge new email addresses into an author's subscriber-list record. Dedupes
 * case-insensitively, revives a previously-unsubscribed address (clears
 * `unsubscribedAt`), and preserves existing `addedAt` timestamps. Pure — returns
 * a new record; used by the bulk-import path.
 */
export function mergeEmailsIntoList(
  list: SubscriberListRecord,
  emails: Array<string>,
  now: string,
): SubscriberListRecord {
  const byEmail = new Map<string, SubscriberListEntry>();
  for (const entry of list.entries) {
    byEmail.set(normalizeEmail(entry.email), { ...entry });
  }
  for (const raw of emails) {
    const email = normalizeEmail(raw);
    if (!email) continue;
    const existing = byEmail.get(email);
    if (existing) {
      // Re-importing an address revives it if it had unsubscribed.
      delete existing.unsubscribedAt;
    } else {
      byEmail.set(email, { email, addedAt: now });
    }
  }
  return { ...list, entries: [...byEmail.values()], updatedAt: now };
}

/** Mark an address unsubscribed on the author's list (no-op if absent). */
export function unsubscribeEmailFromList(
  list: SubscriberListRecord,
  email: string,
  now: string,
): SubscriberListRecord {
  const target = normalizeEmail(email);
  let changed = false;
  const entries = list.entries.map((entry) => {
    if (normalizeEmail(entry.email) === target && !entry.unsubscribedAt) {
      changed = true;
      return { ...entry, unsubscribedAt: now };
    }
    return entry;
  });
  return changed ? { ...list, entries, updatedAt: now } : list;
}

/** The still-subscribed addresses on a list (drops unsubscribed entries). */
export function activeEmails(list: SubscriberListRecord): Array<string> {
  return list.entries
    .filter((e) => !e.unsubscribedAt)
    .map((e) => normalizeEmail(e.email));
}

/**
 * Split a large entry set into records that each stay under a size budget. The
 * primary record keeps rkey `self`; overflow records are keyed `self-1`,
 * `self-2`, … Chunking keeps each record within atproto record size limits.
 */
export function chunkListEntries(
  entries: Array<SubscriberListEntry>,
  perRecord = 2000,
): Array<{ rkey: string; entries: Array<SubscriberListEntry> }> {
  if (entries.length === 0)
    return [{ rkey: SUBSCRIBER_LIST_RKEY, entries: [] }];
  const chunks: Array<{ rkey: string; entries: Array<SubscriberListEntry> }> =
    [];
  for (let i = 0; i < entries.length; i += perRecord) {
    const index = i / perRecord;
    chunks.push({
      rkey:
        index === 0 ? SUBSCRIBER_LIST_RKEY : `${SUBSCRIBER_LIST_RKEY}-${index}`,
      entries: entries.slice(i, i + perRecord),
    });
  }
  return chunks;
}
