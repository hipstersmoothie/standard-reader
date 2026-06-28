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
import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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
  /** `network` shows the whole-network home feed; `null` = follows (default). */
  homeScope: text("home_scope"),
  /** `true` enables collections authoring (requests the collections OAuth scope
   * tier on the next sign-in). Set when the user opts into the collections
   * upgrade flow; persists across logins so subsequent authorize requests
   * silently include the expanded scopes. */
  collectionsAuthoringEnabled: boolean("collections_authoring_enabled"),
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
  (table) => [index("verification_identifier_idx").on(table.identifier)],
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
