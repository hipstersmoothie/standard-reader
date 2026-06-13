"use client";

import type { LexiconDocsEntry } from "#/lib/lexicon-docs/types";

import * as stylex from "@stylexjs/stylex";
import {
  lexiconDocsJumpNavGroups,
  lexiconDocsScrollSpyIds,
} from "#/lib/lexicon-docs/navigation";
import { useCallback, useMemo } from "react";

import { docsStyles } from "./docs-page.stylex";
import { useDocsScrollSpyActive } from "./docs-scroll-spy-context";

export function DocsLexiconsMobileJumpNav({
  entries,
}: {
  entries: Array<LexiconDocsEntry>;
}) {
  const active = useDocsScrollSpyActive();
  const scrollSpyIds = useMemo(
    () => lexiconDocsScrollSpyIds(entries),
    [entries],
  );
  const groups = useMemo(() => lexiconDocsJumpNavGroups(entries), [entries]);
  const value = active ?? scrollSpyIds[0] ?? "";

  const onChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const id = event.target.value;
      const target = document.querySelector(`#${id}`);
      if (target == null) {
        return;
      }
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      globalThis.history.replaceState(null, "", `#${id}`);
    },
    [],
  );

  return (
    <div {...stylex.props(docsStyles.mobileJumpBar)}>
      <label
        {...stylex.props(docsStyles.mobileJumpLabel)}
        htmlFor="lexicon-docs-jump-nav"
      >
        Jump to
      </label>
      <select
        id="lexicon-docs-jump-nav"
        {...stylex.props(docsStyles.mobileJumpSelect)}
        value={value}
        onChange={onChange}
        aria-label="Jump to section"
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
