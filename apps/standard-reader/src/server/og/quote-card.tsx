import type { Font } from "satori";
import satori from "satori";

import { initials } from "#/components/reader/format";
import { truncateQuoteForDisplay } from "#/lib/quote-share";
import { loadOgFonts } from "#/server/og/fonts";
import { loadPublicationIcon } from "#/server/og/load-image";
import { renderOgPng } from "#/server/og/render-png";
import { ogSatoriOptions } from "#/server/og/satori-options";
import type {
  PublicationThemeInput,
  QuoteOgColors,
} from "#/server/og/theme-colors";
import { resolveQuoteOgColors } from "#/server/og/theme-colors";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

/** Literal spacing for satori — StyleX vars resolve to `initial` outside stylex.props(). */
const ogSpacing = {
  "0.5": "0.125rem",
  "1": "0.25rem",
  "5": "1.25rem",
  "6": "1.5rem",
  "7": "1.75rem",
  "14": "3.5rem",
  "16": "4rem",
} as const;

function quoteFontSize(text: string): number {
  const length = text.length;
  if (length <= 90) return 60;
  if (length <= 140) return 52;
  if (length <= 220) return 44;
  return 36;
}

function quoteGlyph(accent: string) {
  return (
    <svg aria-hidden="true" height={74} viewBox="0 0 100 80" width={92}>
      <path
        d="M0 80V44C0 18 14 3 38 0l3 12C26 16 19 25 19 38h17v42H0Zm59 0V44C59 18 73 3 97 0l3 12C85 16 78 25 78 38h17v42H59Z"
        fill={accent}
      />
    </svg>
  );
}

function quoteOgMarkup(input: {
  quote: string;
  publicationName: string | null;
  publicationDescription: string | null;
  publicationOwnerHandle: string | null;
  publicationIcon: string | null;
  colors: QuoteOgColors;
}) {
  const { colors } = input;
  const displayQuote = truncateQuoteForDisplay(input.quote, 260);
  const fontSize = quoteFontSize(displayQuote);
  const lineHeight = Math.round(fontSize * 1.16);
  const letterSpacing = fontSize * -0.015;
  const publicationName = input.publicationName?.trim() || "Standard Reader";
  const tagline = input.publicationDescription?.trim() || null;
  const handle = input.publicationOwnerHandle?.trim() || null;

  return (
    <div
      style={{
        backgroundColor: colors.background,
        color: colors.foreground,
        display: "flex",
        flexDirection: "column",
        fontFamily: "Newsreader",
        height: "100%",
        padding: `${ogSpacing["14"]} ${ogSpacing["16"]}`,
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          justifyContent: "center",
          paddingBottom: ogSpacing["7"],
          paddingTop: ogSpacing["7"],
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              marginBottom: ogSpacing["5"],
            }}
          >
            {quoteGlyph(colors.accent)}
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "Newsreader",
              fontSize,
              fontStyle: "italic",
              fontWeight: 500,
              letterSpacing,
              lineHeight: `${lineHeight}px`,
              margin: 0,
            }}
          >
            {displayQuote}
          </div>
        </div>
      </div>

      <div
        style={{
          alignItems: "center",
          borderTopColor: colors.line,
          borderTopStyle: "solid",
          borderTopWidth: 1,
          display: "flex",
          flexDirection: "row",
          gap: ogSpacing["5"],
          paddingTop: ogSpacing["6"],
        }}
      >
        {input.publicationIcon ? (
          <div
            style={{
              borderColor: colors.line,
              borderRadius: 10,
              borderStyle: "solid",
              borderWidth: 1.5,
              display: "flex",
              flexShrink: 0,
              overflow: "hidden",
            }}
          >
            <img
              alt=""
              height={64}
              src={input.publicationIcon}
              style={{
                height: 64,
                objectFit: "cover",
                width: 64,
              }}
              width={64}
            />
          </div>
        ) : (
          <div
            style={{
              alignItems: "center",
              backgroundColor: colors.accent,
              borderRadius: 10,
              color: colors.accentForeground,
              display: "flex",
              flexShrink: 0,
              fontFamily: "Newsreader",
              fontSize: 27,
              fontWeight: 600,
              height: 64,
              justifyContent: "center",
              width: 64,
            }}
          >
            {initials(publicationName)}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
          <div
            style={{
              display: "flex",
              fontFamily: "Newsreader",
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: -0.28,
              lineHeight: "31px",
            }}
          >
            {publicationName}
          </div>
          {handle ? (
            <div
              style={{
                color: colors.muted,
                display: "flex",
                fontFamily: "Atkinson Hyperlegible Next",
                fontSize: 19,
                fontWeight: 400,
                lineHeight: "22px",
                marginTop: ogSpacing["0.5"],
              }}
            >
              @{handle}
            </div>
          ) : null}
          {tagline ? (
            <div
              style={{
                color: colors.muted,
                display: "flex",
                fontFamily: "Newsreader",
                fontSize: 21,
                fontWeight: 400,
                lineHeight: "22px",
                marginTop: ogSpacing["1"],
                maxWidth: 620,
              }}
            >
              {tagline}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export async function renderQuoteOgImage(
  input: {
    quote: string;
    publicationName: string | null;
    publicationDescription: string | null;
    publicationOwnerHandle: string | null;
    publicationIconUrl: string | null;
    publicationOwnerAvatarUrl: string | null;
  } & PublicationThemeInput,
): Promise<Uint8Array> {
  const colors = resolveQuoteOgColors(input);
  const [fonts, publicationIcon] = await Promise.all([
    loadOgFonts(),
    loadPublicationIcon(
      input.publicationIconUrl,
      input.publicationOwnerAvatarUrl,
    ),
  ]);
  const svg = await satori(
    quoteOgMarkup({ ...input, publicationIcon, colors }),
    ogSatoriOptions(fonts as Array<Font>, {
      width: OG_WIDTH,
      height: OG_HEIGHT,
    }),
  );

  return renderOgPng(svg);
}
