/**
 * Send one published document to a publication's subscriber list.
 *
 * This is the orchestration seam between the subscriber store and the Resend
 * transport: render the post once, then fan out per recipient with a
 * per-recipient unsubscribe link, backing off if Resend rate-limits. The send
 * and its `delivered` events are recorded to newsletter_sends /
 * newsletter_send_events; opens/clicks/bounces/unsubscribes arrive later via the
 * Resend webhook and are appended as events too.
 */

import { render } from "@react-email/render";

import type { NewNewsletterSendEvent } from "@standard-reader/db/schema";
import type { StandardSiteDocument } from "@standard-reader/renderer-email";

import { recordEvents, recordSend } from "../send-events.server";
import { emailConfig } from "./config";
import { NewsletterEmail } from "./emails/NewsletterEmail";
import { sendEmail } from "./resend";

export interface Subscriber {
  email: string;
  /** Opaque token used to build the one-click unsubscribe URL. */
  unsubscribeToken: string;
}

export interface NewsletterSend {
  /** Publication AT-URI (for the send record). */
  publicationUri: string;
  /** Document AT-URI — the send's stable id. */
  documentUri: string;
  publicationName: string;
  /** Optional per-publication From override (`"Name <addr@domain>"`). */
  from?: string;
  title: string;
  preview: string;
  canonicalUrl: string;
  /** The post content, rendered with @standard-reader/renderer-email. */
  document: StandardSiteDocument | null;
  /** Plaintext fallback body when the post has no structured content. */
  textContent: string | null;
}

export interface SendReport {
  total: number;
  delivered: number;
  failed: number;
  rateLimited: boolean;
}

function unsubscribeUrl(token: string): string {
  return `${emailConfig.publicUrl}/unsubscribe/${token}`;
}

/**
 * Render the post once (the body is identical for everyone) and reuse it across
 * recipients; only the unsubscribe link varies per subscriber.
 */
export async function sendNewsletter(
  send: NewsletterSend,
  subscribers: Subscriber[],
): Promise<SendReport> {
  const report: SendReport = {
    total: subscribers.length,
    delivered: 0,
    failed: 0,
    rateLimited: false,
  };

  const deliveredEvents: NewNewsletterSendEvent[] = [];

  for (const subscriber of subscribers) {
    const props = {
      publicationName: send.publicationName,
      title: send.title,
      preview: send.preview,
      canonicalUrl: send.canonicalUrl,
      document: send.document,
      textContent: send.textContent,
      unsubscribeUrl: unsubscribeUrl(subscriber.unsubscribeToken),
    };

    const html = await render(NewsletterEmail(props));
    const text = await render(NewsletterEmail(props), { plainText: true });

    const result = await sendEmail({
      to: subscriber.email,
      from: send.from,
      subject: send.title,
      html,
      text,
      unsubscribeUrl: props.unsubscribeUrl,
    });

    if (result.ok) {
      report.delivered += 1;
      deliveredEvents.push({
        id: result.id ?? `${send.documentUri}:${subscriber.email}`,
        sendId: send.documentUri,
        recipient: subscriber.email,
        type: "delivered",
      });
    } else {
      report.failed += 1;
      if (result.rateLimited) {
        report.rateLimited = true;
        break;
      }
    }
  }

  // Record the send and its delivered events. Opens/clicks/bounces/unsubscribes
  // are appended later by the Resend webhook handler.
  await recordSend({
    id: send.documentUri,
    publicationUri: send.publicationUri,
    documentUri: send.documentUri,
    subject: send.title,
    fromAddress: send.from,
    recipientCount: subscribers.length,
  });
  await recordEvents(deliveredEvents);

  return report;
}
