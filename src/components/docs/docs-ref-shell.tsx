"use client";

import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { docsStyles } from "./docs-page.stylex";
import { DocsScrollSpyProvider } from "./docs-scroll-spy-context";
import { DocsToc } from "./docs-toc";

export function DocsRefShell({
  scrollSpyIds,
  nav,
  toc,
  mobileJumpNav,
  children,
}: {
  scrollSpyIds: Array<string>;
  /** Left column: navigation between docs areas. */
  nav: ReactNode;
  /** Right column: the current page's table of contents (scroll-spy anchors). */
  toc: ReactNode;
  mobileJumpNav: ReactNode;
  children: ReactNode;
}) {
  return (
    <DocsScrollSpyProvider ids={scrollSpyIds}>
      {mobileJumpNav}
      <div {...stylex.props(docsStyles.refLayout)}>
        {nav}
        <main {...stylex.props(docsStyles.refMain)}>{children}</main>
        <DocsToc>{toc}</DocsToc>
      </div>
    </DocsScrollSpyProvider>
  );
}
