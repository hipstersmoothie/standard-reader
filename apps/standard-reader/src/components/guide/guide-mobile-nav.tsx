"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import type { GuideArea } from "#/lib/guide/navigation";
import { GUIDE_AREAS, GUIDE_SECTIONS } from "#/lib/guide/navigation";

import { docsStyles } from "../docs/docs-page.stylex";
import { useDocsScrollSpyActive } from "../docs/docs-scroll-spy-context";

/**
 * Narrow screens get one select in place of both rails: the first group moves
 * between guide pages, the second jumps to a section on the current one.
 */
export function GuideMobileNav({ area }: { area: GuideArea }) {
  const { t, i18n } = useLingui();
  const navigate = useNavigate();
  const active = useDocsScrollSpyActive();
  const sections = GUIDE_SECTIONS[area];
  const value = active ?? sections[0]?.id ?? "";

  const onChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const selected = event.target.value;
      const targetArea = GUIDE_AREAS.find((item) => item.to === selected);
      if (targetArea != null) {
        void navigate({ to: targetArea.to });
        return;
      }
      const target = document.querySelector(`#${CSS.escape(selected)}`);
      if (target == null) return;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      globalThis.history.replaceState(null, "", `#${selected}`);
    },
    [navigate],
  );

  return (
    <div {...stylex.props(docsStyles.mobileJumpBar)}>
      <label
        {...stylex.props(docsStyles.mobileJumpLabel)}
        htmlFor="guide-jump-nav"
      >
        <Trans>Jump to</Trans>
      </label>
      <select
        id="guide-jump-nav"
        {...stylex.props(docsStyles.mobileJumpSelect)}
        value={value}
        onChange={onChange}
        aria-label={t`Jump to section`}
      >
        <optgroup label={t`Guide`}>
          {GUIDE_AREAS.map((item) => (
            <option key={item.area} value={item.to}>
              {item.area === area
                ? `${i18n._(item.label)} ${t`(current)`}`
                : i18n._(item.label)}
            </option>
          ))}
        </optgroup>
        <optgroup label={t`On this page`}>
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {i18n._(section.label)}
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}
