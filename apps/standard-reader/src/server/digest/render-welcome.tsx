/**
 * Render the digest welcome email into the `{ subject, html, text }` comail
 * needs. Mirrors `render.tsx` (the weekly-digest renderer): builds the signed
 * unsubscribe link and absolute asset URLs, then renders both an HTML and a
 * plaintext part.
 */

import { render } from "@react-email/render";

import { CHROME_STORE_URL, FIREFOX_STORE_URL } from "#/lib/extension-links";

import DigestWelcomeEmail from "./emails/WelcomeEmail";
import { makeUnsubscribeToken } from "./unsubscribe-token";

export interface RenderedWelcome {
  subject: string;
  html: string;
  text: string;
}

export interface RenderWelcomeOptions {
  /** Absolute site origin (from `getPublicUrl()`), no trailing slash required. */
  baseUrl: string;
  /** The recipient's `user.id`, used to sign their unsubscribe link. */
  userId: string;
  /** Reader's display name for the greeting (optional). */
  displayName?: string | null;
}

const SUBJECT = "You're subscribed to the Standard Digest";

function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

export async function renderWelcomeEmail(
  options: RenderWelcomeOptions,
): Promise<RenderedWelcome> {
  const base = trimBase(options.baseUrl);
  const token = makeUnsubscribeToken(options.userId);

  const props = {
    displayName: options.displayName ?? null,
    chromeUrl: CHROME_STORE_URL,
    firefoxUrl: FIREFOX_STORE_URL,
    unsubscribeUrl: `${base}/api/digest/unsubscribe?token=${encodeURIComponent(token)}`,
    logoUrl: `${base}/icon-192.png`,
  };

  const element = <DigestWelcomeEmail {...props} />;
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);

  return { subject: SUBJECT, html, text };
}
