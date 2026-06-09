import type {
  PublicationThemeInput,
  QuoteOgColors,
} from "#/server/og/theme-colors";
import type { Font } from "satori";

import { Resvg } from "@resvg/resvg-js";
import { formatReaders, initials } from "#/components/reader/format";
import { SITE_NAME } from "#/lib/site-metadata";
import { loadOgFonts } from "#/server/og/fonts";
import { loadPublicationIcon } from "#/server/og/load-image";
import { truncateAtWord } from "#/server/og/text";
import { resolveQuoteOgColors } from "#/server/og/theme-colors";
import satori from "satori";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

function nameFontSize(text: string): number {
  const length = text.length;
  if (length <= 18) return 88;
  if (length <= 30) return 72;
  if (length <= 48) return 60;
  return 50;
}

export interface PublicationOgInput extends PublicationThemeInput {
  name: string;
  description: string | null;
  topic: string | null;
  ownerHandle: string | null;
  iconUrl: string | null;
  ownerAvatarUrl: string | null;
  subscriberCount: number;
  documentCount: number;
}

function statsLine(input: PublicationOgInput): string | null {
  const parts: Array<string> = [];
  if (input.subscriberCount > 0) {
    parts.push(
      `${formatReaders(input.subscriberCount)} ${
        input.subscriberCount === 1 ? "reader" : "readers"
      }`,
    );
  }
  if (input.documentCount > 0) {
    parts.push(
      `${input.documentCount} ${input.documentCount === 1 ? "post" : "posts"}`,
    );
  }
  return parts.length > 0 ? parts.join("  ·  ") : null;
}

function publicationOgMarkup(input: {
  data: PublicationOgInput;
  publicationIcon: string | null;
  colors: QuoteOgColors;
}) {
  const { colors } = input;
  const name = truncateAtWord(input.data.name, 64);
  const description = input.data.description?.trim()
    ? truncateAtWord(input.data.description, 150)
    : null;
  const kicker = input.data.topic?.trim() || "Publication";
  const handle = input.data.ownerHandle?.trim() || null;
  const stats = statsLine(input.data);
  const fontSize = nameFontSize(name);
  const lineHeight = Math.round(fontSize * 1.04);

  return (
    <div
      style={{
        backgroundColor: colors.background,
        color: colors.foreground,
        display: "flex",
        flexDirection: "column",
        fontFamily: "Newsreader",
        height: "100%",
        padding: "3.5rem 4rem 3rem",
        width: "100%",
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          flexDirection: "row",
          flexGrow: 1,
          gap: "3rem",
        }}
      >
        {input.publicationIcon ? (
          <img
            alt=""
            height={168}
            src={input.publicationIcon}
            style={{
              borderRadius: 24,
              flexShrink: 0,
              height: 168,
              objectFit: "cover",
              width: 168,
            }}
            width={168}
          />
        ) : (
          <div
            style={{
              alignItems: "center",
              backgroundColor: colors.accent,
              borderRadius: 24,
              color: colors.accentForeground,
              display: "flex",
              flexShrink: 0,
              fontFamily: "Newsreader",
              fontSize: 68,
              fontWeight: 600,
              height: 168,
              justifyContent: "center",
              width: 168,
            }}
          >
            {initials(name)}
          </div>
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            gap: "1.25rem",
          }}
        >
          <div
            style={{
              color: colors.accent,
              display: "flex",
              fontFamily: "Archivo",
              fontSize: 21,
              fontWeight: 400,
              letterSpacing: 2.4,
              textTransform: "uppercase",
            }}
          >
            {truncateAtWord(kicker, 40)}
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "Newsreader",
              fontSize,
              fontWeight: 600,
              letterSpacing: fontSize * -0.018,
              lineHeight: `${lineHeight}px`,
            }}
          >
            {name}
          </div>
          {description ? (
            <div
              style={{
                color: colors.muted,
                display: "flex",
                fontFamily: "Newsreader",
                fontSize: 31,
                fontWeight: 400,
                lineHeight: "41px",
                maxWidth: 800,
              }}
            >
              {description}
            </div>
          ) : null}
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
          gap: "1.5rem",
          paddingTop: "1.5rem",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            flexGrow: 1,
            gap: "1.5rem",
          }}
        >
          {handle ? (
            <div
              style={{
                color: colors.foreground,
                display: "flex",
                fontFamily: "Archivo",
                fontSize: 21,
                fontWeight: 400,
              }}
            >
              @{handle}
            </div>
          ) : null}
          {stats ? (
            <div
              style={{
                color: colors.muted,
                display: "flex",
                fontFamily: "Archivo",
                fontSize: 21,
                fontWeight: 400,
              }}
            >
              {stats}
            </div>
          ) : null}
        </div>

        <div
          style={{
            color: colors.muted,
            display: "flex",
            flexShrink: 0,
            fontFamily: "Archivo",
            fontSize: 18,
            fontWeight: 400,
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          {SITE_NAME}
        </div>
      </div>
    </div>
  );
}

export async function renderPublicationOgImage(
  input: PublicationOgInput,
): Promise<Uint8Array> {
  const colors = resolveQuoteOgColors(input);
  const [fonts, publicationIcon] = await Promise.all([
    loadOgFonts(),
    loadPublicationIcon(input.iconUrl, input.ownerAvatarUrl),
  ]);

  const svg = await satori(
    publicationOgMarkup({ data: input, publicationIcon, colors }),
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
