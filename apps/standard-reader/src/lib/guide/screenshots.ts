/**
 * Every screenshot used by the reader guide, declared once.
 *
 * This list is the single source of truth for two consumers:
 *
 * 1. **The capture run** (`screenshots/capture.spec.ts`, driven by
 *    `pnpm guide:shots`) walks each entry in a real browser and writes
 *    `public/guide/<id>.png` (plus `<id>--dark.png` for entries that ask for
 *    the dark scheme).
 * 2. **The guide pages** render them through `<GuideFigure shot="…">`, which
 *    reads the declared viewport as the image's intrinsic size so a page does
 *    not reflow while its pictures load.
 *
 * Adding a picture to the guide is therefore: add an entry here, run
 * `pnpm guide:shots`, and reference the id from a guide page. Re-running the
 * capture after a UI change refreshes every picture in place — that is the
 * whole point of keeping the list here rather than in a folder of stale PNGs.
 */

export type GuideShotAuth = "guest" | "signed-in";

export type GuideShotScheme = "light" | "dark";

/**
 * A control to activate before the picture is taken, addressed the way a
 * reader would find it — by role and visible name — so it survives markup
 * changes that a CSS selector would not.
 */
export interface GuideShotInteraction {
  role: "button" | "link" | "menuitem" | "tab" | "switch";
  /** Accessible name, matched case-insensitively as a substring. */
  name: string;
}

export interface GuideShot {
  id: string;
  /**
   * Path to visit. The tokens `{article}`, `{publication}` and `{tag}` are
   * replaced at capture time with the perf fixtures from `.env`
   * (`PERF_TEST_ARTICLE_PATH` and friends — see `.env.example`).
   */
  path: string;
  auth: GuideShotAuth;
  viewport: { width: number; height: number };
  schemes: ReadonlyArray<GuideShotScheme>;
  interactions?: ReadonlyArray<GuideShotInteraction>;
  /**
   * When true, a capture failure is logged and skipped instead of failing the
   * run. Use it for shots that depend on optional fixtures or on a control
   * that only appears for some accounts.
   */
  optional?: boolean;
  /** What the picture shows. Shown in the capture log; not user-facing copy. */
  summary: string;
}

const DESKTOP = { width: 1280, height: 800 } as const;
const MOBILE = { width: 390, height: 780 } as const;

const LIGHT_ONLY: ReadonlyArray<GuideShotScheme> = ["light"];
const BOTH_SCHEMES: ReadonlyArray<GuideShotScheme> = ["light", "dark"];

export const GUIDE_SHOTS = [
  {
    id: "home",
    path: "/",
    auth: "signed-in",
    viewport: DESKTOP,
    schemes: BOTH_SCHEMES,
    summary: "Home — featured lead, latest unread rows, and the right rail.",
  },
  {
    id: "latest",
    path: "/latest",
    auth: "signed-in",
    viewport: DESKTOP,
    schemes: LIGHT_ONLY,
    summary: "Latest — the Unread / Subscriptions / All filter tabs.",
  },
  {
    id: "discover",
    path: "/discover",
    auth: "guest",
    viewport: DESKTOP,
    schemes: LIGHT_ONLY,
    summary: "Discover — recommendations, trending, and the full directory.",
  },
  {
    id: "search",
    path: "/search?q=reader",
    auth: "guest",
    viewport: DESKTOP,
    schemes: LIGHT_ONLY,
    summary: "Search — publications and articles, with matches highlighted.",
  },
  {
    id: "tag",
    path: "/tag/{tag}",
    auth: "guest",
    viewport: DESKTOP,
    schemes: LIGHT_ONLY,
    optional: true,
    summary: "A topic page — every article and publication under one tag.",
  },
  {
    id: "article",
    path: "{article}",
    auth: "guest",
    viewport: DESKTOP,
    schemes: BOTH_SCHEMES,
    optional: true,
    summary: "The reading view — one column, the article's own typography.",
  },
  {
    id: "article-mobile",
    path: "{article}",
    auth: "guest",
    viewport: MOBILE,
    schemes: LIGHT_ONLY,
    optional: true,
    summary: "The reading view on a phone.",
  },
  {
    id: "publication",
    path: "{publication}",
    auth: "guest",
    viewport: DESKTOP,
    schemes: LIGHT_ONLY,
    optional: true,
    summary: "A publication page — about, recent writing, and Follow.",
  },
  {
    id: "saved",
    path: "/saved",
    auth: "signed-in",
    viewport: DESKTOP,
    schemes: LIGHT_ONLY,
    summary: "Saved for later — the reading queue.",
  },
  {
    id: "subscriptions",
    path: "/subscriptions",
    auth: "signed-in",
    viewport: DESKTOP,
    schemes: LIGHT_ONLY,
    summary: "Subscriptions — the sortable table of everything you follow.",
  },
  {
    id: "collections",
    path: "/collections",
    auth: "signed-in",
    viewport: DESKTOP,
    schemes: LIGHT_ONLY,
    optional: true,
    summary: "Collections — magazine-rendered editions grouped into series.",
  },
  {
    id: "history",
    path: "/history",
    auth: "signed-in",
    viewport: DESKTOP,
    schemes: LIGHT_ONLY,
    summary: "Reading history — every article you have opened.",
  },
  {
    id: "settings",
    path: "/settings",
    auth: "signed-in",
    viewport: DESKTOP,
    schemes: LIGHT_ONLY,
    summary: "Settings — appearance, reading, feed, and personal data.",
  },
  {
    id: "feedback",
    path: "/feedback",
    auth: "guest",
    viewport: DESKTOP,
    schemes: LIGHT_ONLY,
    summary: "The feedback board — bugs, feature requests, and questions.",
  },
] as const satisfies ReadonlyArray<GuideShot>;

export type GuideShotId = (typeof GUIDE_SHOTS)[number]["id"];

const SHOTS_BY_ID = new Map<string, GuideShot>(
  GUIDE_SHOTS.map((shot) => [shot.id, shot]),
);

export function getGuideShot(id: GuideShotId): GuideShot {
  const shot = SHOTS_BY_ID.get(id);
  if (!shot) {
    throw new Error(`Unknown guide screenshot: ${id}`);
  }
  return shot;
}

/** File name written into `public/guide/`. */
export function guideShotFileName(id: string, scheme: GuideShotScheme): string {
  return scheme === "dark" ? `${id}--dark.png` : `${id}.png`;
}

/** Public URL for a captured screenshot. */
export function guideShotSrc(id: string, scheme: GuideShotScheme): string {
  return `/guide/${guideShotFileName(id, scheme)}`;
}

/** Where the capture run writes, relative to the app package root. */
export const GUIDE_SHOTS_OUTPUT_DIR = "public/guide";
