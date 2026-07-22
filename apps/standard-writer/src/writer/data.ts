/**
 * Mock authoring data for the Standard Writer scaffold. This mirrors the shape
 * of the `site.standard.*` records the app will eventually read from drafts
 * (our DB) and publish to the author's repo — see `APP_VISION.md`.
 */

export type ArticleStatus = "published" | "scheduled";

export interface Article {
  title: string;
  path: string;
  published: string;
  words: string;
  readTime: string;
  rev: number;
  status: ArticleStatus;
  excerpt: string;
  /** Set when opened from a publication, for the editor's back link. */
  pubName?: string;
}

export interface PubTheme {
  background: string;
  foreground: string;
  accent: string;
  accentForeground: string;
}

export interface Publication {
  id: string;
  name: string;
  icon: string;
  url: string;
  desc: string;
  discoverable: boolean;
  theme: PubTheme;
  articles: Array<Article>;
}

export interface Draft {
  title: string;
  excerpt: string;
  updated: string;
  words: string;
  tags: string;
  current: boolean;
}

export const DRAFTS: Array<Draft> = [
  {
    title: "You Own the Press",
    excerpt:
      "A publication on standard.site is not a feed on someone else’s server — it is a set of signed records in a repo you control.",
    updated: "Edited just now",
    words: "1,240",
    tags: "essays · atproto",
    current: true,
  },
  {
    title: "Notes Toward a Slower Web",
    excerpt:
      "What we lose when reading becomes a feed, and what a calendar of publications might feel like instead.",
    updated: "Yesterday",
    words: "680",
    tags: "essays",
    current: false,
  },
  {
    title: "The Repo as Canon",
    excerpt:
      "If the canonical document is the signed record in your repository, what happens to the idea of a “platform” at all?",
    updated: "3 days ago",
    words: "2,010",
    tags: "protocol · longform",
    current: false,
  },
  {
    title: "Field Notes: Winter Reading",
    excerpt:
      "A short list of the essays and reports that stayed with me this season.",
    updated: "Last week",
    words: "320",
    tags: "notes",
    current: false,
  },
];

export const PUBS: Array<Publication> = [
  {
    id: "marginalia",
    name: "The Marginalia Dispatch",
    icon: "§",
    url: "marginaliadispatch.com",
    desc: "Loose essays on reading, writing, and owning what you publish.",
    discoverable: true,
    theme: {
      background: "#fcf9f5",
      foreground: "#3e332e",
      accent: "#ad7f58",
      accentForeground: "#ffffff",
    },
    articles: [
      {
        title: "You Own the Press",
        path: "you-own-the-press",
        published: "Jul 21, 2026",
        words: "1,240",
        readTime: "5 min",
        rev: 2,
        status: "published",
        excerpt:
          "Why a publication is a set of signed records in a repo you control — not a feed on someone else’s server.",
      },
      {
        title: "Notes on a Vanishing Coastline",
        path: "vanishing-coastline",
        published: "Jun 6, 2026",
        words: "2,980",
        readTime: "18 min",
        rev: 3,
        status: "published",
        excerpt:
          "Measuring a shoreline’s retreat in fence posts — and correcting the record long after it first published.",
      },
      {
        title: "The Quiet Return of the Essay",
        path: "quiet-return-of-the-essay",
        published: "May 2, 2026",
        words: "1,610",
        readTime: "9 min",
        rev: 1,
        status: "published",
        excerpt:
          "A new generation of writers is rediscovering the personal essay, and the slow web that suits it.",
      },
      {
        title: "A Field Guide to Slow Mornings",
        path: "slow-mornings",
        published: "Aug 4, 2026",
        words: "900",
        readTime: "6 min",
        rev: 1,
        status: "scheduled",
        excerpt:
          "Small rituals for starting the day before the feed gets to you.",
      },
    ],
  },
  {
    id: "signals",
    name: "Signals",
    icon: "S",
    url: "signals.example",
    desc: "Short notes on the open social web and the AT Protocol.",
    discoverable: false,
    theme: {
      background: "#ffffff",
      foreground: "#1a1a1a",
      accent: "#2b6cb0",
      accentForeground: "#ffffff",
    },
    articles: [
      {
        title: "The Repo as Canon",
        path: "repo-as-canon",
        published: "Jul 10, 2026",
        words: "2,010",
        readTime: "11 min",
        rev: 2,
        status: "published",
        excerpt:
          "If the canonical document is the signed record in your repo, what is left of the idea of a platform?",
      },
      {
        title: "What “Own Your Data” Actually Means",
        path: "own-your-data",
        published: "Jun 28, 2026",
        words: "740",
        readTime: "4 min",
        rev: 1,
        status: "published",
        excerpt:
          "Beyond the slogan: portability, signing keys, and who actually holds the record.",
      },
    ],
  },
];

export interface ThemePreset extends PubTheme {
  id: string;
  name: string;
}

export const THEME_PRESETS: Array<ThemePreset> = [
  {
    id: "almanac",
    name: "Almanac",
    background: "#fcf9f5",
    foreground: "#3e332e",
    accent: "#ad7f58",
    accentForeground: "#ffffff",
  },
  {
    id: "ink",
    name: "Ink",
    background: "#ffffff",
    foreground: "#1a1a1a",
    accent: "#2b6cb0",
    accentForeground: "#ffffff",
  },
  {
    id: "forest",
    name: "Forest",
    background: "#f3f6f1",
    foreground: "#22311f",
    accent: "#3f7d4e",
    accentForeground: "#ffffff",
  },
  {
    id: "dusk",
    name: "Dusk",
    background: "#1b1a24",
    foreground: "#eceaf6",
    accent: "#b48ce0",
    accentForeground: "#1b1a24",
  },
];

export interface ThemeRole {
  key: keyof PubTheme;
  label: string;
  desc: string;
}

export const THEME_ROLES: Array<ThemeRole> = [
  { key: "background", label: "Background", desc: "Content background" },
  { key: "foreground", label: "Foreground", desc: "Content text" },
  { key: "accent", label: "Accent", desc: "Links & button fills" },
  { key: "accentForeground", label: "Accent text", desc: "Text on buttons" },
];

export const PALETTE = [
  "#fcf9f5",
  "#3e332e",
  "#ad7f58",
  "#8a5a3c",
  "#c99f6a",
  "#5f4632",
  "#2b6cb0",
  "#3f7d4e",
  "#a33a2a",
  "#b48ce0",
  "#1b1a24",
  "#ffffff",
];

/** Status pill colors are outside the themed token set by design. */
export const STATUS = {
  published: { color: "#3f7d4e", dot: "#4a9d6b", label: "Published" },
  scheduled: { color: "#8a6d3b", dot: "#c99f6a", label: "Scheduled" },
} as const;

/** Starter body used to seed the shared editor on the Write screen. */
export const STARTER_DOC = [
  "A publication on standard.site is not a feed sitting on someone else's server. It is a set of signed records in a repository *you* control, described by a shared lexicon — which means anyone who speaks the schema can render what you publish the moment it lands on the network.",
  "",
  "## The document is the record",
  "",
  "There is no CMS holding your drafts hostage and no export to beg for. When you publish, the editor serializes losslessly to `at.markpub.markdown` — the same portable format a reader already treats as first-class. What you write is exactly what readers see.",
  "",
  "> The canonical article lives in your repo, signed by your DID. The app is a client that helps you produce those records — it is not the home of your work.",
  "",
  "No platform to be de-platformed from.",
].join("\n");
