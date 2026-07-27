export const INTRODUCTION_DOCS_IDS = {
  overview: "overview",
  areas: "areas",
  conventions: "conventions",
} as const;

export const INTRODUCTION_DOCS_SCROLL_SPY_IDS = Object.values(
  INTRODUCTION_DOCS_IDS,
);

export type IntroductionDocsJumpNavGroup = {
  label: string;
  options: Array<{ id: string; label: string }>;
};

export function introductionDocsJumpNavGroups(): Array<IntroductionDocsJumpNavGroup> {
  return [
    {
      label: "On this page",
      options: [
        { id: INTRODUCTION_DOCS_IDS.overview, label: "Overview" },
        { id: INTRODUCTION_DOCS_IDS.areas, label: "What's in these docs" },
        { id: INTRODUCTION_DOCS_IDS.conventions, label: "Conventions" },
      ],
    },
  ];
}
