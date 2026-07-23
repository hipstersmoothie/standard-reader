/**
 * NewsletterEmail — one published document from a standard.site publication,
 * mailed to its subscribers. Standard Newsletter authors nothing; the body comes
 * from the publication's post. Rendered entirely with React Email components
 * (react.email): the body is the post's markdown via <Markdown>, or plaintext
 * paragraphs via <Text> when no markdown is available.
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
  Markdown,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export interface NewsletterEmailProps {
  publicationName: string;
  title: string;
  preview: string;
  canonicalUrl: string;
  /** Post body as markdown; when present it's rendered richly. */
  markdown: string | null;
  /** Plaintext fallback body (rendered as paragraphs) when there's no markdown. */
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

const markdownStyles = {
  p: paragraph,
  h1: { fontSize: "24px", lineHeight: "1.25", margin: "28px 0 12px" },
  h2: { fontSize: "20px", lineHeight: "1.3", margin: "24px 0 10px" },
  h3: { fontSize: "18px", lineHeight: "1.35", margin: "20px 0 8px" },
  link: { color: "#ad7f58", textDecoration: "underline" },
  li: { ...paragraph, margin: "0 0 8px" },
  blockQuote: {
    borderLeft: "3px solid #e7e2dd",
    paddingLeft: "16px",
    color: "#6f5636",
    fontStyle: "italic",
  },
  codeInline: {
    fontFamily: "Menlo, monospace",
    fontSize: "14px",
    background: "#f1ece5",
    padding: "1px 4px",
    borderRadius: "4px",
  },
};

function DocumentBody({
  markdown,
  textContent,
}: {
  markdown: string | null;
  textContent: string | null;
}) {
  if (markdown) {
    return <Markdown markdownCustomStyles={markdownStyles}>{markdown}</Markdown>;
  }
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
  markdown,
  textContent,
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
          <Section>
            <DocumentBody markdown={markdown} textContent={textContent} />
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
