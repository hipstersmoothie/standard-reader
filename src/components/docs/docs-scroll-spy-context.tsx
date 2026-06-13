"use client";

import type { ReactNode } from "react";

import { createContext, useContext } from "react";

import { useDocsScrollSpy } from "./use-docs-scroll-spy";

const DocsScrollSpyContext = createContext<string | null>(null);

/* eslint-disable react/only-export-components -- scroll spy context */
export function DocsScrollSpyProvider({
  ids,
  children,
}: {
  ids: Array<string>;
  children: ReactNode;
}) {
  const active = useDocsScrollSpy(ids);
  return (
    <DocsScrollSpyContext.Provider value={active}>
      {children}
    </DocsScrollSpyContext.Provider>
  );
}

export function useDocsScrollSpyActive(): string | null {
  return useContext(DocsScrollSpyContext);
}
/* eslint-enable react/only-export-components */
