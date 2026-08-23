import { createFileRoute } from "@tanstack/react-router";

import { emailConfig } from "../server/email/config";
import type { ResendEvent } from "../server/email/webhook";
import {
  mapResendEvent,
  svixHeaders,
  verifyResendSignature,
} from "../server/email/webhook";

/**
 * Resend webhook receiver. Resend POSTs delivery events
 * (https://resend.com/docs/dashboard/webhooks/introduction); we verify the Svix
 * signature, then map the ones we track onto newsletter_send_events —
 * correlating back to the send via the provider message id the runner stored on
 * the `delivered` event.
 *
 * Configure the endpoint in the Resend dashboard to POST here and set
 * RESEND_WEBHOOK_SECRET to the `whsec_...` signing secret it shows you.
 */
export const Route = createFileRoute("/api/resend-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Read the raw body once — signature verification needs the exact bytes.
        const raw = await request.text();

        const secret = emailConfig.resendWebhookSecret;
        if (!secret) {
          // Fail loud rather than trust an unsigned webhook in production.
          return new Response("webhook secret not configured", { status: 503 });
        }
        if (
          !verifyResendSignature({
            secret,
            headers: svixHeaders(request.headers),
            body: raw,
          })
        ) {
          return new Response("invalid signature", { status: 401 });
        }

        let payload: ResendEvent;
        try {
          payload = JSON.parse(raw) as ResendEvent;
        } catch {
          return new Response("invalid json", { status: 400 });
        }

        const event = mapResendEvent(payload);
        if (!event) {
          return new Response("ignored", { status: 202 });
        }

        const { recordWebhookEvent } =
          await import("../server/send-events.server");
        const recorded = await recordWebhookEvent(event);

        return new Response(recorded ? "ok" : "unmatched", {
          status: recorded ? 200 : 202,
        });
      },
    },
  },
});
