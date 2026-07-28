import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

/**
 * The reader guide's table of contents.
 *
 * Deliberately separate from `#/components/docs` — those are the developer
 * docs (API, lexicons, renderers) and assume you are building on Standard.
 * These pages assume nothing: they are for people who just want to read.
 *
 * One page per thing a reader might be trying to do, and one section per task
 * inside it. The sidebar, the right-hand "On this page" rail, the mobile jump
 * menu, and the scroll-spy all read this file, so adding a section is a
 * one-line change here plus the heading on the page.
 */

export type GuideArea =
  | "welcome"
  | "getting-started"
  | "reading"
  | "finding"
  | "keeping-track"
  | "personalizing"
  | "everywhere"
  | "your-data";

export type GuideRoute =
  | "/guide"
  | "/guide/getting-started"
  | "/guide/reading"
  | "/guide/finding"
  | "/guide/keeping-track"
  | "/guide/personalizing"
  | "/guide/everywhere"
  | "/guide/your-data";

export interface GuideAreaMeta {
  area: GuideArea;
  to: GuideRoute;
  /** Sidebar label. */
  label: MessageDescriptor;
  /** One line, used on the welcome page's start-here cards. */
  blurb: MessageDescriptor;
}

export const GUIDE_AREAS: ReadonlyArray<GuideAreaMeta> = [
  {
    area: "welcome",
    to: "/guide",
    label: msg`Welcome`,
    blurb: msg`What Standard Reader is, and what you can do here.`,
  },
  {
    area: "getting-started",
    to: "/guide/getting-started",
    label: msg`Getting started`,
    blurb: msg`Sign in, follow your first publications, and find your way around.`,
  },
  {
    area: "reading",
    to: "/guide/reading",
    label: msg`Reading an article`,
    blurb: msg`The reading view, listening to an article, and joining the conversation.`,
  },
  {
    area: "finding",
    to: "/guide/finding",
    label: msg`Finding things to read`,
    blurb: msg`Home, Latest, Discover, search, and topics.`,
  },
  {
    area: "keeping-track",
    to: "/guide/keeping-track",
    label: msg`Keeping track`,
    blurb: msg`Saving, recommending, reading history, and managing what you follow.`,
  },
  {
    area: "personalizing",
    to: "/guide/personalizing",
    label: msg`Making it yours`,
    blurb: msg`Colors, type, density, feed behavior, and the weekly digest.`,
  },
  {
    area: "everywhere",
    to: "/guide/everywhere",
    label: msg`Beyond the app`,
    blurb: msg`The browser extension, sharing, and installing Standard Reader.`,
  },
  {
    area: "your-data",
    to: "/guide/your-data",
    label: msg`Your account and data`,
    blurb: msg`Where your reading lives, what we store, and how to take it with you.`,
  },
];

export interface GuideSection {
  id: string;
  label: MessageDescriptor;
}

/**
 * The headings on each page, in document order. The ids double as the anchor
 * targets — a section listed here must render `id={…}` on its `<h2>`.
 */
export const GUIDE_SECTIONS: Record<GuideArea, ReadonlyArray<GuideSection>> = {
  welcome: [
    { id: "what-it-is", label: msg`What Standard Reader is` },
    { id: "why-different", label: msg`Why it works differently` },
    { id: "start-here", label: msg`Start here` },
    { id: "getting-help", label: msg`Getting help` },
  ],
  "getting-started": [
    { id: "sign-in", label: msg`Signing in` },
    { id: "first-follows", label: msg`Following your first publications` },
    { id: "the-sidebar", label: msg`Finding your way around` },
    { id: "on-your-phone", label: msg`On your phone` },
    { id: "without-account", label: msg`Reading without an account` },
  ],
  reading: [
    { id: "the-reading-view", label: msg`The reading view` },
    { id: "listen", label: msg`Listening to an article` },
    { id: "comfort", label: msg`Making the text comfortable` },
    { id: "images", label: msg`Images and links` },
    { id: "read-state", label: msg`Read and unread` },
    { id: "conversation", label: msg`Comments and related reading` },
    { id: "original-site", label: msg`Opening the original site instead` },
  ],
  finding: [
    { id: "home", label: msg`Home` },
    { id: "latest", label: msg`Latest` },
    { id: "discover", label: msg`Discover` },
    { id: "search", label: msg`Search` },
    { id: "topics", label: msg`Topics` },
    { id: "people", label: msg`People you follow` },
    { id: "add-publication", label: msg`Adding a publication by name` },
  ],
  "keeping-track": [
    { id: "following", label: msg`Following a publication` },
    { id: "saving", label: msg`Saving for later` },
    { id: "recommending", label: msg`Recommending an article` },
    { id: "history", label: msg`Your reading history` },
    { id: "subscriptions", label: msg`Managing everything you follow` },
    { id: "lists", label: msg`Grouping publications into lists` },
    { id: "collections", label: msg`Collections` },
  ],
  personalizing: [
    { id: "theme", label: msg`Light, dark, and custom colors` },
    { id: "type-and-density", label: msg`Type size, shape, and density` },
    { id: "reading-preferences", label: msg`Reading preferences` },
    {
      id: "publication-themes",
      label: msg`Letting publications use their own colors`,
    },
    { id: "feed-preferences", label: msg`Feed preferences` },
    { id: "digest", label: msg`The weekly digest` },
    { id: "moderation", label: msg`Moderation and labels` },
    { id: "language", label: msg`Language` },
  ],
  everywhere: [
    { id: "extension", label: msg`The browser extension` },
    { id: "install", label: msg`Installing Standard Reader` },
    { id: "offline", label: msg`Reading offline` },
    { id: "sharing", label: msg`Sharing an article` },
    { id: "for-publishers", label: msg`If you publish, too` },
  ],
  "your-data": [
    { id: "where-it-lives", label: msg`Where your reading lives` },
    { id: "what-we-store", label: msg`What Standard Reader stores` },
    { id: "permissions", label: msg`Permissions you grant` },
    { id: "connected-apps", label: msg`Connected apps` },
    { id: "deleting", label: msg`Deleting your data` },
  ],
};

export function guideAreaMeta(area: GuideArea): GuideAreaMeta {
  const meta = GUIDE_AREAS.find((item) => item.area === area);
  if (!meta) throw new Error(`Unknown guide area: ${area}`);
  return meta;
}

export function guideSectionIds(area: GuideArea): Array<string> {
  return GUIDE_SECTIONS[area].map((section) => section.id);
}
