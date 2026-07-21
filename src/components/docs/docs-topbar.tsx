"use client";

import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { docsStyles } from "./docs-page.stylex";

const NAV_ITEMS = [
  { label: msg`API`, to: "/docs/api" as const },
  { label: msg`Lexicons`, to: "/docs/lexicons" as const },
  { label: msg`Publishing`, to: "/docs/publishing" as const },
  { label: msg`Renderers`, to: "/docs/renderers" as const },
] as const;

export function DocsTopbar() {
  const { i18n, t } = useLingui();

  return (
    <header {...stylex.props(docsStyles.topbar)}>
      <div {...stylex.props(docsStyles.topbarLeft)}>
        <Link to="/" {...stylex.props(docsStyles.brandLink)}>
          Standard <span {...stylex.props(docsStyles.brandEm)}>Reader</span>
        </Link>
        <span {...stylex.props(docsStyles.topbarTag, docsStyles.topbarTagFull)}>
          <Trans>Developer docs</Trans>
        </span>
        <span
          {...stylex.props(docsStyles.topbarTag, docsStyles.topbarTagShort)}
        >
          <Trans>Docs</Trans>
        </span>
      </div>
      <nav
        {...stylex.props(docsStyles.topbarNav)}
        aria-label={t`Developer docs`}
      >
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            {...stylex.props(docsStyles.topbarNavLink)}
            activeProps={stylex.props(
              docsStyles.topbarNavLink,
              docsStyles.topbarNavLinkActive,
            )}
          >
            {i18n._(item.label)}
          </Link>
        ))}
      </nav>
    </header>
  );
}
