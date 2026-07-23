/**
 * CLI: send one document to a publication's subscribers via Resend.
 *
 *   pnpm --filter standard-newsletter newsletter:send
 *
 * Reads RESEND_API_KEY (and the NEWSLETTER_* overrides) from `.env`. Right now
 * the subscriber list is a placeholder; it gets wired to the store with the DB
 * layer. Runs as a dry stub unless RESEND_API_KEY is set.
 */

import { sendNewsletter } from "../src/server/email/send-newsletter";
import type {
  NewsletterSend,
  Subscriber,
} from "../src/server/email/send-newsletter";

const send: NewsletterSend = {
  publicationUri: "at://did:plc:demo/site.standard.publication/dispatch",
  documentUri: "at://did:plc:demo/site.standard.document/this-week",
  publicationName: "The Dispatch",
  title: "This week on The Dispatch",
  preview: "A short note about what shipped this week.",
  canonicalUrl: "https://dispatch.standard.site/this-week",
  // Demo uses the plaintext fallback; real dispatches pass a StandardSiteDocument
  // built from the post, rendered via @standard-reader/renderer-email.
  document: null,
  textContent:
    "This is a sample post from the manual send CLI.\n\nReal sends render the publication's post with the email renderer.",
};

const subscribers: Array<Subscriber> = [
  { email: "reader@example.com", unsubscribeToken: "demo-token" },
];

if (!process.env.RESEND_API_KEY) {
  console.log(
    "RESEND_API_KEY not set — skipping real send. Configure .env to send for real.",
  );
  console.log(
    `Would send "${send.title}" to ${subscribers.length} subscriber(s).`,
  );
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(0);
}

const report = await sendNewsletter(send, subscribers);
console.log(
  `Sent "${send.title}": ${report.delivered}/${report.total} delivered, ${report.failed} failed` +
    (report.rateLimited ? " (stopped on rate limit)" : ""),
);
