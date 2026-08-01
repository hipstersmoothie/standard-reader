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
   * Optional third tap instance signaled on `site.standard.document`
   * (`TAP_DOCS_API_URL`) so repos that publish documents without a publication
   * record ("loose documents", e.g. Leaflet-hosted) get tracked + backfilled.
   * Shares `TAP_ADMIN_PASSWORD`.
   */
  get tapDocsApiUrl(): string | null {
    return process.env.TAP_DOCS_API_URL ?? null;
  },

  /**
   * Optional tap instance dedicated to **bridged** repos — Bridgy Fed's
   * `*.brid.gy` mirrors (`TAP_BRIDGE_API_URL`). Shares `TAP_ADMIN_PASSWORD`.
   *
   * Bridged repos are bulk by nature: one bridge can carry tens of thousands of
   * sites with thousands of posts each, and adding them to the main tap put
   * every publisher and reader behind that backlog *inside tap's resyncer* —
   * repos sat weeks behind their PDS while tap still reported them healthy.
   * That queue is per tap instance, which is exactly why the split has to be a
   * separate instance rather than just separate handling on our side: a second
   * tap gets its own resync queue and its own volume, so a bridge backfill can
   * only ever delay other bridged repos.
   *
   * When this is set, bridged repos are welcome — they route here instead of
   * being turned away (see `#/lib/atproto/bridged-repo`). When it is unset
   * there is no isolated lane to put them in, so the bulk web bridge stays
   * excluded. Configuring this env var is what turns Bridgy fully back on.
   */
  get tapBridgeApiUrl(): string | null {
    return process.env.TAP_BRIDGE_API_URL ?? null;
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
