/**
 * NewsletterEmail — one published document from a standard.site publication,
 * mailed to its subscribers. Standard Newsletter does not author content; the
 * body comes straight from the publication's post (already-rendered HTML), so
 * this template is the editorial chrome around it: masthead, the post body, and
 * a footer with the one-click unsubscribe link Resend surfaces as
 * `List-Unsubscribe`.
 *
 * Render:  import { render } from "@react-email/render";
 *          const html = await render(<NewsletterEmail {...props} />);
 *          const text = await render(<NewsletterEmail {...props} />, { plainText: true });
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

export interface NewsletterEmailProps {
  /** Publication name, shown as the masthead. */
  publicationName: string;
  /** Document title. */
  title: string;
  /** Short preview line shown in the inbox before opening. */
  preview: string;
  /** Canonical URL of the document on the publication. */
  canonicalUrl: string;
  /** Pre-rendered HTML body of the post. */
  bodyHtml: string;
  /** One-click unsubscribe URL. */
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
const footer = { fontSize: "13px", color: "#8a817c", lineHeight: "1.6" };
const link = { color: "#8a817c", textDecoration: "underline" };

export function NewsletterEmail({
  publicationName,
  title,
  preview,
  canonicalUrl,
  bodyHtml,
  unsubscribeUrl,
}: NewsletterEmailProps) {
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
          <Section dangerouslySetInnerHTML={{ __html: bodyHtml }} />
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
