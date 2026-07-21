import type { Font } from "satori";
import satori from "satori";

import { formatReaders, initials } from "#/components/reader/format";
import { SITE_NAME } from "#/lib/site-metadata";
import { loadOgFonts } from "#/server/og/fonts";
import { loadOgImage } from "#/server/og/load-image";
import { OG_HEIGHT, OG_WIDTH, renderOgPng } from "#/server/og/render-png";
import { ogSatoriOptions } from "#/server/og/satori-options";
import { truncateAtWord } from "#/server/og/text";
import type { QuoteOgColors } from "#/server/og/theme-colors";
import { resolveQuoteOgColors } from "#/server/og/theme-colors";

export interface ProfileOgInput {
  displayName: string;
  handle: string | null;
  description: string | null;
  avatarUrl: string | null;
  publicationCount: number;
  documentCount: number;
  subscriberCount: number;
}

function nameFontSize(text: string): number {
  const length = text.length;
  if (length <= 18) return 88;
  if (length <= 30) return 72;
  if (length <= 48) return 60;
  return 50;
}

function statsLine(input: ProfileOgInput): string | null {
  const parts: Array<string> = [];
  if (input.publicationCount > 0) {
    parts.push(
      `${input.publicationCount} ${
        input.publicationCount === 1 ? "publication" : "publications"
      }`,
    );
  }
  if (input.documentCount > 0) {
    parts.push(
      `${input.documentCount} ${input.documentCount === 1 ? "post" : "posts"}`,
    );
  }
  if (input.subscriberCount > 0) {
    parts.push(
      `${formatReaders(input.subscriberCount)} ${
        input.subscriberCount === 1 ? "reader" : "readers"
      }`,
    );
  }
  return parts.length > 0 ? parts.join("  ·  ") : null;
}

function profileOgMarkup(input: {
  data: ProfileOgInput;
  avatar: string | null;
  colors: QuoteOgColors;
}) {
  const { colors } = input;
  const name = truncateAtWord(input.data.displayName, 64);
  const description = input.data.description?.trim()
    ? truncateAtWord(input.data.description, 150)
    : null;
  const handle = input.data.handle?.trim() || null;
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
        {input.avatar ? (
          <div
            style={{
              borderColor: colors.line,
              borderRadius: "50%",
              borderStyle: "solid",
              borderWidth: 2,
              display: "flex",
              flexShrink: 0,
              overflow: "hidden",
            }}
          >
            <img
              alt=""
              height={168}
              src={input.avatar}
              style={{
                height: 168,
                objectFit: "cover",
                width: 168,
              }}
              width={168}
            />
          </div>
        ) : (
          <div
            style={{
              alignItems: "center",
              backgroundColor: colors.accent,
              borderRadius: "50%",
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
              fontFamily: "Atkinson Hyperlegible Next",
              fontSize: 21,
              fontWeight: 400,
              letterSpacing: 2.4,
              textTransform: "uppercase",
            }}
          >
            Author
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
                fontFamily: "Atkinson Hyperlegible Next",
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
                fontFamily: "Atkinson Hyperlegible Next",
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
            fontFamily: "Atkinson Hyperlegible Next",
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

export async function renderProfileOgImage(
  input: ProfileOgInput,
): Promise<Uint8Array> {
  const colors = resolveQuoteOgColors({
    themeBackground: null,
    themeForeground: null,
    themeAccent: null,
    themeAccentForeground: null,
  });
  const [fonts, avatar] = await Promise.all([
    loadOgFonts(),
    loadOgImage(input.avatarUrl),
  ]);

  const svg = await satori(
    profileOgMarkup({ data: input, avatar, colors }),
    ogSatoriOptions(fonts as Array<Font>, {
      width: OG_WIDTH,
      height: OG_HEIGHT,
    }),
  );

  return renderOgPng(svg);
}
