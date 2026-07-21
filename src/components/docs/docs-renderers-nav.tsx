"use client";

import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";

import { RENDERERS_DOCS_IDS } from "#/lib/renderers-docs/navigation";

import { docsStyles } from "./docs-page.stylex";
import { useDocsScrollSpyActive } from "./docs-scroll-spy-context";

const LINKS = [
  { id: RENDERERS_DOCS_IDS.overview, label: msg`Overview` },
  { id: RENDERERS_DOCS_IDS.packages, label: msg`Packages` },
  { id: RENDERERS_DOCS_IDS.quickstart, label: msg`Quick start` },
  { id: RENDERERS_DOCS_IDS.document, label: msg`The document input` },
  { id: RENDERERS_DOCS_IDS.components, label: msg`Customizing components` },
  { id: RENDERERS_DOCS_IDS.platformData, label: msg`Resolving platform data` },
  { id: RENDERERS_DOCS_IDS.core, label: msg`The core / new frameworks` },
] as const;

export function DocsRenderersNav() {
  const { t, i18n } = useLingui();
  const active = useDocsScrollSpyActive();

  return (
    <nav {...stylex.props(docsStyles.refNav)} aria-label={t`Renderers guide`}>
      <div {...stylex.props(docsStyles.refNavGroup)}>
        <div {...stylex.props(docsStyles.refNavHeadingRow)}>
          <span {...stylex.props(docsStyles.refNavHeading)}>
            <Trans>On this page</Trans>
          </span>
        </div>
        {LINKS.map((link) => (
          <a
            key={link.id}
            href={`#${link.id}`}
            {...stylex.props(
              docsStyles.refNavLink,
              active === link.id && docsStyles.refNavLinkActive,
            )}
          >
            {i18n._(link.label)}
          </a>
        ))}
      </div>
    </nav>
  );
}
