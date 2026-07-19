/**
 * Auth / identity tables (AT Proto OAuth via @atcute/oauth-node-client).
 *
 * The read-model tables elsewhere in `./schema/` are a derived cache of the
 * network. These tables are different: they store the app's own session state.
 *
 * - `user` / `account` — the signed-in reader, keyed to their AT Proto DID.
 * - `session` — opaque app session tokens (the HttpOnly cookie resolves here;
 *   the DID is always read from the `user` row, never trusted from the client).
 * - `verification` — KV store for the OAuth client's state + session blobs
 *   (see `src/integrations/auth/atproto.ts`).
 *
 * Shapes mirror `~/Documents/at-store` (Better Auth–compatible columns).
 */
import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** AT Proto OAuth / app identity (Better Auth–shaped rows). */
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  did: text("did").unique(),
  image: text("image"),
  isAdmin: boolean("is_admin").default(false).notNull(),
  /** `light` | `dark`; `null` follows system preference. */
  themeMode: text("theme_mode"),
  /** BCP-47 tag from `LOCALES` (`src/lib/locale.ts`); `null` negotiates from
   * the request's `Accept-Language` header. */
  locale: text("locale"),
  /** `true` once the one-time language indicator has been shown (announcing the
   * auto-detected interface language and offering to switch); `null` = never
   * shown, so the reader is still eligible to see it once. Guests use the
   * `standard-reader-locale-hint` cookie for the same purpose. */
  localeHintSeen: boolean("locale_hint_seen"),
  /** Kokoro voice id; `null` infers voice from the article author (auto). */
  readerVoice: text("reader_voice"),
  /** `true` opens document links on their original site; `null`/`false` uses
   * the in-app reader (default). */
  openLinksExternally: boolean("open_links_externally"),
  /** `true` opens collection posts in the magazine edition; `null`/`false` uses
   * the reader view (default). */
  openCollectionsInMagazine: boolean("open_collections_in_magazine"),
  /** Compact `fontSize:measure:bodyFont[:customFont]` encoding; `null` = defaults. */
  readingTypography: text("reading_typography"),
  /** `false` disables read tracking and unread UI; `null` = on (default). */
  trackReadingHistory: boolean("track_reading_history"),
  /** `true` counts everything a source ever posted as unread on subscribe (dots
   * + counts); `null`/`false` = off (default for new users) — posts published
   * before you subscribed are suppressed from unread dots/counts (dots return if
   * flipped back on — no read records are written). Backfilled to `true` for
   * users that existed before this preference shipped, to preserve their current
   * behaviour. */
  countOldPostsAsUnread: boolean("count_old_posts_as_unread"),
  /** `network` shows the whole-network home feed; `null` = follows (default). */
  homeScope: text("home_scope"),
  /** Comma-separated author-profile tab ids the owner has hidden from their
   * public profile (`posts,publications,...`); `null`/empty = all visible. */
  profileHiddenTabs: text("profile_hidden_tabs"),
  /** `true` shows the opt-in "Recommendations" tab on the public profile; `null`/`false`
   * keeps it hidden (the tab is disabled by default). */
  profileShowLikes: boolean("profile_show_likes"),
  /** `true` enables collections authoring (requests the collections OAuth scope
   * tier on the next sign-in). Set when the user opts into the collections
   * upgrade flow; persists across logins so subsequent authorize requests
   * silently include the expanded scopes. */
  collectionsAuthoringEnabled: boolean("collections_authoring_enabled"),
  /** `true` enables the userinput.app feedback scope tier on the next sign-in
   * (and persists across logins so subsequent authorize requests silently
   * include the expanded scope). Set when the user goes through the feedback
   * upgrade flow; the source of truth for "actually granted" is
   * `account.scope` (see `hasUserinputFeedbackScope`), but this flag is what
   * the `authorize` server fn reads to silently re-request the scope on every
   * login. */
  userinputFeedbackEnabled: boolean("userinput_feedback_enabled"),
  /** `true` enables the Margin (at.margin.*) save scope tier on the next
   * sign-in (and persists across logins so subsequent authorize requests
   * silently include the expanded scope). Set when the user goes through the
   * "Save to Margin" upgrade flow; the source of truth for "actually granted"
   * is `account.scope` (see `hasMarginScope`). */
  marginSaveEnabled: boolean("margin_save_enabled"),
  /** `true` enables the Semble/Cosmik (network.cosmik.*) save scope tier on
   * the next sign-in, mirroring {@link marginSaveEnabled}. */
  sembleSaveEnabled: boolean("semble_save_enabled"),
  /** `true` stops the one-time ATStore review prompt toast from showing again. */
  atstoreReviewPromptDismissed: boolean("atstore_review_prompt_dismissed"),
  /** `true` once the first-run onboarding wizard was finished or dismissed;
   * `null` = never seen (eligible for `/welcome` when the reader has no
   * follows). See `src/lib/onboarding.ts`. */
  onboardingCompleted: boolean("onboarding_completed"),
  /** `true` enables the weekly digest email: requests the `transition:email`
   * OAuth scope on the next sign-in (persisted so subsequent logins silently
   * re-request it and keep `email` fresh), and opts the reader into the weekly
   * send. Cleared when the reader unsubscribes or turns the digest off. */
  weeklyDigestEnabled: boolean("weekly_digest_enabled"),
  /** When the last weekly digest was sent to this reader; drives the send
   * runner's idempotency guard (skip if sent within the last ~6 days). */
  weeklyDigestLastSentAt: timestamp("weekly_digest_last_sent_at", {
    withTimezone: true,
  }),
  /** When the one-time digest welcome email was sent. Stays null until the
   * reader first enables the digest and we've captured their email; the OAuth
   * callback sends the welcome once and stamps this so it never repeats on
   * subsequent logins. See `src/server/digest/welcome.server.ts`. */
  weeklyDigestWelcomeSentAt: timestamp("weekly_digest_welcome_sent_at", {
    withTimezone: true,
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

/** KV store for OAuth state and AT Proto OAuth session blobs (atcute). */
export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  // UNIQUE so `setStoreValue` / `storeAppPasswordSession` can upsert atomically
  // (onConflictDoUpdate) instead of a race-prone delete-then-insert.
  (table) => [uniqueIndex("verification_identifier_idx").on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));
