/**
 * NewsletterEmail — one published document from a standard.site publication,
 * mailed to its subscribers. Standard Newsletter authors nothing; the body comes
 * from the publication's post, rendered with React Email via
 * @standard-reader/renderer-email (full block fidelity — headings, images,
 * lists, code, tables, embeds). Falls back to plaintext paragraphs when the post
 * has no structured content.
 *
 * Render:  import { render } from "@react-email/render";
 *          const html = await render(<NewsletterEmail {...props} />);
 */

import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { DocumentEmailBody } from "@standard-reader/renderer-email";
import type { StandardSiteDocument } from "@standard-reader/renderer-email";

import { PALETTE, PALETTE_FONTS } from "../../../theme-palette";

export interface NewsletterEmailProps {
  publicationName: string;
  title: string;
  preview: string;
  canonicalUrl: string;
  /** The post content, rendered with the email renderer when present. */
  document: StandardSiteDocument | null;
  /** Plaintext fallback body when the post has no structured content. */
  textContent: string | null;
  unsubscribeUrl: string;
  /** Page where a subscriber can review or remove their subscriptions. */
  manageUrl: string;
}

// Mail clients do not resolve CSS variables, so email styling reads the
// flattened hex mirror of the editorial theme rather than the `C` tokens.
const main = {
  backgroundColor: PALETTE.card,
  fontFamily: PALETTE_FONTS.serif,
};
const container = { maxWidth: "560px", margin: "0 auto", padding: "32px 24px" };
const masthead = {
  fontSize: "14px",
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
  color: PALETTE.muted,
  margin: "0 0 24px",
};
const heading = { fontSize: "28px", lineHeight: "1.2", margin: "0 0 16px" };
const paragraph = {
  fontSize: "17px",
  lineHeight: "1.6",
  color: PALETTE.ink,
  margin: "0 0 16px",
};
const footer = { fontSize: "13px", color: PALETTE.muted, lineHeight: "1.6" };
const link = { color: PALETTE.accentInk, textDecoration: "underline" };

function FallbackBody({ textContent }: { textContent: string | null }) {
  const paras = (textContent ?? "")
    .trim()
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paras.length === 0) {
    return <Text style={paragraph}>Read the full post online.</Text>;
  }
  return (
    <>
      {paras.map((p, i) => (
        <Text key={i} style={paragraph}>
          {p}
        </Text>
      ))}
    </>
  );
}

export function NewsletterEmail({
  publicationName,
  title,
  preview,
  canonicalUrl,
  document,
  textContent,
  unsubscribeUrl,
  manageUrl,
}: NewsletterEmailProps) {
  const hasContent = Boolean(
    document && document.content != null && document.content !== "",
  );
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={masthead}>{publicationName}</Text>
          <Heading style={heading}>
            <Link href={canonicalUrl} style={{ color: PALETTE.ink }}>
              {title}
            </Link>
          </Heading>
          <Section>
            {hasContent && document ? (
              <DocumentEmailBody document={document} />
            ) : (
              <FallbackBody textContent={textContent} />
            )}
          </Section>
          <Hr style={{ borderColor: PALETTE.line, margin: "32px 0 16px" }} />
          <Text style={footer}>
            You’re receiving this because you subscribe to {publicationName}.{" "}
            <Link href={unsubscribeUrl} style={link}>
              Unsubscribe
            </Link>{" "}
            or{" "}
            <Link href={manageUrl} style={link}>
              manage your subscriptions
            </Link>
            .
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default NewsletterEmail;
