/**
 * Standard Newsletter send pipeline — the source of the delivery metrics the
 * analytics screens show. A "send" is one published document mailed to a
 * publication's subscribers via Resend; each per-recipient outcome (delivered,
 * opened, clicked, bounced, unsubscribed, complained) is a send event, recorded
 * by the send runner and by Resend webhooks.
 *
 * These tables live in the shared package because they share the one physical
 * database; the reader's drizzle-kit owns migration generation for it. Run
 * `pnpm --filter standard-reader db:generate` to emit the migration.
 */

import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * A publication the author has opted in to mailing as a newsletter.
 *
 * Owning a standard.site publication does **not** make it a newsletter — the
 * author connects one explicitly, and a row here is that consent. Everything
 * downstream keys off it: the app lists only connected publications, the
 * dispatcher only mails their posts, and `/subscribe/$pubId` only accepts
 * signups for them. A first-time account therefore starts empty, with nothing
 * mailed on its behalf until it says so.
 *
 * Disconnecting deletes the row. Subscribers and past sends are left alone, so
 * reconnecting later restores the list rather than starting over.
 */
export const newsletterPublications = pgTable(
  "newsletter_publications",
  {
    /** The publication AT-URI — one row per connected publication. */
    publicationUri: text("publication_uri").primaryKey(),
    /**
     * DID of the author who connected it. Recorded at connect time and checked
     * against the publication's current owner on every write, so a transferred
     * publication can't be mailed by its previous owner.
     */
    ownerDid: text("owner_did").notNull(),
    connectedAt: timestamp("connected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("newsletter_publications_owner_idx").on(
      t.ownerDid,
      t.connectedAt.desc(),
    ),
  ],
);

export type NewsletterPublication = typeof newsletterPublications.$inferSelect;
export type NewNewsletterPublication =
  typeof newsletterPublications.$inferInsert;

export const newsletterSends = pgTable(
  "newsletter_sends",
  {
    /** Stable id — the document AT-URI (one send per published document). */
    id: text("id").primaryKey(),
    /** Publication whose subscribers were mailed. */
    publicationUri: text("publication_uri").notNull(),
    /** The document (post) that was sent. */
    documentUri: text("document_uri").notNull(),
    /** Subject line used. */
    subject: text("subject").notNull(),
    /** From identity (`"Name <addr>"`). */
    fromAddress: text("from_address"),
    /** Number of subscribers the send fanned out to. */
    recipientCount: integer("recipient_count").notNull().default(0),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("newsletter_sends_publication_idx").on(
      t.publicationUri,
      t.sentAt.desc(),
    ),
    index("newsletter_sends_document_idx").on(t.documentUri),
  ],
);

export type NewsletterSend = typeof newsletterSends.$inferSelect;
export type NewNewsletterSend = typeof newsletterSends.$inferInsert;

export const NEWSLETTER_EVENT_TYPES = [
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "unsubscribed",
  "complained",
] as const;

export type NewsletterEventType = (typeof NEWSLETTER_EVENT_TYPES)[number];

export const newsletterSendEvents = pgTable(
  "newsletter_send_events",
  {
    /** Event id (e.g. the provider's message/event id, or a composed key). */
    id: text("id").primaryKey(),
    sendId: text("send_id")
      .notNull()
      .references(() => newsletterSends.id, { onDelete: "cascade" }),
    /** Recipient identity — email address (or subscriber DID). */
    recipient: text("recipient").notNull(),
    /** One of NEWSLETTER_EVENT_TYPES. */
    type: text("type").notNull(),
    /** Target URL for `clicked` events. */
    url: text("url"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("newsletter_send_events_send_type_idx").on(t.sendId, t.type),
    index("newsletter_send_events_time_idx").on(t.sendId, t.occurredAt),
  ],
);

export type NewsletterSendEvent = typeof newsletterSendEvents.$inferSelect;
export type NewNewsletterSendEvent = typeof newsletterSendEvents.$inferInsert;

export const NEWSLETTER_SUBSCRIBER_STATUSES = [
  "pending",
  "confirmed",
  "unsubscribed",
] as const;

export type NewsletterSubscriberStatus =
  (typeof NEWSLETTER_SUBSCRIBER_STATUSES)[number];

export const NEWSLETTER_SUBSCRIBER_SOURCES = ["email", "space"] as const;

export type NewsletterSubscriberSource =
  (typeof NEWSLETTER_SUBSCRIBER_SOURCES)[number];

/**
 * A publication's email list — the recipients Standard Newsletter mails. A
 * subscriber double-opts-in (`pending` → confirmation email → `confirmed`) and
 * can one-click `unsubscribe`. `token` is an unguessable per-row capability used
 * to confirm and to unsubscribe without being logged in. Distinct from the
 * reader's standard.site `subscriptions` (which are follows, and only expose an
 * email for reader-signed-in users).
 */
export const newsletterSubscribers = pgTable(
  "newsletter_subscribers",
  {
    id: text("id").primaryKey(),
    publicationUri: text("publication_uri").notNull(),
    email: text("email").notNull(),
    /** DID when the subscriber is a known AT Proto identity; else null. */
    subscriberDid: text("subscriber_did"),
    /** One of NEWSLETTER_SUBSCRIBER_STATUSES. */
    status: text("status").notNull().default("pending"),
    /**
     * How the subscriber joined: `email` (plain email signup / author import,
     * stored in the author's subscriberList space record) or `space` (signed in
     * with Bluesky; owns an app.standard-newsletter.subscription record in their
     * own permissioned-space repo). Mirrored rows carry the source so the send
     * and unsubscribe paths know which side of the space to reconcile against.
     */
    source: text("source").notNull().default("email"),
    /** AT-URI of the backing permissioned-space record, when `source=space`. */
    spaceRecordUri: text("space_record_uri"),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("newsletter_subscribers_pub_email_idx").on(
      t.publicationUri,
      t.email,
    ),
    index("newsletter_subscribers_pub_status_idx").on(
      t.publicationUri,
      t.status,
    ),
  ],
);

export type NewsletterSubscriber = typeof newsletterSubscribers.$inferSelect;
export type NewNewsletterSubscriber = typeof newsletterSubscribers.$inferInsert;
