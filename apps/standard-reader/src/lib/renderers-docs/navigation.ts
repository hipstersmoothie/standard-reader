export const RENDERERS_DOCS_IDS = {
  overview: "overview",
  packages: "packages",
  components: "components",
  platformData: "platform-data",
  core: "core",
} as const;

export const RENDERERS_DOCS_SCROLL_SPY_IDS = Object.values(RENDERERS_DOCS_IDS);

export type RenderersDocsJumpNavGroup = {
  label: string;
  options: Array<{ id: string; label: string }>;
};

export function renderersDocsJumpNavGroups(): Array<RenderersDocsJumpNavGroup> {
  return [
    {
      label: "On this page",
      options: [
        { id: RENDERERS_DOCS_IDS.overview, label: "Overview" },
        { id: RENDERERS_DOCS_IDS.packages, label: "Packages" },
        { id: RENDERERS_DOCS_IDS.components, label: "Customizing components" },
        {
          id: RENDERERS_DOCS_IDS.platformData,
          label: "Resolving platform data",
        },
        { id: RENDERERS_DOCS_IDS.core, label: "The core / new frameworks" },
      ],
    },
  ];
}
