"use client";

import { createContext } from "react";

/** When rendered inside {@link Magazine}, supplies the edition's paper mode. */
export const MagazineColorContext = createContext<{ dark: boolean } | null>(
  null,
);
