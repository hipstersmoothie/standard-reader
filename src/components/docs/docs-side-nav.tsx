"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import type { DocsArea } from "./docs-nav-areas";
import { DOCS_AREAS } from "./docs-nav-areas";
import { docsStyles } from "./docs-page.stylex";

/**
 * The shared docs sidebar. Lists every docs area (API, Renderers, Lexicons,
 * Publishing) and highlights the current one; the active page passes its own
 * scroll-spy anchor groups as `children`, which render beneath the switcher.
 */
export function DocsSideNav({
  area,
  children,
}: {
  area: DocsArea;
  children: ReactNode;
}) {
  const { t, i18n } = useLingui();

  return (
    <nav {...stylex.props(docsStyles.refNav)} aria-label={t`Developer docs`}>
      <div {...stylex.props(docsStyles.refNavGroup)}>
        <div {...stylex.props(docsStyles.refNavHeadingRow)}>
          <span {...stylex.props(docsStyles.refNavHeading)}>
            <Trans>Documentation</Trans>
          </span>
        </div>
        {DOCS_AREAS.map((item) => (
          <Link
            key={item.area}
            to={item.to}
            {...stylex.props(
              docsStyles.refNavLink,
              item.area === area && docsStyles.refNavLinkActive,
            )}
          >
            {i18n._(item.label)}
          </Link>
        ))}
      </div>
      {children}
    </nav>
  );
}
