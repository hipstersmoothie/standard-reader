import type { Font } from "satori";
import satori from "satori";

import { initials } from "#/components/reader/format";
import {
  collectionFeatureLabel,
  plainTextFromMarkdown,
} from "#/lib/collections/og-meta";
import type { CollectionOgFontRoles } from "#/server/og/collection-fonts";
import { loadCollectionOgFonts } from "#/server/og/collection-fonts";
import { loadOgImage, loadPublicationIcon } from "#/server/og/load-image";
import { OG_HEIGHT, OG_WIDTH, renderOgPng } from "#/server/og/render-png";
import { ogSatoriOptions } from "#/server/og/satori-options";
import { truncateAtWord } from "#/server/og/text";
import type {
  PublicationThemeInput,
  QuoteOgColors,
} from "#/server/og/theme-colors";
import { resolveQuoteOgColors } from "#/server/og/theme-colors";

const ICON_SIZE = 64;

function mastheadFontSize(text: string): number {
  const length = text.length;
  if (length <= 14) return 112;
  if (length <= 22) return 96;
  if (length <= 32) return 80;
  if (length <= 44) return 68;
  return 56;
}

export interface CollectionOgInput extends PublicationThemeInput {
  name: string;
  publicationName: string | null;
  coverImageUrl: string | null;
  ownerHandle: string | null;
  ownerDisplayName: string | null;
  publicationIconUrl: string | null;
  publicationOwnerAvatarUrl: string | null;
  fontTitle: string | null;
  fontBody: string | null;
  featureCount: number;
}

function editorLine(input: CollectionOgInput): string | null {
  const displayName = input.ownerDisplayName?.trim();
  if (displayName) return displayName;
  const handle = input.ownerHandle?.trim();
  return handle ? `@${handle}` : null;
}

function featureBadgeLabel(count: number): string {
  return collectionFeatureLabel(count).toUpperCase();
}

function collectionOgMarkup(input: {
  data: CollectionOgInput;
  coverImage: string | null;
  publicationIcon: string | null;
  colors: QuoteOgColors;
  fonts: CollectionOgFontRoles;
}) {
  const { colors, fonts } = input;
  const name = truncateAtWord(input.data.name, 64);
  const publicationName =
    input.data.publicationName?.trim() || "Standard Reader";
  const pubLabel = truncateAtWord(publicationName, 48);
  const handle = input.data.ownerHandle?.trim();
  const editor = editorLine(input.data);
  const mastheadSize = mastheadFontSize(name);
  const mastheadLine = Math.round(mastheadSize * 0.94);
  const pubInitials = initials(publicationName);

  return (
    <div
      style={{
        backgroundColor: colors.background,
        color: colors.foreground,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        padding: "2.5rem 3.25rem 2.25rem",
        position: "relative",
        width: "100%",
      }}
    >
      {input.coverImage ? (
        <img
          alt=""
          src={input.coverImage}
          style={{
            height: "100%",
            left: 0,
            objectFit: "cover",
            opacity: 0.12,
            position: "absolute",
            top: 0,
            width: "100%",
          }}
        />
      ) : null}

      <div
        style={{
          alignItems: "center",
          borderBottomColor: colors.line,
          borderBottomStyle: "solid",
          borderBottomWidth: 1,
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          paddingBottom: "1.5rem",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          style={{
            alignItems: "center",
            display: "flex",
            flexDirection: "row",
            gap: "1.25rem",
          }}
        >
          {input.publicationIcon ? (
            <div
              style={{
                display: "flex",
                flexShrink: 0,
                height: ICON_SIZE,
                overflow: "hidden",
                width: ICON_SIZE,
              }}
            >
              <img
                alt=""
                height={ICON_SIZE}
                src={input.publicationIcon}
                style={{
                  height: ICON_SIZE,
                  objectFit: "cover",
                  width: ICON_SIZE,
                }}
                width={ICON_SIZE}
              />
            </div>
          ) : (
            <div
              style={{
                alignItems: "center",
                backgroundColor: colors.accent,
                color: colors.accentForeground,
                display: "flex",
                flexShrink: 0,
                fontFamily: fonts.sans,
                fontSize: 22,
                fontWeight: 700,
                height: ICON_SIZE,
                justifyContent: "center",
                width: ICON_SIZE,
              }}
            >
              {pubInitials}
            </div>
          )}

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.2rem",
            }}
          >
            <div
              style={{
                display: "flex",
                fontFamily: fonts.sans,
                fontSize: 32,
                fontWeight: 700,
                letterSpacing: -0.4,
              }}
            >
              {pubLabel}
            </div>
            {handle ? (
              <div
                style={{
                  color: colors.muted,
                  display: "flex",
                  fontFamily: fonts.sans,
                  fontSize: 22,
                  fontWeight: 400,
                }}
              >
                @{handle}
              </div>
            ) : null}
          </div>
        </div>

        <div
          style={{
            color: colors.accent,
            display: "flex",
            fontFamily: fonts.sans,
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: 2.2,
            textTransform: "uppercase",
          }}
        >
          New issue
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          gap: "1.25rem",
          justifyContent: "center",
          paddingBottom: "1rem",
          paddingTop: "1.5rem",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          style={{
            color: colors.accent,
            display: "flex",
            fontFamily: fonts.sans,
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: 2.2,
            textTransform: "uppercase",
          }}
        >
          Issue No. 1
        </div>
        <div
          style={{
            display: "flex",
            fontFamily: fonts.title,
            fontSize: mastheadSize,
            fontWeight: 700,
            letterSpacing: mastheadSize * -0.025,
            lineHeight: `${mastheadLine}px`,
            maxWidth: 980,
          }}
        >
          {name}
        </div>
      </div>

      <div
        style={{
          alignItems: "flex-end",
          borderTopColor: colors.line,
          borderTopStyle: "solid",
          borderTopWidth: 1,
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          paddingTop: "1.5rem",
          position: "relative",
          zIndex: 1,
        }}
      >
        {editor ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.35rem",
            }}
          >
            <div
              style={{
                color: colors.muted,
                display: "flex",
                fontFamily: fonts.sans,
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              Edited by
            </div>
            <div
              style={{
                display: "flex",
                fontFamily: fonts.sans,
                fontSize: 36,
                fontWeight: 700,
                letterSpacing: -0.4,
              }}
            >
              {editor}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex" }} />
        )}

        <div
          style={{
            backgroundColor: colors.accent,
            color: colors.accentForeground,
            display: "flex",
            fontFamily: fonts.sans,
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 1.6,
            paddingBottom: "0.75rem",
            paddingLeft: "1.15rem",
            paddingRight: "1.15rem",
            paddingTop: "0.75rem",
            textTransform: "uppercase",
          }}
        >
          {featureBadgeLabel(input.data.featureCount)}
        </div>
      </div>
    </div>
  );
}

export function collectionOgCardDescription(input: {
  editorialBody: string | null;
  documentDescription: string | null;
}): string | null {
  const editorial = input.editorialBody?.trim();
  if (editorial) {
    return truncateAtWord(plainTextFromMarkdown(editorial), 180);
  }
  const description = input.documentDescription?.trim();
  return description ? truncateAtWord(description, 180) : null;
}

export async function renderCollectionOgImage(
  input: CollectionOgInput,
): Promise<Uint8Array> {
  const colors = resolveQuoteOgColors(input);
  const [{ roles, fonts }, coverImage, publicationIcon] = await Promise.all([
    loadCollectionOgFonts({
      fontTitle: input.fontTitle,
      fontBody: input.fontBody,
    }),
    loadOgImage(input.coverImageUrl),
    loadPublicationIcon(
      input.publicationIconUrl,
      input.publicationOwnerAvatarUrl,
    ),
  ]);

  const svg = await satori(
    collectionOgMarkup({
      data: input,
      coverImage,
      publicationIcon,
      colors,
      fonts: roles,
    }),
    ogSatoriOptions(fonts as Array<Font>, {
      width: OG_WIDTH,
      height: OG_HEIGHT,
    }),
  );

  return renderOgPng(svg);
}
