import { API_DOCS_CATALOG, API_DOCS_SECTIONS } from "./catalog";

export const API_DOCS_INTRO_IDS = {
  overview: "overview",
  discovery: "discovery",
  auth: "auth",
} as const;

export function apiDocsEndpointId(nsid: string): string {
  const leaf = nsid.split(".").pop() ?? nsid;
  return `ref-${leaf}`;
}

export function apiDocsSectionId(section: string): string {
  return section.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
}

export function apiDocsNsidLeaf(nsid: string): string {
  return nsid.split(".").pop() ?? nsid;
}

export function apiDocsNsidPrefix(nsid: string): string {
  const leaf = apiDocsNsidLeaf(nsid);
  return nsid.slice(0, nsid.length - leaf.length);
}

const SECTION_SUBTITLES: Record<(typeof API_DOCS_SECTIONS)[number], string> = {
  "Public queries": "no auth",
  "Directory & feeds": "no auth",
  "Personalized feeds": "auth",
  "Reader state": "auth · or did",
  "Write procedures": "auth",
};

export function apiDocsSectionSubtitle(section: string): string {
  return SECTION_SUBTITLES[section as (typeof API_DOCS_SECTIONS)[number]] ?? "";
}

export function apiDocsSectionEndpointCount(section: string): number {
  return API_DOCS_CATALOG.filter((entry) => entry.section === section).length;
}

function buildScrollSpyIds(): Array<string> {
  return [
    API_DOCS_INTRO_IDS.overview,
    API_DOCS_INTRO_IDS.discovery,
    API_DOCS_INTRO_IDS.auth,
    ...API_DOCS_SECTIONS.flatMap((section) => [
      apiDocsSectionId(section),
      ...API_DOCS_CATALOG.filter((entry) => entry.section === section).map(
        (entry) => apiDocsEndpointId(entry.nsid),
      ),
    ]),
  ];
}

/** Stable list for scroll-spy observers (do not rebuild per render). */
export const API_DOCS_SCROLL_SPY_IDS = buildScrollSpyIds();

export function apiDocsScrollSpyIds(): Array<string> {
  return API_DOCS_SCROLL_SPY_IDS;
}

export type ApiDocsJumpNavGroup = {
  label: string;
  options: Array<{ id: string; label: string }>;
};

export function apiDocsJumpNavGroups(): Array<ApiDocsJumpNavGroup> {
  return [
    {
      label: "Getting started",
      options: [
        { id: API_DOCS_INTRO_IDS.overview, label: "Overview" },
        { id: API_DOCS_INTRO_IDS.discovery, label: "Service discovery" },
        { id: API_DOCS_INTRO_IDS.auth, label: "Authentication" },
      ],
    },
    ...API_DOCS_SECTIONS.map((section) => ({
      label: section,
      options: [
        { id: apiDocsSectionId(section), label: section },
        ...API_DOCS_CATALOG.filter((entry) => entry.section === section).map(
          (entry) => ({
            id: apiDocsEndpointId(entry.nsid),
            label: apiDocsNsidLeaf(entry.nsid),
          }),
        ),
      ],
    })),
  ];
}

export function apiDocsAuthLabel(
  auth: "none" | "required" | "optional-did",
): string {
  if (auth === "none") return "none";
  if (auth === "optional-did") return "optional · did";
  return "required";
}
