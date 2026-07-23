import type { NewsletterEventType } from "@standard-reader/db/schema";
import { createFileRoute } from "@tanstack/react-router";

/**
 * Resend webhook receiver. Resend POSTs delivery events
 * (https://resend.com/docs/dashboard/webhooks/introduction); we map the ones we
 * track onto newsletter_send_events, correlating back to the send via the
 * provider message id the runner stored on the `delivered` event.
 *
 * Configure the endpoint in the Resend dashboard to POST here. (Signature
 * verification via the Svix headers is a TODO before production.)
 */

const TYPE_MAP: Record<string, NewsletterEventType> = {
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

interface ResendEvent {
  type?: string;
  data?: {
    email_id?: string;
    to?: string | string[];
    click?: { link?: string };
  };
}

export const Route = createFileRoute("/api/resend-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: ResendEvent;
        try {
          payload = (await request.json()) as ResendEvent;
        } catch {
          return new Response("invalid json", { status: 400 });
        }

        const type = payload.type ? TYPE_MAP[payload.type] : undefined;
        const messageId = payload.data?.email_id;
        const to = Array.isArray(payload.data?.to)
          ? payload.data?.to[0]
          : payload.data?.to;

        if (!type || !messageId || !to) {
          return new Response("ignored", { status: 202 });
        }

        const { recordWebhookEvent } =
          await import("../server/send-events.server");
        const recorded = await recordWebhookEvent({
          messageId,
          recipient: to,
          type,
          url: payload.data?.click?.link,
        });

        return new Response(recorded ? "ok" : "unmatched", {
          status: recorded ? 200 : 202,
        });
      },
    },
  },
});
