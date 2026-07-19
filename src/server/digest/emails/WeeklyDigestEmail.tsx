/**
 * WeeklyDigestEmail — the Standard Digest weekly reading email.
 *
 * Built with React Email (@react-email/components). Renders to
 * email-client-safe, table-based HTML with inline styles. Single column,
 * ~600px, mobile-first, light + dark aware. All images use absolute URLs with
 * alt text.
 *
 * Render:  import { render } from '@react-email/render';
 *          const html = await render(<WeeklyDigestEmail {...props} />);
 *
 * Colors + fonts mirror the reader's editorial theme
 * (src/components/reader/theme.ts): warm paper + warm ink, muted terracotta
 * accent; Newsreader (serif/display), Atkinson Hyperlegible Next (sans/UI),
 * Spline Sans Mono (mono, counts/dates only). Email can't use the theme's
 * oklch/StyleX tokens, so the light values are inlined in the `c` palette below
 * and the dark values live in the `<style>` block, applied via the `d-*`
 * classes on each element (light + dark are the single place to retune).
 */

import {
  Body,
  Hr,
  Html,
  Img,
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
  PubIcon,
  SectionLabel,
} from "./shared";
import { c, fmtCount, mono, sans, serif } from "./theme";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

interface DigestArticle {
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  authorDisplayName: string | null;
  authorHandle: string | null;
  publicationName: string | null;
  publicationIconUrl: string | null;
  recommendCount: number;
  url: string;
}

interface DigestPublication {
  name: string;
  iconUrl: string | null;
  description: string | null;
  subscriberCount: number;
  url: string;
}

interface DigestEmailProps {
  weekLabel: string; // e.g. "Week of Jul 4, 2026"
  articles: Array<DigestArticle>;
  networkArticles: Array<DigestArticle>;
  recommendations: Array<DigestPublication>;
  unsubscribeUrl: string;
  logoUrl: string;
}

/* ------------------------------------------------------------------ */
/* Article card                                                       */
/* ------------------------------------------------------------------ */

function ArticleCard({
  article,
  lead,
}: {
  article: DigestArticle;
  lead?: boolean;
}) {
  const titleSize = lead ? "25px" : "20px";
  return (
    <Section
      className="d-card"
      style={{
        background: c.card,
        border: `1px solid ${c.line}`,
        borderRadius: "6px",
        margin: "12px 0 0",
        overflow: "hidden",
      }}
    >
      {article.coverImageUrl && (
        <Link href={article.url} style={{ textDecoration: "none" }}>
          <Img
            src={article.coverImageUrl}
            alt={article.title}
            width="100%"
            style={{
              width: "100%",
              borderRadius: "6px 6px 0 0",
              display: "block",
            }}
          />
        </Link>
      )}

      <table
        role="presentation"
        width="100%"
        cellPadding={0}
        cellSpacing={0}
        border={0}
      >
        <tbody>
          <tr>
            <td style={{ padding: lead ? "22px 24px 24px" : "20px 24px 22px" }}>
              {/* meta: publication + recommend count */}
              <table
                role="presentation"
                width="100%"
                cellPadding={0}
                cellSpacing={0}
                border={0}
              >
                <tbody>
                  <tr>
                    <td align="left" style={{ verticalAlign: "middle" }}>
                      <table
                        role="presentation"
                        cellPadding={0}
                        cellSpacing={0}
                        border={0}
                      >
                        <tbody>
                          <tr>
                            <td style={{ verticalAlign: "middle" }}>
                              <PubIcon
                                name={article.publicationName}
                                iconUrl={article.publicationIconUrl}
                                size={26}
                              />
                            </td>
                            <td
                              style={{
                                verticalAlign: "middle",
                                paddingLeft: "9px",
                              }}
                            >
                              <span
                                className="d-soft"
                                style={{
                                  fontFamily: serif,
                                  fontSize: "14px",
                                  color: c.inkSoft,
                                }}
                              >
                                {article.publicationName || "A publication"}
                              </span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                    <td align="right" style={{ verticalAlign: "middle" }}>
                      <span
                        className="d-muted"
                        style={{
                          fontFamily: mono,
                          fontSize: "12px",
                          color: c.muted,
                        }}
                      >
                        ★&nbsp;{fmtCount(article.recommendCount)}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* title */}
              <Link
                href={article.url}
                className="d-ink"
                style={{
                  display: "block",
                  fontFamily: serif,
                  fontWeight: 500,
                  fontSize: titleSize,
                  lineHeight: 1.2,
                  letterSpacing: "-0.01em",
                  color: c.ink,
                  padding: "13px 0 0",
                }}
              >
                {article.title}
              </Link>

              {/* excerpt */}
              {article.description && (
                <Text
                  className="d-soft"
                  style={{
                    fontFamily: serif,
                    fontSize: lead ? "16px" : "15px",
                    lineHeight: 1.5,
                    color: c.inkSoft,
                    margin: "8px 0 0",
                  }}
                >
                  {article.description}
                </Text>
              )}

              {/* byline + CTA */}
              <table
                role="presentation"
                width="100%"
                cellPadding={0}
                cellSpacing={0}
                border={0}
                style={{ marginTop: "15px" }}
              >
                <tbody>
                  <tr>
                    <td align="left" style={{ verticalAlign: "middle" }}>
                      <span
                        className="d-muted"
                        style={{
                          fontFamily: sans,
                          fontSize: "12.5px",
                          color: c.muted,
                        }}
                      >
                        {article.authorDisplayName
                          ? `By ${article.authorDisplayName}`
                          : "Anonymous"}
                        {article.authorHandle
                          ? ` · ${article.authorHandle}`
                          : ""}
                      </span>
                    </td>
                    <td align="right" style={{ verticalAlign: "middle" }}>
                      <Link
                        href={article.url}
                        className="d-accent"
                        style={{
                          fontFamily: sans,
                          fontWeight: 700,
                          fontSize: "13px",
                          color: c.accentInk,
                        }}
                      >
                        Read →
                      </Link>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Recommendation card                                                */
/* ------------------------------------------------------------------ */

function RecommendationCard({ pub }: { pub: DigestPublication }) {
  return (
    <Section
      className="d-card"
      style={{
        background: c.card,
        border: `1px solid ${c.line}`,
        borderRadius: "6px",
        margin: "12px 0 0",
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
            <td style={{ padding: "18px 22px" }}>
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
                      width={46}
                      style={{ verticalAlign: "top", width: "46px" }}
                    >
                      <PubIcon
                        name={pub.name}
                        iconUrl={pub.iconUrl}
                        size={42}
                      />
                    </td>
                    <td style={{ verticalAlign: "top", paddingLeft: "14px" }}>
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
                        {pub.name}
                      </Text>
                      {pub.description && (
                        <Text
                          className="d-soft"
                          style={{
                            fontFamily: serif,
                            fontSize: "14.5px",
                            lineHeight: 1.45,
                            color: c.inkSoft,
                            margin: "3px 0 0",
                          }}
                        >
                          {pub.description}
                        </Text>
                      )}
                      <table
                        role="presentation"
                        width="100%"
                        cellPadding={0}
                        cellSpacing={0}
                        border={0}
                        style={{ marginTop: "11px" }}
                      >
                        <tbody>
                          <tr>
                            <td
                              align="left"
                              style={{ verticalAlign: "middle" }}
                            >
                              <span
                                className="d-muted"
                                style={{
                                  fontFamily: mono,
                                  fontSize: "11.5px",
                                  color: c.muted,
                                }}
                              >
                                {fmtCount(pub.subscriberCount)} readers
                              </span>
                            </td>
                            <td
                              align="right"
                              style={{ verticalAlign: "middle" }}
                            >
                              <Link
                                href={pub.url}
                                className="d-accent"
                                style={{
                                  fontFamily: sans,
                                  fontWeight: 700,
                                  fontSize: "12.5px",
                                  color: c.accentInk,
                                }}
                              >
                                Discover →
                              </Link>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Email                                                              */
/* ------------------------------------------------------------------ */

export default function WeeklyDigestEmail({
  weekLabel,
  articles,
  networkArticles,
  recommendations,
  unsubscribeUrl,
  logoUrl,
}: DigestEmailProps) {
  const px = { paddingLeft: "34px", paddingRight: "34px" };

  return (
    <Html lang="en">
      <EmailHead
        extraCss={`
            .lead-title { font-size:26px !important; }`}
      />
      <Preview>The best of what you subscribe to this week.</Preview>

      <Body
        className="d-bg"
        style={{ margin: 0, padding: 0, background: c.page }}
      >
        <EmailShell>
          <EmailHeader logoUrl={logoUrl} rightLabel={weekLabel} />

          {/* ---- Best of your follows ---- */}
          <Section style={{ ...px, paddingTop: "22px" }}>
            <SectionLabel>Best of your subscriptions</SectionLabel>
          </Section>
          <Section style={px}>
            {articles.map((a, i) => (
              <ArticleCard key={a.url + i} article={a} lead={i === 0} />
            ))}
          </Section>

          {/* ---- Top on the network ---- */}
          {networkArticles.length > 0 && (
            <>
              <Section style={{ ...px, paddingTop: "30px" }}>
                <Hr
                  className="d-divider"
                  style={{
                    borderColor: c.line,
                    borderWidth: "1px 0 0",
                    margin: "0 0 20px",
                    height: 0,
                  }}
                />
                <SectionLabel>Top on the network</SectionLabel>
              </Section>
              <Section style={px}>
                {networkArticles.map((a, i) => (
                  <ArticleCard key={a.url + i} article={a} />
                ))}
              </Section>
            </>
          )}

          {/* ---- Publications to explore ---- */}
          {recommendations.length > 0 && (
            <>
              <Section style={{ ...px, paddingTop: "30px" }}>
                <Hr
                  className="d-divider"
                  style={{
                    borderColor: c.line,
                    borderWidth: "1px 0 0",
                    margin: "0 0 20px",
                    height: 0,
                  }}
                />
                <SectionLabel>Publications to explore</SectionLabel>
              </Section>
              <Section style={px}>
                {recommendations.map((p, i) => (
                  <RecommendationCard key={p.url + i} pub={p} />
                ))}
              </Section>
            </>
          )}

          <EmailFooter logoUrl={logoUrl} unsubscribeUrl={unsubscribeUrl} />
        </EmailShell>
      </Body>
    </Html>
  );
}

export type { DigestArticle, DigestPublication, DigestEmailProps };
