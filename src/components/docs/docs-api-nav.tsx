"use client";

import { Trans } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";

import { API_DOCS_CATALOG, API_DOCS_SECTIONS } from "#/lib/api-docs/catalog";
import {
  API_DOCS_INTRO_IDS,
  apiDocsEndpointId,
  apiDocsNsidLeaf,
  apiDocsSectionEndpointCount,
} from "#/lib/api-docs/navigation";

import { docsStyles } from "./docs-page.stylex";
import { useDocsScrollSpyActive } from "./docs-scroll-spy-context";

export function DocsApiNav() {
  const active = useDocsScrollSpyActive();

  return (
    <>
      <div {...stylex.props(docsStyles.refNavGroup)}>
        <div {...stylex.props(docsStyles.refNavHeadingRow)}>
          <span {...stylex.props(docsStyles.refNavHeading)}>
            <Trans>Getting started</Trans>
          </span>
        </div>
        <a
          href={`#${API_DOCS_INTRO_IDS.overview}`}
          {...stylex.props(
            docsStyles.refNavLink,
            active === API_DOCS_INTRO_IDS.overview &&
              docsStyles.refNavLinkActive,
          )}
        >
          <Trans>Overview</Trans>
        </a>
        <a
          href={`#${API_DOCS_INTRO_IDS.discovery}`}
          {...stylex.props(
            docsStyles.refNavLink,
            active === API_DOCS_INTRO_IDS.discovery &&
              docsStyles.refNavLinkActive,
          )}
        >
          <Trans>Service discovery</Trans>
        </a>
        <a
          href={`#${API_DOCS_INTRO_IDS.auth}`}
          {...stylex.props(
            docsStyles.refNavLink,
            active === API_DOCS_INTRO_IDS.auth && docsStyles.refNavLinkActive,
          )}
        >
          <Trans>Authentication</Trans>
        </a>
      </div>

      {API_DOCS_SECTIONS.map((section) => {
        const entries = API_DOCS_CATALOG.filter(
          (entry) => entry.section === section,
        );
        const count = apiDocsSectionEndpointCount(section);
        return (
          <div key={section} {...stylex.props(docsStyles.refNavGroup)}>
            <div {...stylex.props(docsStyles.refNavHeadingRow)}>
              <span {...stylex.props(docsStyles.refNavHeading)}>{section}</span>
              <span {...stylex.props(docsStyles.refNavHeadingCount)}>
                {count}
              </span>
            </div>
            {entries.map((entry) => {
              const id = apiDocsEndpointId(entry.nsid);
              return (
                <a
                  key={entry.nsid}
                  href={`#${id}`}
                  {...stylex.props(
                    docsStyles.refNavLink,
                    docsStyles.refNavLinkMono,
                    active === id && docsStyles.refNavLinkActive,
                  )}
                >
                  {apiDocsNsidLeaf(entry.nsid)}
                </a>
              );
            })}
          </div>
        );
      })}
    </>
  );
}
