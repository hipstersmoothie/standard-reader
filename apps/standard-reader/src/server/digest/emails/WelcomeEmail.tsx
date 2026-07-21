/**
 * DigestWelcomeEmail — sent once, when a reader turns on the weekly digest.
 *
 * Two jobs: (1) set expectations for what the weekly digest contains (mirrors
 * the three sections of `WeeklyDigestEmail`), and (2) nudge the reader to
 * install the browser extension. Built with React Email on the shared editorial
 * chrome in `./shared` so it stays visually in lockstep with the digest.
 *
 * Render:  import { render } from '@react-email/render';
 *          const html = await render(<DigestWelcomeEmail {...props} />);
 */

import {
  Body,
  Button,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

import {
  EmailFooter,
  EmailHead,
  EmailHeader,
  EmailShell,
  SectionLabel,
} from "./shared";
import { c, sans, serif } from "./theme";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export interface WelcomeEmailProps {
  /** Reader's display name for the greeting; falls back to a generic hello. */
  displayName?: string | null;
  /** Absolute Chrome Web Store listing URL for the extension. */
  chromeUrl: string;
  /** Absolute Firefox Add-ons listing URL for the extension. */
  firefoxUrl: string;
  /** One-click unsubscribe URL (also surfaced as List-Unsubscribe headers). */
  unsubscribeUrl: string;
  /** Absolute logo URL (e.g. `${base}/icon-192.png`). */
  logoUrl: string;
}

/* ------------------------------------------------------------------ */
/* What's inside — mirrors WeeklyDigestEmail's three sections.        */
/* ------------------------------------------------------------------ */

const SECTIONS: Array<{ title: string; body: string }> = [
  {
    title: "Best of your subscriptions",
    body: "The week's most-recommended pieces from the writers and publications you already subscribe to.",
  },
  {
    title: "Top on the network",
    body: "What everyone on Standard is reading — the standout articles beyond your own circle.",
  },
  {
    title: "Publications to explore",
    body: "A short, hand-picked list of publications worth discovering, tuned to your reading.",
  },
];

function InsideRow({
  index,
  title,
  body,
  first,
}: {
  index: number;
  title: string;
  body: string;
  first?: boolean;
}) {
  // Card-less: a plain numbered list, rows split by the warm hairline.
  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      border={0}
    >
      <tbody>
        <tr>
          <td
            className={first ? undefined : "d-divider"}
            style={{
              paddingTop: first ? "6px" : "18px",
              paddingBottom: "18px",
              borderTop: first ? undefined : `1px solid ${c.line}`,
            }}
          >
            <table
              role="presentation"
              width="100%"
              cellPadding={0}
              cellSpacing={0}
              border={0}
            >
              <tbody>
                <tr>
                  <td
                    width={34}
                    style={{
                      verticalAlign: "top",
                      width: "34px",
                      paddingTop: "2px",
                    }}
                  >
                    <span
                      className="d-accent"
                      style={{
                        fontFamily: serif,
                        fontWeight: 600,
                        fontSize: "22px",
                        color: c.accentInk,
                      }}
                    >
                      {index}
                    </span>
                  </td>
                  <td style={{ verticalAlign: "top" }}>
                    <Text
                      className="d-ink"
                      style={{
                        fontFamily: serif,
                        fontWeight: 600,
                        fontSize: "18px",
                        letterSpacing: "-0.01em",
                        color: c.ink,
                        margin: 0,
                      }}
                    >
                      {title}
                    </Text>
                    <Text
                      className="d-soft"
                      style={{
                        fontFamily: serif,
                        fontSize: "15px",
                        lineHeight: 1.5,
                        color: c.inkSoft,
                        margin: "4px 0 0",
                      }}
                    >
                      {body}
                    </Text>
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------------------ */
/* Email                                                              */
/* ------------------------------------------------------------------ */

export default function DigestWelcomeEmail({
  displayName,
  chromeUrl,
  firefoxUrl,
  unsubscribeUrl,
  logoUrl,
}: WelcomeEmailProps) {
  const px = { paddingLeft: "34px", paddingRight: "34px" };
  const greeting = displayName ? `Welcome, ${displayName}.` : "Welcome.";

  return (
    <Html lang="en">
      <EmailHead />
      <Preview>You&apos;re in — here&apos;s what to expect each week.</Preview>

      <Body
        className="d-bg"
        style={{ margin: 0, padding: 0, background: c.page }}
      >
        <EmailShell>
          <EmailHeader logoUrl={logoUrl} rightLabel="Welcome" />

          {/* ---- Hero ---- */}
          <Section style={{ ...px, paddingTop: "26px" }}>
            <Text
              className="d-ink"
              style={{
                fontFamily: serif,
                fontWeight: 500,
                fontSize: "27px",
                lineHeight: 1.2,
                letterSpacing: "-0.01em",
                color: c.ink,
                margin: 0,
              }}
            >
              {greeting}
            </Text>
            <Text
              className="d-soft"
              style={{
                fontFamily: serif,
                fontSize: "16px",
                lineHeight: 1.55,
                color: c.inkSoft,
                margin: "12px 0 0",
              }}
            >
              The Standard Digest is on. Once a week we&apos;ll send you a
              short, quiet edition of the best reading on Standard — nothing
              more than that. Here&apos;s what each one holds.
            </Text>
          </Section>

          {/* ---- What's inside ---- */}
          <Section style={{ ...px, paddingTop: "26px" }}>
            <SectionLabel>What&apos;s inside each week</SectionLabel>
          </Section>
          <Section style={{ ...px, paddingTop: "14px" }}>
            {SECTIONS.map((s, i) => (
              <InsideRow
                key={s.title}
                index={i + 1}
                title={s.title}
                body={s.body}
                first={i === 0}
              />
            ))}
          </Section>

          {/* ---- Extension CTA ---- */}
          <Section style={{ ...px, paddingTop: "30px" }}>
            <Section
              className="d-card"
              style={{
                background: c.card,
                border: `1px solid ${c.line}`,
                borderRadius: "6px",
              }}
            >
              <table
                role="presentation"
                width="100%"
                cellPadding={0}
                cellSpacing={0}
                border={0}
              >
                <tbody>
                  <tr>
                    <td style={{ padding: "22px 24px 24px" }}>
                      <SectionLabel>While you wait</SectionLabel>
                      <Text
                        className="d-ink"
                        style={{
                          fontFamily: serif,
                          fontWeight: 500,
                          fontSize: "20px",
                          letterSpacing: "-0.01em",
                          color: c.ink,
                          margin: "10px 0 0",
                        }}
                      >
                        Read anywhere with the browser extension
                      </Text>
                      <Text
                        className="d-soft"
                        style={{
                          fontFamily: serif,
                          fontSize: "15px",
                          lineHeight: 1.5,
                          color: c.inkSoft,
                          margin: "8px 0 0",
                        }}
                      >
                        Turn any article you come across into the clean,
                        distraction-free Standard reader — and save pieces
                        straight to your reading, so more of them make it into
                        your digest.
                      </Text>

                      {/* buttons */}
                      <table
                        role="presentation"
                        cellPadding={0}
                        cellSpacing={0}
                        border={0}
                        style={{ marginTop: "18px" }}
                      >
                        <tbody>
                          <tr>
                            <td style={{ verticalAlign: "middle" }}>
                              <Button
                                href={chromeUrl}
                                style={{
                                  fontFamily: sans,
                                  fontWeight: 700,
                                  fontSize: "13.5px",
                                  color: c.white,
                                  background: c.accent,
                                  borderRadius: "6px",
                                  padding: "11px 20px",
                                  textDecoration: "none",
                                  display: "inline-block",
                                }}
                              >
                                Add to Chrome
                              </Button>
                            </td>
                            <td
                              style={{
                                verticalAlign: "middle",
                                paddingLeft: "10px",
                              }}
                            >
                              <Button
                                href={firefoxUrl}
                                className="d-accent d-divider"
                                style={{
                                  fontFamily: sans,
                                  fontWeight: 700,
                                  fontSize: "13.5px",
                                  color: c.accentInk,
                                  background: "transparent",
                                  borderColor: c.line,
                                  borderStyle: "solid",
                                  borderWidth: "1px",
                                  borderRadius: "6px",
                                  padding: "10px 19px",
                                  textDecoration: "none",
                                  display: "inline-block",
                                }}
                              >
                                Add to Firefox
                              </Button>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>
            </Section>
          </Section>

          {/* ---- Closing ---- */}
          <Section style={{ ...px, paddingTop: "28px" }}>
            <Text
              className="d-soft"
              style={{
                fontFamily: serif,
                fontSize: "15px",
                lineHeight: 1.55,
                color: c.inkSoft,
                margin: 0,
              }}
            >
              That&apos;s it. Your first digest will arrive with the next weekly
              send. If you ever change your mind, there&apos;s an{" "}
              <Link
                href={unsubscribeUrl}
                className="d-accent"
                style={{
                  fontFamily: serif,
                  fontWeight: 600,
                  color: c.accentInk,
                }}
              >
                unsubscribe
              </Link>{" "}
              link at the bottom of every email.
            </Text>
          </Section>

          <EmailFooter logoUrl={logoUrl} unsubscribeUrl={unsubscribeUrl} />
        </EmailShell>
      </Body>
    </Html>
  );
}
