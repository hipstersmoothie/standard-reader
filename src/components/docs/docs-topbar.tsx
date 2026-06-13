"use client";

import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { docsStyles } from "./docs-page.stylex";

const NAV_ITEMS = [
  { label: "Guides", soon: true },
  { label: "API", to: "/docs/api" as const, soon: false },
  { label: "Lexicons", soon: true },
  { label: "Changelog", soon: true },
] as const;

export function DocsTopbar() {
  return (
    <header {...stylex.props(docsStyles.topbar)}>
      <div {...stylex.props(docsStyles.topbarLeft)}>
        <Link to="/" {...stylex.props(docsStyles.brandLink)}>
          Standard <span {...stylex.props(docsStyles.brandEm)}>Reader</span>
        </Link>
        <span {...stylex.props(docsStyles.topbarTag)}>Developer docs</span>
      </div>
      <nav {...stylex.props(docsStyles.topbarNav)} aria-label="Developer docs">
        {NAV_ITEMS.map((item) =>
          item.soon ? (
            <span key={item.label} {...stylex.props(docsStyles.topbarNavSoon)}>
              {item.label}
            </span>
          ) : (
            <Link
              key={item.label}
              to={item.to}
              {...stylex.props(docsStyles.topbarNavLink)}
              activeProps={stylex.props(
                docsStyles.topbarNavLink,
                docsStyles.topbarNavLinkActive,
              )}
            >
              {item.label}
            </Link>
          ),
        )}
      </nav>
    </header>
  );
}
