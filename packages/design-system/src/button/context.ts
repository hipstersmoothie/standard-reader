import { createContext } from "react";

export const ButtonGroupContext = createContext<
  | {
      orientation: "vertical" | "horizontal";
      variant: "grouped" | "separate";
    }
  | undefined
>(undefined);
