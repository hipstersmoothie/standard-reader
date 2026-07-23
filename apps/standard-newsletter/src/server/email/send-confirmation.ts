/** Send the double-opt-in confirmation email for a pending subscription. */

import { render } from "@react-email/render";

import { emailConfig } from "./config";
import { ConfirmEmail } from "./emails/ConfirmEmail";
import { sendEmail } from "./resend";

export async function sendConfirmationEmail(input: {
  email: string;
  token: string;
  publicationName: string;
}): Promise<boolean> {
  const confirmUrl = `${emailConfig.publicUrl}/subscribe/confirm?token=${encodeURIComponent(input.token)}`;
  const props = { publicationName: input.publicationName, confirmUrl };
  const html = await render(ConfirmEmail(props));
  const text = await render(ConfirmEmail(props), { plainText: true });
  const result = await sendEmail({
    to: input.email,
    subject: `Confirm your subscription to ${input.publicationName}`,
    html,
    text,
  });
  return result.ok;
}
