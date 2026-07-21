export const LABELERS_DOCS_IDS = {
  overview: "overview",
  running: "running",
  reference: "reference",
} as const;

export const LABELERS_DOCS_SCROLL_SPY_IDS = Object.values(LABELERS_DOCS_IDS);

export type LabelersDocsJumpNavGroup = {
  label: string;
  options: Array<{ id: string; label: string }>;
};

export function labelersDocsJumpNavGroups(): Array<LabelersDocsJumpNavGroup> {
  return [
    {
      label: "On this page",
      options: [
        { id: LABELERS_DOCS_IDS.overview, label: "Overview" },
        { id: LABELERS_DOCS_IDS.running, label: "Running a labeler" },
        { id: LABELERS_DOCS_IDS.reference, label: "Reference implementation" },
      ],
    },
  ];
}
