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
  | "lists"
  | "collections"
  | "personalizing"
  | "extension"
  | "e-readers"
  | "publishing"
  | "comics"
  | "your-data";

export type GuideRoute =
  | "/guide"
  | "/guide/getting-started"
  | "/guide/reading"
  | "/guide/finding"
  | "/guide/keeping-track"
  | "/guide/lists"
  | "/guide/collections"
  | "/guide/personalizing"
  | "/guide/extension"
  | "/guide/e-readers"
  | "/guide/publishing"
  | "/guide/comics"
  | "/guide/your-data";

/**
 * The two halves of the guide: what you need to read something today, and
 * everything past that first session. Keeps the sidebar from reading as one
 * undifferentiated list of eight.
 */
export type GuideGroup = "basics" | "further";

export const GUIDE_GROUPS: ReadonlyArray<{
  group: GuideGroup;
  label: MessageDescriptor;
}> = [
  { group: "basics", label: msg`Start here` },
  { group: "further", label: msg`Going further` },
];

export interface GuideAreaMeta {
  area: GuideArea;
  to: GuideRoute;
  group: GuideGroup;
  /** Sidebar label. */
  label: MessageDescriptor;
  /** One line, used on the welcome page's start-here cards. */
  blurb: MessageDescriptor;
}

export const GUIDE_AREAS: ReadonlyArray<GuideAreaMeta> = [
  {
    area: "welcome",
    group: "basics",
    to: "/guide",
    label: msg`Welcome`,
    blurb: msg`What Standard Reader is, and what you can do here.`,
  },
  {
    area: "getting-started",
    group: "basics",
    to: "/guide/getting-started",
    label: msg`Getting started`,
    blurb: msg`Sign in, subscribe to your first publications, and find your way around.`,
  },
  {
    area: "reading",
    group: "basics",
    to: "/guide/reading",
    label: msg`Reading an article`,
    blurb: msg`The reading view, listening to an article, and joining the conversation.`,
  },
  {
    area: "finding",
    group: "basics",
    to: "/guide/finding",
    label: msg`Finding things to read`,
    blurb: msg`Home, Latest, Discover, search, and topics.`,
  },
  {
    area: "keeping-track",
    group: "further",
    to: "/guide/keeping-track",
    label: msg`Keeping track`,
    blurb: msg`Following, saving, recommending, and your reading history.`,
  },
  {
    area: "lists",
    group: "further",
    to: "/guide/lists",
    label: msg`Lists and your sidebar`,
    blurb: msg`Group what you subscribe to, and arrange the sidebar around how you read.`,
  },
  {
    area: "collections",
    group: "further",
    to: "/guide/collections",
    label: msg`Collections`,
    blurb: msg`Assemble articles into a magazine edition others can read and follow.`,
  },
  {
    area: "personalizing",
    group: "further",
    to: "/guide/personalizing",
    label: msg`Making it yours`,
    blurb: msg`Colors, type, density, feed behavior, and the weekly digest.`,
  },
  {
    area: "extension",
    group: "further",
    to: "/guide/extension",
    label: msg`The browser extension`,
    blurb: msg`Save and subscribe from anywhere on the web, without breaking your stride.`,
  },
  {
    area: "e-readers",
    group: "further",
    to: "/guide/e-readers",
    label: msg`Reading on an e-reader`,
    blurb: msg`Put your unread queue on a Kobo, Kindle or phone as real EPUB files.`,
  },
  {
    area: "publishing",
    group: "further",
    to: "/guide/publishing",
    label: msg`Publishing your site`,
    blurb: msg`Wire your own site's records so Standard Reader can find and read it.`,
  },
  {
    area: "comics",
    group: "further",
    to: "/guide/comics",
    label: msg`Publishing a comic`,
    blurb: msg`Get a shelf of covers and a page-flip reader out of the pages you already post.`,
  },
  {
    area: "your-data",
    group: "further",
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
    { id: "first-follows", label: msg`Subscribing to your first publications` },
    { id: "the-sidebar", label: msg`Finding your way around` },
    { id: "on-your-phone", label: msg`On your phone` },
    { id: "install", label: msg`Installing Standard Reader` },
    { id: "offline", label: msg`Reading offline` },
    { id: "without-account", label: msg`Reading without an account` },
  ],
  reading: [
    { id: "the-reading-view", label: msg`The reading view` },
    { id: "listen", label: msg`Listening to an article` },
    { id: "comfort", label: msg`Making the text comfortable` },
    { id: "images", label: msg`Images and links` },
    { id: "read-state", label: msg`Read and unread` },
    { id: "sharing", label: msg`Sharing an article` },
    { id: "sharing-a-passage", label: msg`Sharing a passage` },
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
    { id: "subscribing", label: msg`Subscribing to a publication` },
    { id: "following-a-person", label: msg`Following a person` },
    { id: "saving", label: msg`Saving for later` },
    { id: "recommending", label: msg`Recommending an article` },
    { id: "history", label: msg`Your reading history` },
    { id: "subscriptions", label: msg`Managing your subscriptions` },
  ],
  lists: [
    { id: "what-a-list-is", label: msg`What a list is` },
    { id: "making-one", label: msg`Making a list` },
    { id: "adding", label: msg`Adding and removing publications` },
    { id: "sidebar-groups", label: msg`Lists in the sidebar` },
    { id: "arranging", label: msg`Arranging the sidebar` },
  ],
  collections: [
    { id: "what-a-collection-is", label: msg`What a collection is` },
    { id: "making-one", label: msg`Making a collection` },
    { id: "permissions", label: msg`The one-time permission` },
    { id: "series", label: msg`Grouping editions into a series` },
    { id: "reading-one", label: msg`How readers see it` },
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
  extension: [
    { id: "what-it-does", label: msg`What it does` },
    { id: "installing", label: msg`Installing it` },
    { id: "on-any-page", label: msg`On any page you visit` },
    { id: "on-bluesky", label: msg`On Bluesky` },
    { id: "privacy", label: msg`What it can see` },
  ],
  publishing: [
    { id: "overview", label: msg`Overview` },
    { id: "discovery", label: msg`Discovery` },
    { id: "subscribe-embed", label: msg`Subscribe embed` },
    {
      id: "inline-reading",
      label: msg`Rendering content in Standard Reader`,
    },
    { id: "content-formats", label: msg`Supported content formats` },
    { id: "example", label: msg`Example record` },
  ],
  "e-readers": [
    { id: "what-you-get", label: msg`What you get` },
    { id: "setting-it-up", label: msg`Setting it up` },
    { id: "one-article", label: msg`Sending one article` },
    { id: "progress-sync", label: msg`Keeping your place` },
    { id: "whats-missing", label: msg`What will not be there` },
  ],
  comics: [
    { id: "what-readers-get", label: msg`What readers get` },
    { id: "turning-it-on", label: msg`Turning the comic view on` },
    { id: "pages", label: msg`What counts as a page` },
    { id: "titles", label: msg`Naming issues and pages` },
    { id: "covers", label: msg`Cover art` },
    { id: "notes", label: msg`The words beside the art` },
    { id: "alt-text", label: msg`Alt text` },
    { id: "read-state", label: msg`How readers pick it back up` },
    { id: "troubleshooting", label: msg`When it still reads as a blog` },
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

export function guideAreasInGroup(
  group: GuideGroup,
): ReadonlyArray<GuideAreaMeta> {
  return GUIDE_AREAS.filter((item) => item.group === group);
}
