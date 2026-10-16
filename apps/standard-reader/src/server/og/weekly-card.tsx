import type { Font } from "satori";
import satori from "satori";

import { SITE_NAME } from "#/lib/site-metadata";
import { loadOgFonts } from "#/server/og/fonts";
import { renderOgPng } from "#/server/og/render-png";
import { ogSatoriOptions } from "#/server/og/satori-options";
import { truncateAtWord } from "#/server/og/text";

import { SITE_OG_PALETTE } from "./site-palette";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

/** Rows that fit under the headline at the row height below. */
const MAX_PICKS = 5;

const colors = SITE_OG_PALETTE;

export interface WeeklyOgPick {
  title: string;
  /** `@handle`, or the publication name when there is no handle. */
  byline: string | null;
}

export interface WeeklyOgInput {
  /** `2026-W42`. */
  periodKey: string;
  /** "Oct 9 – Oct 16, 2026". */
  dateRange: string;
  picks: Array<WeeklyOgPick>;
}

function pickRow(pick: WeeklyOgPick, rank: number) {
  return (
    <div
      key={rank}
      style={{
        alignItems: "baseline",
        display: "flex",
        flexDirection: "row",
        gap: "1.25rem",
      }}
    >
      <div
        style={{
          color: colors.accent,
          display: "flex",
          flexShrink: 0,
          fontFamily: "Newsreader",
          fontSize: 34,
          fontWeight: 600,
          justifyContent: "flex-end",
          width: 36,
        }}
      >
        {rank}
      </div>
      <div
        style={{
          alignItems: "baseline",
          display: "flex",
          flexDirection: "row",
          gap: "0.75rem",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            flexShrink: 1,
            fontFamily: "Newsreader",
            fontSize: 32,
            // Newsreader ships 500 only as italic in the OG font set.
            fontWeight: 400,
            letterSpacing: -0.4,
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          {truncateAtWord(pick.title, pick.byline ? 54 : 70)}
        </div>
        {pick.byline ? (
          <div
            style={{
              color: colors.muted,
              display: "flex",
              flexShrink: 0,
              fontFamily: "Atkinson Hyperlegible Next",
              fontSize: 20,
              fontWeight: 400,
            }}
          >
            {truncateAtWord(pick.byline, 28)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function weeklyOgMarkup(input: WeeklyOgInput) {
  const [year, week] = input.periodKey.split("-W");
  const picks = input.picks.slice(0, MAX_PICKS);

  return (
    <div
      style={{
        backgroundColor: colors.background,
        color: colors.foreground,
        display: "flex",
        flexDirection: "column",
        fontFamily: "Newsreader",
        height: "100%",
        padding: "3.25rem 4rem 2.75rem",
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.9rem",
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
          {`Weekly · Week ${Number(week)}, ${year}`}
        </div>
        <div
          style={{
            display: "flex",
            fontFamily: "Newsreader",
            fontSize: 68,
            fontWeight: 600,
            letterSpacing: -1.2,
            lineHeight: "72px",
          }}
        >
          The week&apos;s hottest reads
        </div>
      </div>

      <div
        style={{
          borderTopColor: colors.line,
          borderTopStyle: "solid",
          borderTopWidth: 1,
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          gap: "0.85rem",
          justifyContent: "center",
          marginTop: "1.75rem",
          paddingTop: "1.25rem",
        }}
      >
        {picks.map((pick, i) => pickRow(pick, i + 1))}
      </div>

      <div
        style={{
          alignItems: "center",
          borderTopColor: colors.line,
          borderTopStyle: "solid",
          borderTopWidth: 1,
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          paddingTop: "1.25rem",
        }}
      >
        <div
          style={{
            color: colors.muted,
            display: "flex",
            fontFamily: "Atkinson Hyperlegible Next",
            fontSize: 20,
            fontWeight: 400,
          }}
        >
          {input.dateRange}
        </div>
        <div
          style={{
            color: colors.muted,
            display: "flex",
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

export async function renderWeeklyOgImage(
  input: WeeklyOgInput,
): Promise<Uint8Array> {
  const fonts = await loadOgFonts();
  const svg = await satori(
    weeklyOgMarkup(input),
    ogSatoriOptions(fonts as Array<Font>, {
      width: OG_WIDTH,
      height: OG_HEIGHT,
    }),
  );
  return renderOgPng(svg);
}
