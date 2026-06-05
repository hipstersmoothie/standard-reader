import { createContext, useContext } from "react";

export type PageVariant = "small" | "large";

export const PageContext = createContext<PageVariant>("large");

export function usePageContext() {
  return useContext(PageContext);
}
