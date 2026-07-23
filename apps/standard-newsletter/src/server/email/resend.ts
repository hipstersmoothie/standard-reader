/**
 * Minimal Resend client for sending newsletter emails.
 * See https://resend.com/docs/api-reference/emails/send-email.
 *
 * Resend bills per email sent, so this is the metered boundary of the product.
 * `sendEmail` never throws on an API error — it returns a structured result so
 * the send runner can distinguish a rate-limit stop from a per-recipient
 * failure and keep going.
 */

import { Resend } from "resend";

import { emailConfig } from "./config";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Optional per-publication From override (`"Name <addr@domain>"`). */
  from?: string;
  /** One-click unsubscribe URL, surfaced as `List-Unsubscribe` headers. */
  unsubscribeUrl?: string;
}

export interface SendEmailResult {
  ok: boolean;
  /** Resend message id when accepted. */
  id?: string;
  /** True when Resend rejected for rate limiting (429) — caller should back off. */
  rateLimited: boolean;
  error?: string;
}

let client: Resend | undefined;

function getClient(): Resend {
  client ??= new Resend(emailConfig.resendApiKey);
  return client;
}

/**
 * `Standard Newsletter <newsletters@standard.site>` so inboxes show a name
 * rather than a bare address. Passes an explicit `from` through untouched when
 * it already carries its own display name, and quotes the name so a comma in it
 * can't split the address per RFC 5322.
 */
function fromHeader(explicitFrom?: string): string {
  const address = explicitFrom ?? emailConfig.defaultFrom;
  if (address.includes("<")) return address;
  const name = emailConfig.defaultFromName.replaceAll('"', String.raw`\"`);
  return `"${name}" <${address}>`;
}

export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const headers: Record<string, string> = {};
  if (input.unsubscribeUrl) {
    headers["List-Unsubscribe"] = `<${input.unsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  try {
    const { data, error } = await getClient().emails.send({
      from: fromHeader(input.from),
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      headers,
    });

    if (error) {
      const rateLimited = error.name === "rate_limit_exceeded";
      return { ok: false, rateLimited, error: error.message };
    }

    return { ok: true, id: data?.id, rateLimited: false };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, rateLimited: false, error: message };
  }
}
