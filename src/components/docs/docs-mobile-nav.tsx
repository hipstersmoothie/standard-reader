"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import type { DocsArea } from "./docs-nav-areas";
import { DOCS_AREAS } from "./docs-nav-areas";
import { docsStyles } from "./docs-page.stylex";
import { useDocsScrollSpyActive } from "./docs-scroll-spy-context";

type JumpNavGroup = {
  label: string;
  options: Array<{ id: string; label: string }>;
};

/**
 * The mobile counterpart to {@link DocsSideNav}. A single select whose first
 * group switches between docs areas (navigating routes) and whose remaining
 * groups jump to sections within the current page.
 */
export function DocsMobileNav({
  area,
  groups,
  selectId,
  fallbackId,
}: {
  area: DocsArea;
  groups: Array<JumpNavGroup>;
  selectId: string;
  fallbackId: string;
}) {
  const { t, i18n } = useLingui();
  const navigate = useNavigate();
  const active = useDocsScrollSpyActive();
  const value = active ?? fallbackId;

  const onChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const selected = event.target.value;
      const targetArea = DOCS_AREAS.find((item) => item.to === selected);
      if (targetArea != null) {
        void navigate({ to: targetArea.to });
        return;
      }
      const target = document.querySelector(`#${selected}`);
      if (target == null) return;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      globalThis.history.replaceState(null, "", `#${selected}`);
    },
    [navigate],
  );

  return (
    <div {...stylex.props(docsStyles.mobileJumpBar)}>
      <label {...stylex.props(docsStyles.mobileJumpLabel)} htmlFor={selectId}>
        <Trans>Jump to</Trans>
      </label>
      <select
        id={selectId}
        {...stylex.props(docsStyles.mobileJumpSelect)}
        value={value}
        onChange={onChange}
        aria-label={t`Jump to section`}
      >
        <optgroup label={t`Pages`}>
          {DOCS_AREAS.map((item) => (
            <option key={item.area} value={item.to}>
              {item.area === area
                ? `${i18n._(item.label)} ${t`(current)`}`
                : i18n._(item.label)}
            </option>
          ))}
        </optgroup>
        {groups.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
