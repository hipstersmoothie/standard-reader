import type {
  PublicationThemeInput,
  QuoteOgColors,
} from "#/server/og/theme-colors";
import type { Font } from "satori";

import { Resvg } from "@resvg/resvg-js";
import { initials } from "#/components/reader/format";
import { loadOgFonts } from "#/server/og/fonts";
import { loadOgImage, loadPublicationIcon } from "#/server/og/load-image";
import { truncateAtWord } from "#/server/og/text";
import { resolveQuoteOgColors } from "#/server/og/theme-colors";
import satori from "satori";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

/** Width of the cover-image panel when the article has one. */
const COVER_WIDTH = 420;

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatOgDate(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return DATE_FMT.format(new Date(t));
}

function titleFontSize(text: string, hasCover: boolean): number {
  const length = text.length;
  if (hasCover) {
    if (length <= 50) return 56;
    if (length <= 90) return 48;
    return 40;
  }
  if (length <= 50) return 72;
  if (length <= 90) return 60;
  if (length <= 130) return 52;
  return 44;
}

export interface ArticleOgInput extends PublicationThemeInput {
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  publishedAt: string | null;
  readingMinutes: number | null;
  publicationName: string | null;
  publicationOwnerHandle: string | null;
  publicationIconUrl: string | null;
  publicationOwnerAvatarUrl: string | null;
}

function metaLine(input: ArticleOgInput): string | null {
  const parts: Array<string> = [];
  const date = formatOgDate(input.publishedAt);
  if (date) parts.push(date);
  if (input.readingMinutes) parts.push(`${input.readingMinutes} min read`);
  return parts.length > 0 ? parts.join("  ·  ") : null;
}

function publicationFooter(input: {
  publicationName: string;
  handle: string | null;
  publicationIcon: string | null;
  meta: string | null;
  colors: QuoteOgColors;
}) {
  const { colors } = input;
  return (
    <div
      style={{
        alignItems: "center",
        borderTopColor: colors.line,
        borderTopStyle: "solid",
        borderTopWidth: 1,
        display: "flex",
        flexDirection: "row",
        gap: "1.25rem",
        paddingTop: "1.5rem",
      }}
    >
      {input.publicationIcon ? (
        <img
          alt=""
          height={56}
          src={input.publicationIcon}
          style={{
            borderRadius: 9,
            flexShrink: 0,
            height: 56,
            objectFit: "cover",
            width: 56,
          }}
          width={56}
        />
      ) : (
        <div
          style={{
            alignItems: "center",
            backgroundColor: colors.accent,
            borderRadius: 9,
            color: colors.accentForeground,
            display: "flex",
            flexShrink: 0,
            fontFamily: "Newsreader",
            fontSize: 24,
            fontWeight: 600,
            height: 56,
            justifyContent: "center",
            width: 56,
          }}
        >
          {initials(input.publicationName)}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
        <div
          style={{
            display: "flex",
            fontFamily: "Newsreader",
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: -0.26,
            lineHeight: "29px",
          }}
        >
          {input.publicationName}
        </div>
        {input.handle ? (
          <div
            style={{
              color: colors.muted,
              display: "flex",
              fontFamily: "Archivo",
              fontSize: 18,
              fontWeight: 400,
              lineHeight: "21px",
              marginTop: "0.125rem",
            }}
          >
            @{input.handle}
          </div>
        ) : null}
      </div>

      {input.meta ? (
        <div
          style={{
            color: colors.muted,
            display: "flex",
            flexShrink: 0,
            fontFamily: "Archivo",
            fontSize: 19,
            fontWeight: 400,
            letterSpacing: 0.3,
          }}
        >
          {input.meta}
        </div>
      ) : null}
    </div>
  );
}

function articleOgMarkup(input: {
  data: ArticleOgInput;
  publicationIcon: string | null;
  coverImage: string | null;
  colors: QuoteOgColors;
}) {
  const { colors, coverImage } = input;
  const title = truncateAtWord(input.data.title, 160);
  const description = input.data.description?.trim()
    ? truncateAtWord(input.data.description, coverImage ? 130 : 170)
    : null;
  const publicationName =
    input.data.publicationName?.trim() || "Standard Reader";
  const handle = input.data.publicationOwnerHandle?.trim() || null;
  const fontSize = titleFontSize(title, Boolean(coverImage));
  const lineHeight = Math.round(fontSize * 1.08);
  const meta = metaLine(input.data);

  const content = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        padding: "3.5rem 4rem 3rem",
        width: coverImage ? OG_WIDTH - COVER_WIDTH : OG_WIDTH,
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
        {truncateAtWord(publicationName, 48)}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          gap: "1.5rem",
          justifyContent: "center",
          paddingBottom: "1.75rem",
          paddingTop: "1.75rem",
        }}
      >
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
          {title}
        </div>
        {description ? (
          <div
            style={{
              color: colors.muted,
              display: "flex",
              fontFamily: "Newsreader",
              fontSize: coverImage ? 26 : 30,
              fontWeight: 400,
              lineHeight: coverImage ? "34px" : "40px",
              maxWidth: 880,
            }}
          >
            {description}
          </div>
        ) : null}
      </div>

      {publicationFooter({
        publicationName,
        handle,
        publicationIcon: input.publicationIcon,
        meta,
        colors,
      })}
    </div>
  );

  return (
    <div
      style={{
        backgroundColor: colors.background,
        color: colors.foreground,
        display: "flex",
        flexDirection: "row",
        fontFamily: "Newsreader",
        height: "100%",
        width: "100%",
      }}
    >
      {content}
      {coverImage ? (
        <div
          style={{
            borderLeftColor: colors.line,
            borderLeftStyle: "solid",
            borderLeftWidth: 1,
            display: "flex",
            flexShrink: 0,
            height: OG_HEIGHT,
            width: COVER_WIDTH,
          }}
        >
          <img
            alt=""
            height={OG_HEIGHT}
            src={coverImage}
            style={{
              height: OG_HEIGHT,
              objectFit: "cover",
              width: COVER_WIDTH,
            }}
            width={COVER_WIDTH}
          />
        </div>
      ) : null}
    </div>
  );
}

export async function renderArticleOgImage(
  input: ArticleOgInput,
): Promise<Uint8Array> {
  const colors = resolveQuoteOgColors(input);
  const [fonts, publicationIcon, coverImage] = await Promise.all([
    loadOgFonts(),
    loadPublicationIcon(
      input.publicationIconUrl,
      input.publicationOwnerAvatarUrl,
    ),
    loadOgImage(input.coverImageUrl),
  ]);

  const svg = await satori(
    articleOgMarkup({ data: input, publicationIcon, coverImage, colors }),
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
