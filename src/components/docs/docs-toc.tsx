"use client";

import { useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

import { docsStyles } from "./docs-page.stylex";
import { useDocsScrollSpyActive } from "./docs-scroll-spy-context";

/**
 * The right-rail table of contents. Keeps the active scroll-spy anchor in view
 * by scrolling *its own* container only — never the page — so following along
 * on a long page (e.g. the API reference) doesn't lose the current section.
 */
export function DocsToc({ children }: { children: ReactNode }) {
  const { t } = useLingui();
  const active = useDocsScrollSpyActive();
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (active == null) return;
    const nav = navRef.current;
    if (nav == null) return;
    const link = nav.querySelector<HTMLElement>(
      `a[href="#${CSS.escape(active)}"]`,
    );
    if (link == null) return;

    // Adjust only this container's scrollTop; never call scrollIntoView, which
    // could also scroll the window and hijack the reader's position.
    const navRect = nav.getBoundingClientRect();
    const linkRect = link.getBoundingClientRect();
    const margin = 24;
    if (linkRect.top < navRect.top + margin) {
      nav.scrollTop -= navRect.top + margin - linkRect.top;
    } else if (linkRect.bottom > navRect.bottom - margin) {
      nav.scrollTop += linkRect.bottom - (navRect.bottom - margin);
    }
  }, [active]);

  return (
    <nav
      ref={navRef}
      {...stylex.props(docsStyles.refToc)}
      aria-label={t`On this page`}
    >
      {children}
    </nav>
  );
}
