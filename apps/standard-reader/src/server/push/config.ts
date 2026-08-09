/**
 * Server-only web-push configuration, read from environment. Mirrors
 * `src/server/digest/config.ts`.
 *
 * Only `VAPID_PUBLIC_KEY` is safe to hand to a browser (it's the application
 * server key the subscription is bound to). The private key is what authorizes
 * sending, so it lives solely in the push-send cron — the web service never
 * needs it, and the ingest worker needs none of this.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

export const pushConfig = {
  /** VAPID public key, base64url. Sent to the browser by `getPushConfig`. */
  get publicKey(): string {
    return required("VAPID_PUBLIC_KEY");
  },

  /** VAPID private key, base64url. Cron only — never reaches the client. */
  get privateKey(): string {
    return required("VAPID_PRIVATE_KEY");
  },

  /** VAPID `sub` claim; must be a `mailto:` or `https:` URL. */
  get subject(): string {
    return process.env.VAPID_SUBJECT ?? "mailto:hello@standard-reader.app";
  },

  /**
   * Whether a browser can subscribe. Only the **public** key is needed to hand
   * a browser an `applicationServerKey`, and the web service deliberately holds
   * nothing else — so this must NOT also require the private key. Gating
   * registration on both is what made the bell report "we couldn't set up
   * notifications on this device" while everything was configured correctly.
   */
  get canRegister(): boolean {
    return Boolean(process.env.VAPID_PUBLIC_KEY);
  },

  /**
   * Whether we can actually deliver. Signing a push requires the private key,
   * which lives only in the send cron. It exits cleanly when this is false
   * rather than throwing — that's what stops a Railway PR preview pointed at a
   * shared database from sending real notifications with preview-domain links.
   */
  get canSend(): boolean {
    return Boolean(
      process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY,
    );
  },

  /** Documents to drain per invocation. A backlog spreads across ticks
   * instead of one run growing without bound. */
  get maxDocumentsPerRun(): number {
    const raw = process.env.PUSH_MAX_DOCUMENTS_PER_RUN;
    const n = raw ? Number.parseInt(raw, 10) : 20;
    return Number.isFinite(n) && n > 0 ? n : 20;
  },

  /** Hard ceiling on individual notifications sent in one invocation, across
   * all documents. Guards against one very widely-followed publication
   * monopolising a run. */
  get maxSendsPerRun(): number {
    const raw = process.env.PUSH_MAX_SENDS_PER_RUN;
    const n = raw ? Number.parseInt(raw, 10) : 2000;
    return Number.isFinite(n) && n > 0 ? n : 2000;
  },

  /** How many endpoints to push to concurrently. Push services are independent,
   * so this can be higher than the digest's sequential email sends. */
  get sendConcurrency(): number {
    const raw = process.env.PUSH_SEND_CONCURRENCY;
    const n = raw ? Number.parseInt(raw, 10) : 8;
    return Number.isFinite(n) && n > 0 ? n : 8;
  },
} as const;

/**
 * Most notifications one author may generate per hour. A repo that dumps its
 * archive with fresh timestamps is the scenario this exists for: the enqueue's
 * freshness guards can't tell that case apart from a genuine burst of posting,
 * so the cap is the backstop. Documents over the cap are marked `failed` rather
 * than retried — by the time a run is under the cap again they're no longer new.
 */
export const PUSH_AUTHOR_HOURLY_CAP = 5;

/** Attempts before a queued document is abandoned as `failed`. */
export const PUSH_MAX_ATTEMPTS = 3;

/**
 * A `sending` row older than this is assumed to belong to a run that died
 * mid-send, and is re-claimed. Comfortably longer than the 5-minute cron
 * interval so a slow-but-alive run is never stolen from.
 */
export const PUSH_CLAIM_TIMEOUT_MINUTES = 10;

/**
 * Only documents indexed this recently are eligible to notify. This — not
 * `publishedAt` — is the real "new to us" signal: `documents.indexed_at` is set
 * once on first insert and survives every later update, so a tap cursor rewind
 * or a fresh tap instance re-streaming known repos can't page every reader at
 * once.
 */
export const PUSH_INDEXED_WITHIN_HOURS = 1;

/** Only documents published this recently are eligible to notify. */
export const PUSH_PUBLISHED_WITHIN_HOURS = 24;

export { required as requiredEnv };
