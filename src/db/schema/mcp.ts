/**
 * OAuth 2.1 authorization-server state for the remote MCP server (`/mcp`).
 *
 * MCP clients (Claude, Cursor, …) discover `standard-reader.app` as their
 * authorization server, register themselves dynamically, and are issued tokens
 * scoped to one reader. These tables hold that state; the reader's *AT Protocol*
 * session is untouched and still lives in `account` / `verification`. An MCP
 * token is only ever a pointer to a `user` row — the actual network writes go
 * through that reader's stored AT Proto OAuth session.
 *
 * Secrets are never stored in the clear: client secrets, authorization codes,
 * access tokens and refresh tokens are all persisted as SHA-256 hashes and
 * looked up by hash.
 */
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth.ts";

/** A dynamically registered MCP client (RFC 7591). */
export const mcpClient = pgTable("mcp_client", {
  /** The issued `client_id`. */
  id: text("id").primaryKey(),
  /** SHA-256 of the issued `client_secret`; null for public (PKCE-only) clients. */
  secretHash: text("secret_hash"),
  /** `client_name` from registration, shown on the consent screen. */
  name: text("name").notNull(),
  /** JSON array of registered redirect URIs. */
  redirectUris: text("redirect_uris").notNull(),
  /** `none` (public) or `client_secret_post` / `client_secret_basic`. */
  tokenEndpointAuthMethod: text("token_endpoint_auth_method").notNull(),
  /** Space-separated scopes the client asked to be allowed to request. */
  scope: text("scope").notNull(),
  /** Optional registration metadata, surfaced on the consent screen. */
  clientUri: text("client_uri"),
  logoUri: text("logo_uri"),
  softwareId: text("software_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

/**
 * A pending authorization code. Single-use and short-lived: the token endpoint
 * deletes the row as it reads it, so a replayed code finds nothing.
 */
export const mcpAuthCode = pgTable(
  "mcp_auth_code",
  {
    /** SHA-256 of the issued authorization code. */
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => mcpClient.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Snapshot of the reader's DID at consent time. */
    did: text("did").notNull(),
    /** Must match the `redirect_uri` presented at the token endpoint. */
    redirectUri: text("redirect_uri").notNull(),
    /** Space-separated scopes the reader actually granted. */
    scope: text("scope").notNull(),
    /** PKCE (RFC 7636) — required, `S256` only. */
    codeChallenge: text("code_challenge").notNull(),
    /** RFC 8707 `resource` the code was bound to, when the client sent one. */
    resource: text("resource"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("mcp_auth_code_expires_at_idx").on(table.expiresAt)],
);

/**
 * An issued access token, with its refresh token alongside.
 *
 * Refresh rotates: redeeming a refresh token replaces both hashes on the same
 * row, so the grant keeps one identity across its lifetime and revoking it
 * (from settings, or via the revocation endpoint) kills every descendant.
 */
export const mcpToken = pgTable(
  "mcp_token",
  {
    /** Stable grant id, so a rotated token keeps its row. */
    id: text("id").primaryKey(),
    /** SHA-256 of the current access token. */
    accessTokenHash: text("access_token_hash").notNull().unique(),
    /** SHA-256 of the current refresh token; null once refresh is spent. */
    refreshTokenHash: text("refresh_token_hash").unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => mcpClient.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Snapshot of the reader's DID, so `/mcp` doesn't need a user join. */
    did: text("did").notNull(),
    scope: text("scope").notNull(),
    resource: text("resource"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    refreshExpiresAt: timestamp("refresh_expires_at", { withTimezone: true }),
    /** Set when revoked; the row is kept so settings can show what was cut off. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("mcp_token_user_id_idx").on(table.userId),
    index("mcp_token_expires_at_idx").on(table.expiresAt),
  ],
);
