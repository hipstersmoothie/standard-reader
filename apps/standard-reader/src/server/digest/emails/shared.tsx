/**
 * Shared email components for Standard's transactional emails (weekly digest,
 * digest welcome): the dark-mode `<style>` head, the header/footer chrome, the
 * fixed-width shell, and the shared icon/label bits. Palette, fonts, and pure
 * helpers live in `./theme` — keeping this file component-only satisfies
 * fast-refresh's single-export rule. Retune once here (and in `./theme`) and
 * both emails follow.
 */

import {
  Container,
  Head,
  Hr,
  Img,
  Link,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

import { c, initials, mono, monoTone, sans, serif } from "./theme";

/** Rounded-square publication icon. Uses the real icon image when present, else
 *  a colored initials tile (works everywhere, incl. Outlook). */
export function PubIcon({
  name,
  iconUrl,
  size,
}: {
  name: string | null;
  iconUrl: string | null;
  size: number;
}) {
  const fontSize = Math.round(size * 0.42);
  const radius = `${Math.round(size * 0.22)}px`;
  if (iconUrl) {
    return (
      <Img
        src={iconUrl}
        width={size}
        height={size}
        alt={name ? `${name} icon` : "Publication icon"}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          display: "block",
        }}
      />
    );
  }
  return (
    <table
      role="presentation"
      width={String(size)}
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={{
        width: size,
        height: size,
        background: monoTone(name || "x"),
        borderRadius: radius,
      }}
    >
      <tbody>
        <tr>
          <td
            align="center"
            valign="middle"
            style={{
              height: size,
              fontFamily: serif,
              fontWeight: 600,
              fontSize,
              color: c.white,
            }}
          >
            {initials(name)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      className="d-muted"
      style={{
        fontFamily: sans,
        fontWeight: 700,
        fontSize: "11px",
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: c.muted,
        margin: "0",
      }}
    >
      {children}
    </Text>
  );
}

/* ------------------------------------------------------------------ */
/* Head — fonts + dark-mode rules. `extraCss` appends email-specific    */
/* responsive rules inside the shared max-width media query.            */
/* ------------------------------------------------------------------ */

export function EmailHead({ extraCss = "" }: { extraCss?: string }) {
  return (
    <Head>
      <meta name="color-scheme" content="light dark" />
      <meta name="supported-color-schemes" content="light dark" />
      <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400;1,6..72,500&family=Atkinson+Hyperlegible+Next:wght@400;500;600;700&family=Spline+Sans+Mono:wght@400;500&display=swap');

          /* Dark mode — theme.ts editorial dark values. Each rule targets the
             property the element actually uses (Hr colors via border-color). */
          @media (prefers-color-scheme: dark) {
            .d-bg      { background:#17120e !important; }
            .d-card    { background:#27201c !important; border-color:#443a30 !important; }
            .d-ink     { color:#f2e1ca !important; }
            .d-soft    { color:#a49b90 !important; }
            .d-muted   { color:#8b8279 !important; }
            .d-accent  { color:#dbb594 !important; }
            .d-accent2 { color:#b88c67 !important; }
            .d-divider { border-color:#443a30 !important; }
          }
          /* Outlook.com dark mode */
          [data-ogsc] .d-bg      { background:#17120e !important; }
          [data-ogsc] .d-card    { background:#27201c !important; border-color:#443a30 !important; }
          [data-ogsc] .d-ink     { color:#f2e1ca !important; }
          [data-ogsc] .d-soft    { color:#a49b90 !important; }
          [data-ogsc] .d-muted   { color:#8b8279 !important; }
          [data-ogsc] .d-accent  { color:#dbb594 !important; }
          [data-ogsc] .d-accent2 { color:#b88c67 !important; }
          [data-ogsc] .d-divider { border-color:#443a30 !important; }

          @media only screen and (max-width:620px) {
            .container { width:100% !important; }${extraCss}
          }
        `}</style>
    </Head>
  );
}

/* ------------------------------------------------------------------ */
/* Header — logo + "Standard Digest" wordmark, optional right-aligned   */
/* label (the digest uses it for the week; welcome omits it).           */
/* ------------------------------------------------------------------ */

export function EmailHeader({
  logoUrl,
  rightLabel,
}: {
  logoUrl: string;
  rightLabel?: string;
}) {
  return (
    <>
      <Section style={{ padding: "4px 34px 0" }}>
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
                        <Img
                          src={logoUrl}
                          width={34}
                          height={34}
                          alt="Standard Digest"
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: "8px",
                            display: "block",
                          }}
                        />
                      </td>
                      <td
                        style={{
                          verticalAlign: "middle",
                          paddingLeft: "11px",
                          paddingTop: "2px",
                        }}
                      >
                        <span
                          className="d-ink"
                          style={{
                            fontFamily: serif,
                            fontWeight: 500,
                            fontSize: "23px",
                            letterSpacing: "-0.02em",
                            color: c.ink,
                          }}
                        >
                          Standard{" "}
                          <span
                            className="d-accent2"
                            style={{ color: c.solid2 }}
                          >
                            Digest
                          </span>
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
              {rightLabel ? (
                <td align="right" style={{ verticalAlign: "middle" }}>
                  <span
                    className="d-muted"
                    style={{
                      fontFamily: mono,
                      fontSize: "11px",
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      color: c.muted,
                    }}
                  >
                    {rightLabel}
                  </span>
                </td>
              ) : null}
            </tr>
          </tbody>
        </table>
      </Section>

      {/* ---- Header rule ---- */}
      <Section style={{ padding: "18px 34px 0" }}>
        <Hr
          className="d-divider"
          style={{
            borderColor: c.line,
            borderWidth: "1px 0 0",
            margin: 0,
            height: 0,
          }}
        />
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Footer — wordmark + optional unsubscribe link.                       */
/* ------------------------------------------------------------------ */

export function EmailFooter({
  logoUrl,
  unsubscribeUrl,
}: {
  logoUrl: string;
  unsubscribeUrl?: string;
}) {
  return (
    <>
      <Section style={{ padding: "36px 34px 8px" }}>
        <Hr
          className="d-divider"
          style={{
            borderColor: c.line,
            borderWidth: "1px 0 0",
            margin: 0,
            height: 0,
          }}
        />
      </Section>
      <Section style={{ padding: "20px 34px 4px", textAlign: "center" }}>
        <table
          role="presentation"
          cellPadding={0}
          cellSpacing={0}
          border={0}
          align="center"
        >
          <tbody>
            <tr>
              <td style={{ verticalAlign: "middle" }}>
                <Img
                  src={logoUrl}
                  width={22}
                  height={22}
                  alt="Standard Digest"
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "5px",
                    display: "block",
                  }}
                />
              </td>
              <td
                style={{
                  verticalAlign: "middle",
                  paddingLeft: "9px",
                }}
              >
                <span
                  className="d-ink"
                  style={{
                    fontFamily: serif,
                    fontWeight: 500,
                    fontSize: "16px",
                    letterSpacing: "-0.01em",
                    color: c.ink,
                  }}
                >
                  Standard{" "}
                  <span className="d-accent2" style={{ color: c.solid2 }}>
                    Digest
                  </span>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </Section>
      {unsubscribeUrl ? (
        <Section style={{ padding: "14px 40px 4px", textAlign: "center" }}>
          <Link
            href={unsubscribeUrl}
            className="d-soft"
            style={{
              fontFamily: sans,
              fontWeight: 600,
              fontSize: "12.5px",
              color: c.inkSoft,
            }}
          >
            Unsubscribe
          </Link>
        </Section>
      ) : null}
    </>
  );
}

/** Fixed-width outer shell every email shares (600px, centered, warm paper). */
export function EmailShell({ children }: { children: React.ReactNode }) {
  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      className="d-bg"
      style={{ background: c.page }}
    >
      <tbody>
        <tr>
          <td align="center" style={{ padding: "28px 12px 40px" }}>
            <Container
              className="container"
              style={{ width: "600px", maxWidth: "600px" }}
            >
              {children}
            </Container>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
