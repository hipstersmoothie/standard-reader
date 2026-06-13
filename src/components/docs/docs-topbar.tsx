"use client";

import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { docsStyles } from "./docs-page.stylex";

const NAV_ITEMS = [
  { label: "API", to: "/docs/api" as const },
  { label: "Lexicons", to: "/docs/lexicons" as const },
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
        {NAV_ITEMS.map((item) => (
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
        ))}
      </nav>
    </header>
  );
}
