import type { Font } from "satori";
import satori from "satori";

import { SITE_NAME, SITE_TAGLINE } from "#/lib/site-metadata";
import { loadOgFonts } from "#/server/og/fonts";
import { renderOgPng } from "#/server/og/render-png";
import { ogSatoriOptions } from "#/server/og/satori-options";

import { SITE_OG_PALETTE } from "./site-palette";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

const colors = SITE_OG_PALETTE;

function siteOgMarkup() {
  return (
    <div
      style={{
        backgroundColor: colors.background,
        color: colors.foreground,
        display: "flex",
        flexDirection: "column",
        fontFamily: "Newsreader",
        height: "100%",
        justifyContent: "center",
        padding: "4rem 5rem",
        width: "100%",
      }}
    >
      <div
        style={{
          borderLeftColor: colors.accent,
          borderLeftStyle: "solid",
          borderLeftWidth: 4,
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem",
          paddingLeft: "2.5rem",
        }}
      >
        <div
          style={{
            display: "flex",
            fontFamily: "Newsreader",
            fontSize: 88,
            fontWeight: 600,
            letterSpacing: -1.5,
            lineHeight: "92px",
          }}
        >
          {SITE_NAME}
        </div>
        <div
          style={{
            color: colors.muted,
            display: "flex",
            fontFamily: "Newsreader",
            fontSize: 34,
            fontWeight: 400,
            lineHeight: "44px",
            maxWidth: 760,
          }}
        >
          {SITE_TAGLINE}
        </div>
      </div>

      <div
        style={{
          borderTopColor: colors.line,
          borderTopStyle: "solid",
          borderTopWidth: 1,
          color: colors.muted,
          display: "flex",
          fontFamily: "Atkinson Hyperlegible Next",
          fontSize: 22,
          letterSpacing: 0.4,
          marginTop: "auto",
          paddingTop: "2rem",
          textTransform: "uppercase",
        }}
      >
        standard.site · Atmosphere
      </div>
    </div>
  );
}

export async function renderSiteOgImage(): Promise<Uint8Array> {
  const fonts = await loadOgFonts();
  const svg = await satori(
    siteOgMarkup(),
    ogSatoriOptions(fonts as Array<Font>, {
      width: OG_WIDTH,
      height: OG_HEIGHT,
    }),
  );

  return renderOgPng(svg);
}
