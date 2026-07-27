import type { Font } from "satori";
import satori from "satori";

import { initials } from "#/components/reader/format";
import { SITE_NAME } from "#/lib/site-metadata";
import { loadOgFonts } from "#/server/og/fonts";
import { loadPublicationIcon } from "#/server/og/load-image";
import { renderOgPng } from "#/server/og/render-png";
import { ogSatoriOptions } from "#/server/og/satori-options";
import { truncateAtWord } from "#/server/og/text";

import { SITE_OG_PALETTE } from "./site-palette";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

/** Member icons shown on the card (a "+N" bubble covers the rest). */
const MAX_MEMBER_ICONS = 6;

const colors = SITE_OG_PALETTE;

function nameFontSize(text: string): number {
  const length = text.length;
  if (length <= 18) return 84;
  if (length <= 30) return 68;
  if (length <= 48) return 56;
  return 48;
}

export interface ListOgMember {
  name: string;
  iconUrl: string | null;
  ownerAvatarUrl: string | null;
}

export interface ListOgInput {
  name: string;
  description: string | null;
  ownerHandle: string | null;
  publicationCount: number;
  /** First few member publications, in list order. */
  members: Array<ListOgMember>;
}

function memberBubble(content: React.ReactNode, options: { image?: string }) {
  return (
    <div
      style={{
        borderColor: colors.background,
        borderRadius: 9999,
        borderStyle: "solid",
        borderWidth: 4,
        display: "flex",
        flexShrink: 0,
        marginLeft: -24,
      }}
    >
      <div
        style={{
          alignItems: "center",
          backgroundColor: options.image ? colors.background : colors.accent,
          borderColor: colors.line,
          borderRadius: 9999,
          borderStyle: "solid",
          borderWidth: 2,
          color: colors.accentForeground,
          display: "flex",
          fontFamily: "Atkinson Hyperlegible Next",
          fontSize: 30,
          fontWeight: 400,
          height: 104,
          justifyContent: "center",
          overflow: "hidden",
          width: 104,
        }}
      >
        {content}
      </div>
    </div>
  );
}

function listOgMarkup(input: {
  data: ListOgInput;
  memberIcons: Array<string | null>;
}) {
  const name = truncateAtWord(input.data.name, 64);
  const description = input.data.description?.trim()
    ? truncateAtWord(input.data.description, 140)
    : null;
  const handle = input.data.ownerHandle?.trim() || null;
  const count = input.data.publicationCount;
  const countLabel = `${count} ${count === 1 ? "publication" : "publications"}`;
  const fontSize = nameFontSize(name);
  const lineHeight = Math.round(fontSize * 1.04);
  const overflow = count - input.data.members.length;

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
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          gap: "1.5rem",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            color: colors.accent,
            display: "flex",
            fontFamily: "Atkinson Hyperlegible Next",
            fontSize: 22,
            fontWeight: 400,
            letterSpacing: 2.4,
            textTransform: "uppercase",
          }}
        >
          Publication list
        </div>
        <div
          style={{
            display: "flex",
            fontFamily: "Newsreader",
            fontSize,
            fontWeight: 600,
            letterSpacing: fontSize * -0.018,
            lineHeight: `${lineHeight}px`,
            maxWidth: 1040,
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
              fontSize: 32,
              fontWeight: 400,
              lineHeight: "42px",
              maxWidth: 880,
            }}
          >
            {description}
          </div>
        ) : null}

        {input.data.members.length > 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              marginTop: "0.75rem",
              paddingLeft: 24,
            }}
          >
            {input.data.members.map((member, index) => {
              const icon = input.memberIcons[index];
              return memberBubble(
                icon ? (
                  <img
                    alt=""
                    height={104}
                    src={icon}
                    style={{ height: 104, objectFit: "cover", width: 104 }}
                    width={104}
                  />
                ) : (
                  initials(member.name)
                ),
                { image: icon ?? undefined },
              );
            })}
            {overflow > 0 ? memberBubble(`+${overflow}`, {}) : null}
          </div>
        ) : null}
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
              by @{handle}
            </div>
          ) : null}
          <div
            style={{
              color: colors.muted,
              display: "flex",
              fontFamily: "Atkinson Hyperlegible Next",
              fontSize: 21,
              fontWeight: 400,
            }}
          >
            {countLabel}
          </div>
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

export async function renderListOgImage(
  input: ListOgInput,
): Promise<Uint8Array> {
  const members = input.members.slice(0, MAX_MEMBER_ICONS);
  const [fonts, memberIcons] = await Promise.all([
    loadOgFonts(),
    Promise.all(
      members.map((member) =>
        loadPublicationIcon(member.iconUrl, member.ownerAvatarUrl),
      ),
    ),
  ]);

  const svg = await satori(
    listOgMarkup({ data: { ...input, members }, memberIcons }),
    ogSatoriOptions(fonts as Array<Font>, {
      width: OG_WIDTH,
      height: OG_HEIGHT,
    }),
  );

  return renderOgPng(svg);
}
