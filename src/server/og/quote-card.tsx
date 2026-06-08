import type {
  PublicationThemeInput,
  QuoteOgColors,
} from "#/server/og/theme-colors";
import type { Font } from "satori";

import { Resvg } from "@resvg/resvg-js";
import { initials } from "#/components/reader/format";
import { spacing } from "#/design-system/theme/spacing.stylex";
import { truncateQuoteForDisplay } from "#/lib/quote-share";
import { loadOgFonts } from "#/server/og/fonts";
import { loadPublicationIcon } from "#/server/og/load-image";
import { resolveQuoteOgColors } from "#/server/og/theme-colors";
import satori from "satori";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

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
        padding: `${spacing["14"]} ${spacing["16"]}`,
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          justifyContent: "center",
          paddingBottom: spacing["7"],
          paddingTop: spacing["7"],
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
              marginBottom: spacing["5"],
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
          gap: spacing["5"],
          paddingTop: spacing["6"],
        }}
      >
        {input.publicationIcon ? (
          <img
            alt=""
            height={64}
            src={input.publicationIcon}
            style={{
              borderRadius: 10,
              flexShrink: 0,
              height: 64,
              objectFit: "cover",
              width: 64,
            }}
            width={64}
          />
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
                fontFamily: "Archivo",
                fontSize: 19,
                fontWeight: 400,
                lineHeight: "22px",
                marginTop: spacing["0.5"],
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
                marginTop: spacing["1"],
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
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      fonts: fonts as Array<Font>,
    },
  );

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: OG_WIDTH },
  });

  return resvg.render().asPng();
}
