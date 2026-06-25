/**
 * Server-only ingestion configuration, read from environment. None of these are
 * `VITE_`-prefixed, so they never reach the browser.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

export const ingestConfig = {
  /**
   * Base URL of the `tap` admin/HTTP API (e.g. `http://127.0.0.1:2480`). Used to
   * dynamically track newly-discovered repos via `/repos/add`. Optional: when
   * unset, dynamic tracking is skipped (tap can still be seeded statically).
   */
  get tapApiUrl(): string | null {
    return process.env.TAP_API_URL ?? null;
  },

  /**
   * Optional second tap instance signaled on `app.standard-reader.labeler.service`
   * (`TAP_LABELER_API_URL`) so repos that register a labeler get tracked and
   * their records indexed. Shares `TAP_ADMIN_PASSWORD`.
   */
  get tapLabelerApiUrl(): string | null {
    return process.env.TAP_LABELER_API_URL ?? null;
  },

  /** Basic-auth admin password for tap (`TAP_ADMIN_PASSWORD`), if configured. */
  get tapAdminPassword(): string | null {
    return process.env.TAP_ADMIN_PASSWORD ?? null;
  },

  /**
   * Shared secret tap presents when POSTing to our webhook. tap uses HTTP Basic
   * auth with username `admin` and `TAP_ADMIN_PASSWORD`; we verify the same
   * credential here. Falls back to `INGEST_WEBHOOK_SECRET` for non-tap callers.
   */
  get webhookSecret(): string | null {
    return (
      process.env.INGEST_WEBHOOK_SECRET ??
      process.env.TAP_ADMIN_PASSWORD ??
      null
    );
  },

  /** Whether to attempt dynamic `/repos/add` calls to tap during ingestion. */
  get dynamicTrackingEnabled(): boolean {
    return Boolean(process.env.TAP_API_URL);
  },
} as const;

export { required as requiredEnv };
