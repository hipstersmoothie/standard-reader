export const PUBLISHING_DOCS_IDS = {
  overview: "overview",
  discovery: "discovery",
  subscribeEmbed: "subscribe-embed",
  inlineReading: "inline-reading",
  contentFormats: "content-formats",
  example: "example",
} as const;

export const PUBLISHING_DOCS_SCROLL_SPY_IDS =
  Object.values(PUBLISHING_DOCS_IDS);

export type PublishingDocsJumpNavGroup = {
  label: string;
  options: Array<{ id: string; label: string }>;
};

export function publishingDocsJumpNavGroups(): Array<PublishingDocsJumpNavGroup> {
  return [
    {
      label: "On this page",
      options: [
        { id: PUBLISHING_DOCS_IDS.overview, label: "Overview" },
        { id: PUBLISHING_DOCS_IDS.discovery, label: "Discovery" },
        { id: PUBLISHING_DOCS_IDS.subscribeEmbed, label: "Subscribe embed" },
        {
          id: PUBLISHING_DOCS_IDS.inlineReading,
          label: "Rendering Content in Standard Reader",
        },
        {
          id: PUBLISHING_DOCS_IDS.contentFormats,
          label: "— Supported content formats",
        },
        { id: PUBLISHING_DOCS_IDS.example, label: "— Example record" },
      ],
    },
  ];
}
