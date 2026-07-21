"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { useCallback } from "react";

import {
  RENDERERS_DOCS_SCROLL_SPY_IDS,
  renderersDocsJumpNavGroups,
} from "#/lib/renderers-docs/navigation";

import { docsStyles } from "./docs-page.stylex";
import { useDocsScrollSpyActive } from "./docs-scroll-spy-context";

const groups = renderersDocsJumpNavGroups();

export function DocsRenderersMobileJumpNav() {
  const { t } = useLingui();
  const active = useDocsScrollSpyActive();
  const value = active ?? RENDERERS_DOCS_SCROLL_SPY_IDS[0] ?? "";

  const onChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const id = event.target.value;
      const target = document.querySelector(`#${id}`);
      if (target == null) return;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      globalThis.history.replaceState(null, "", `#${id}`);
    },
    [],
  );

  return (
    <div {...stylex.props(docsStyles.mobileJumpBar)}>
      <label
        {...stylex.props(docsStyles.mobileJumpLabel)}
        htmlFor="docs-renderers-jump-nav"
      >
        <Trans>Jump to</Trans>
      </label>
      <select
        id="docs-renderers-jump-nav"
        {...stylex.props(docsStyles.mobileJumpSelect)}
        value={value}
        onChange={onChange}
        aria-label={t`Jump to section`}
      >
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
