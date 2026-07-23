"use client";

import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";

import { PUBLISHING_DOCS_IDS } from "#/lib/publishing-docs/navigation";

import { docsStyles } from "./docs-page.stylex";
import { useDocsScrollSpyActive } from "./docs-scroll-spy-context";

const LINKS = [
  { id: PUBLISHING_DOCS_IDS.overview, label: msg`Overview` },
  { id: PUBLISHING_DOCS_IDS.discovery, label: msg`Discovery` },
  { id: PUBLISHING_DOCS_IDS.subscribeEmbed, label: msg`Subscribe embed` },
  {
    id: PUBLISHING_DOCS_IDS.inlineReading,
    label: msg`Rendering Content in Standard Reader`,
  },
  {
    id: PUBLISHING_DOCS_IDS.contentFormats,
    label: msg`Supported content formats`,
    nested: true,
  },
  { id: PUBLISHING_DOCS_IDS.example, label: msg`Example record`, nested: true },
] as const;

export function DocsPublishingNav() {
  const { i18n } = useLingui();
  const active = useDocsScrollSpyActive();

  return (
    <>
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
              "nested" in link && link.nested && docsStyles.refNavLinkNested,
              active === link.id && docsStyles.refNavLinkActive,
            )}
          >
            {i18n._(link.label)}
          </a>
        ))}
      </div>
    </>
  );
}
