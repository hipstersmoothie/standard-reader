/**
 * Digest welcome email — sent once, the first time a reader turns the weekly
 * digest on and we have captured their email. Called from the OAuth callback
 * (`src/integrations/auth/callback.server.ts`) after `user.email` is persisted.
 *
 * The single-send guarantee lives in the callback: it only calls this when the
 * reader's `weeklyDigestWelcomeSentAt` is still null, and stamps that column on
 * success. This helper never throws — a welcome email failing must never break
 * sign-in — and returns whether the send was accepted so the caller can decide
 * whether to stamp.
 */

import { getPublicUrl } from "#/lib/public-url";

import { sendEmail } from "./comail";
import { renderWelcomeEmail } from "./render-welcome";
import { makeUnsubscribeToken } from "./unsubscribe-token";

export interface SendWelcomeInput {
  /** Recipient `user.id` — signs the unsubscribe token. */
  userId: string;
  /** Recipient email address (from the atproto account). */
  email: string;
  /** Reader's display name for the greeting (optional). */
  displayName?: string | null;
}

/**
 * Render and send the welcome email. Returns `true` when comail accepted it so
 * the caller can stamp `weeklyDigestWelcomeSentAt`; `false` on any failure (so
 * the next login retries). Swallows all errors.
 */
export async function sendDigestWelcomeEmail(
  input: SendWelcomeInput,
): Promise<boolean> {
  try {
    const baseUrl = getPublicUrl();
    const rendered = await renderWelcomeEmail({
      baseUrl,
      userId: input.userId,
      displayName: input.displayName,
    });

    const unsubscribeUrl = `${baseUrl.replace(/\/$/, "")}/api/digest/unsubscribe?token=${encodeURIComponent(
      makeUnsubscribeToken(input.userId),
    )}`;

    const result = await sendEmail({
      to: input.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      unsubscribeUrl,
    });

    if (!result.ok) {
      console.warn(
        `[digest] welcome send failed for ${input.userId}: ${result.error ?? result.status}`,
      );
    }
    return result.ok;
  } catch (error) {
    console.warn(
      `[digest] welcome send threw for ${input.userId}:`,
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
}
