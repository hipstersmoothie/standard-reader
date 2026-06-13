"use client";

import type { ApiDocsFixtures } from "#/lib/api-docs/fixture-defaults";
import type { ApiDocsTagOption } from "#/lib/api-docs/types";
import type { ReactNode } from "react";

import { useQuery } from "@tanstack/react-query";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { createContext, useContext, useMemo } from "react";

export type ApiDocsPageContextValue = {
  fixtures: ApiDocsFixtures;
  tagOptions: Array<ApiDocsTagOption>;
  signedIn: boolean;
  sessionDid: string | null;
};

const ApiDocsPageContext = createContext<ApiDocsPageContextValue | null>(null);

export function ApiDocsPageProvider({
  fixtures,
  tagOptions,
  children,
}: {
  fixtures: ApiDocsFixtures;
  tagOptions: Array<ApiDocsTagOption>;
  children: ReactNode;
}) {
  const { data: session } = useQuery(user.getSessionQueryOptions);
  const sessionDid = session?.user?.did ?? null;
  const value = useMemo(
    () => ({
      fixtures,
      tagOptions,
      signedIn: Boolean(sessionDid),
      sessionDid,
    }),
    [fixtures, tagOptions, sessionDid],
  );

  return (
    <ApiDocsPageContext.Provider value={value}>
      {children}
    </ApiDocsPageContext.Provider>
  );
}

/* eslint-disable react/only-export-components -- context hooks */
export function useApiDocsPageContext(): ApiDocsPageContextValue {
  const value = useContext(ApiDocsPageContext);
  if (!value) {
    throw new Error("useApiDocsPageContext requires ApiDocsPageProvider");
  }
  return value;
}

/** @deprecated use useApiDocsPageContext */
export function useApiDocsFixtures(): ApiDocsFixtures {
  return useApiDocsPageContext().fixtures;
}
/* eslint-enable react/only-export-components */
