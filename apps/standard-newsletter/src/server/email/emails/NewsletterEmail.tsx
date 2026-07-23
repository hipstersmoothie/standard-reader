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
import {
  DocumentEmailBody,
  type StandardSiteDocument,
} from "@standard-reader/renderer-email";

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
}

const main = { backgroundColor: "#faf9f7", fontFamily: "Georgia, serif" };
const container = { maxWidth: "560px", margin: "0 auto", padding: "32px 24px" };
const masthead = {
  fontSize: "14px",
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
  color: "#8a817c",
  margin: "0 0 24px",
};
const heading = { fontSize: "28px", lineHeight: "1.2", margin: "0 0 16px" };
const paragraph = {
  fontSize: "17px",
  lineHeight: "1.6",
  color: "#3e332e",
  margin: "0 0 16px",
};
const footer = { fontSize: "13px", color: "#8a817c", lineHeight: "1.6" };
const link = { color: "#8a817c", textDecoration: "underline" };

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
            <Link href={canonicalUrl} style={{ color: "#1a1a1a" }}>
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
          <Hr style={{ borderColor: "#e7e2dd", margin: "32px 0 16px" }} />
          <Text style={footer}>
            You’re receiving this because you subscribe to {publicationName}.{" "}
            <Link href={unsubscribeUrl} style={link}>
              Unsubscribe
            </Link>
            .
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default NewsletterEmail;
