"use client";

import type { ReactNode } from "react";

import { API_DOCS_SCROLL_SPY_IDS } from "#/lib/api-docs/navigation";
import { createContext, useContext } from "react";

import { useDocsScrollSpy } from "./use-docs-scroll-spy";

const DocsApiScrollSpyContext = createContext<string | null>(null);

/* eslint-disable react/only-export-components -- scroll spy context */
export function DocsApiScrollSpyProvider({
  children,
}: {
  children: ReactNode;
}) {
  const active = useDocsScrollSpy(API_DOCS_SCROLL_SPY_IDS);
  return (
    <DocsApiScrollSpyContext.Provider value={active}>
      {children}
    </DocsApiScrollSpyContext.Provider>
  );
}

export function useDocsApiScrollSpy(): string | null {
  return useContext(DocsApiScrollSpyContext);
}
/* eslint-enable react/only-export-components */
