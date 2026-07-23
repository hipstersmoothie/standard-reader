import {
  Button,
  Heading,
  Hr,
  Img,
  Link,
  Section,
  Text,
} from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";

import type { RendererComponentsInput } from "@standard-reader/renderer-react";

/**
 * Email-safe styling for the rendered document body. React Email primitives +
 * inline styles (email clients ignore stylesheets). Neutral, readable defaults;
 * the surrounding template supplies the page chrome.
 */
const INK = "#292524";
const MUTED = "#78716c";
const ACCENT = "#b45309";
const RULE = "#e7e2dd";
const CODE_BG = "#f4f1ec";

const paragraph: CSSProperties = {
  fontSize: "17px",
  lineHeight: "1.6",
  color: INK,
  margin: "0 0 16px",
};
const listStyle: CSSProperties = {
  fontSize: "17px",
  lineHeight: "1.6",
  color: INK,
  margin: "0 0 16px",
  paddingLeft: "24px",
};
const listItem: CSSProperties = { margin: "0 0 6px" };
const caption: CSSProperties = {
  fontSize: "13px",
  color: MUTED,
  margin: "6px 0 16px",
  textAlign: "center",
};
const codeInline: CSSProperties = {
  fontFamily: "Menlo, Consolas, monospace",
  fontSize: "14px",
  background: CODE_BG,
  padding: "1px 5px",
  borderRadius: "4px",
};
const preBlock: CSSProperties = {
  fontFamily: "Menlo, Consolas, monospace",
  fontSize: "14px",
  lineHeight: "1.5",
  background: CODE_BG,
  color: INK,
  padding: "14px 16px",
  borderRadius: "8px",
  overflowX: "auto",
  margin: "0 0 16px",
  whiteSpace: "pre-wrap",
};

function headingStyle(level: number): CSSProperties {
  const size = [30, 26, 22, 19, 17, 16][Math.min(Math.max(level, 1), 6) - 1];
  return {
    fontSize: `${size}px`,
    lineHeight: "1.3",
    fontWeight: 600,
    color: INK,
    margin: level <= 2 ? "28px 0 12px" : "22px 0 8px",
  };
}

function bskyUrl(postUri: string): string {
  const m = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/(.+)$/.exec(postUri);
  return m ? `https://bsky.app/profile/${m[1]}/post/${m[2]}` : postUri;
}

function ImageWithCaption({
  src,
  alt,
  captionText,
}: {
  src: string;
  alt: string;
  captionText?: string;
}) {
  return (
    <>
      <Img
        src={src}
        alt={alt}
        style={{
          width: "100%",
          maxWidth: "100%",
          height: "auto",
          borderRadius: "8px",
          margin: "0 0 4px",
        }}
      />
      {captionText ? <Text style={caption}>{captionText}</Text> : null}
    </>
  );
}

/**
 * React Email component set for `@standard-reader/renderer-react`. Pass as the
 * `components` prop to StandardDocumentRenderer (or use DocumentEmailBody).
 * Overrides the shared block + inline vocabulary; interactive platform embeds
 * (Leaflet polls, pckt galleries, …) fall back to the renderer's inert defaults.
 */
export const emailComponents: RendererComponentsInput = {
  shared: {
    // Structure
    Root: ({ children }: { children: ReactNode }) => <>{children}</>,
    Paragraph: ({ children }: { children: ReactNode }) => (
      <Text style={paragraph}>{children}</Text>
    ),
    Heading: ({ level, children }: { level: number; children: ReactNode }) => (
      <Heading
        as={`h${Math.min(Math.max(level, 1), 6)}` as "h1"}
        style={headingStyle(level)}
      >
        {children}
      </Heading>
    ),
    Blockquote: ({ children }: { children: ReactNode }) => (
      <Section
        style={{
          borderLeft: `3px solid ${RULE}`,
          paddingLeft: "16px",
          margin: "0 0 16px",
          color: MUTED,
          fontStyle: "italic",
        }}
      >
        {children}
      </Section>
    ),
    Callout: ({
      emoji,
      children,
    }: {
      emoji?: string;
      children: ReactNode;
    }) => (
      <Section
        style={{
          background: CODE_BG,
          borderRadius: "8px",
          padding: "12px 16px",
          margin: "0 0 16px",
        }}
      >
        {emoji ? <Text style={{ ...paragraph, margin: 0 }}>{emoji}</Text> : null}
        {children}
      </Section>
    ),
    HorizontalRule: () => (
      <Hr style={{ borderColor: RULE, margin: "24px 0" }} />
    ),

    // Lists (plain HTML — email-safe)
    BulletList: ({ children }: { children: ReactNode }) => (
      <ul style={listStyle}>{children}</ul>
    ),
    OrderedList: ({
      start,
      children,
    }: {
      start?: number;
      children: ReactNode;
    }) => (
      <ol start={start} style={listStyle}>
        {children}
      </ol>
    ),
    ListItem: ({ children }: { children: ReactNode }) => (
      <li style={listItem}>{children}</li>
    ),
    TaskList: ({ children }: { children: ReactNode }) => (
      <ul style={{ ...listStyle, listStyle: "none", paddingLeft: "8px" }}>
        {children}
      </ul>
    ),
    TaskListItem: ({
      checked,
      children,
    }: {
      checked?: boolean;
      children: ReactNode;
    }) => (
      <li style={listItem}>
        {checked ? "☑" : "☐"} {children}
      </li>
    ),

    // Code
    Code: ({ code }: { code: string }) => (
      <pre style={preBlock}>
        <code>{code}</code>
      </pre>
    ),

    // Media
    Image: ({
      src,
      alt,
      caption: cap,
    }: {
      src: string;
      alt: string;
      caption?: string;
    }) => <ImageWithCaption src={src} alt={alt} captionText={cap} />,
    Iframe: ({ url }: { url: string }) => (
      <Text style={paragraph}>
        <Link href={url} style={{ color: ACCENT }}>
          View embedded content →
        </Link>
      </Text>
    ),
    Website: ({
      src,
      title,
      description,
      previewImage,
    }: {
      src: string;
      title?: string;
      description?: string;
      previewImage?: string;
    }) => (
      <Section
        style={{
          border: `1px solid ${RULE}`,
          borderRadius: "8px",
          overflow: "hidden",
          margin: "0 0 16px",
        }}
      >
        <Link href={src} style={{ color: INK, textDecoration: "none" }}>
          {previewImage ? (
            <Img
              src={previewImage}
              alt={title ?? ""}
              style={{ width: "100%", height: "auto" }}
            />
          ) : null}
          <Text style={{ ...paragraph, fontWeight: 600, margin: "12px 16px 4px" }}>
            {title ?? src}
          </Text>
          {description ? (
            <Text style={{ ...caption, textAlign: "left", margin: "0 16px 12px" }}>
              {description}
            </Text>
          ) : null}
        </Link>
      </Section>
    ),

    // Table (plain HTML)
    Table: ({
      rows,
    }: {
      rows: Array<Array<{ header: boolean; children: ReactNode }>>;
    }) => (
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          margin: "0 0 16px",
          fontSize: "15px",
          color: INK,
        }}
      >
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => {
                const cs: CSSProperties = {
                  border: `1px solid ${RULE}`,
                  padding: "8px 10px",
                  textAlign: "left",
                  fontWeight: cell.header ? 600 : 400,
                  background: cell.header ? CODE_BG : "transparent",
                };
                return cell.header ? (
                  <th key={c} scope="col" style={cs}>
                    {cell.children}
                  </th>
                ) : (
                  <td key={c} style={cs}>
                    {cell.children}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    ),

    Math: ({ tex }: { tex: string }) => (
      <Text style={{ ...paragraph, ...codeInline, display: "block" }}>{tex}</Text>
    ),
    Button: ({ text, href }: { text: string; href: string }) => (
      <Button
        href={href}
        style={{
          background: ACCENT,
          color: "#ffffff",
          borderRadius: "8px",
          padding: "10px 18px",
          fontSize: "15px",
          textDecoration: "none",
          display: "inline-block",
          margin: "0 0 16px",
        }}
      >
        {text}
      </Button>
    ),
    BlueskyEmbed: ({ postUri }: { postUri: string }) => (
      <Text style={paragraph}>
        <Link href={bskyUrl(postUri)} style={{ color: ACCENT }}>
          View post on Bluesky →
        </Link>
      </Text>
    ),
    ImageGrid: ({
      images,
      caption: cap,
    }: {
      images: Array<{ src: string; alt: string }>;
      caption?: string;
    }) => (
      <>
        {images.map((img, i) => (
          <Img
            key={i}
            src={img.src}
            alt={img.alt}
            style={{
              width: "100%",
              height: "auto",
              borderRadius: "8px",
              margin: "0 0 8px",
            }}
          />
        ))}
        {cap ? <Text style={caption}>{cap}</Text> : null}
      </>
    ),
    ImageCarousel: ({
      images,
      caption: cap,
    }: {
      images: Array<{ src: string; alt: string }>;
      caption?: string;
    }) => (
      <>
        {images.map((img, i) => (
          <Img
            key={i}
            src={img.src}
            alt={img.alt}
            style={{
              width: "100%",
              height: "auto",
              borderRadius: "8px",
              margin: "0 0 8px",
            }}
          />
        ))}
        {cap ? <Text style={caption}>{cap}</Text> : null}
      </>
    ),
    ImageDiff: ({
      before,
      after,
      caption: cap,
    }: {
      before: { src: string; alt: string };
      after: { src: string; alt: string };
      caption?: string;
    }) => (
      <>
        <ImageWithCaption src={before.src} alt={before.alt} />
        <ImageWithCaption src={after.src} alt={after.alt} />
        {cap ? <Text style={caption}>{cap}</Text> : null}
      </>
    ),

    // Footnotes
    Footnotes: ({ children }: { children: ReactNode }) => (
      <Section style={{ margin: "24px 0 0" }}>
        <Hr style={{ borderColor: RULE, margin: "0 0 12px" }} />
        <ol style={{ ...listStyle, fontSize: "14px", color: MUTED }}>
          {children}
        </ol>
      </Section>
    ),
    FootnoteItem: ({
      id,
      children,
    }: {
      id: string;
      children: ReactNode;
    }) => (
      <li id={`fn-${id}`} style={listItem}>
        {children}
      </li>
    ),
    Unknown: () => null,

    // Inline marks that benefit from email-specific styling. Strong / Emphasis /
    // Underline / Strikethrough / Mention / FootnoteReference keep the renderer's
    // semantic-HTML defaults (already email-safe).
    Link: ({ href, children }: { href: string; children: ReactNode }) => (
      <Link href={href} style={{ color: ACCENT, textDecoration: "underline" }}>
        {children}
      </Link>
    ),
    InlineCode: ({ children }: { children: ReactNode }) => (
      <code style={codeInline}>{children}</code>
    ),
    Highlight: ({ children }: { children: ReactNode }) => (
      <span style={{ background: "#fef3c7" }}>{children}</span>
    ),
  },
};
