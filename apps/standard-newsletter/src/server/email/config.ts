/**
 * Resend + sending configuration, read from the environment.
 *
 * Standard Newsletter sends on behalf of publications, so the `from` identity is
 * per-publication in practice; these are the account-level defaults and the
 * Resend credential. When we later move to Amazon SES, only this module and
 * `resend.ts` need to change.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const emailConfig = {
  /** Resend API key — https://resend.com/api-keys */
  get resendApiKey(): string {
    return required("RESEND_API_KEY");
  },
  /** Default From address, e.g. `newsletters@standard.site`. */
  get defaultFrom(): string {
    return optional("NEWSLETTER_FROM", "newsletters@standard.site");
  },
  /** Default display name shown in the inbox. */
  get defaultFromName(): string {
    return optional("NEWSLETTER_FROM_NAME", "Standard Newsletter");
  },
  /**
   * Base URL for building unsubscribe / open-tracking links. Falls back to the
   * public site origin.
   */
  get publicUrl(): string {
    return optional("PUBLIC_URL", "https://newsletter.standard.site");
  },
} as const;
