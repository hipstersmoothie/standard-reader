import { createContext } from "react";

import type { Size } from "./theme/types";

export const SizeContext = createContext<Size>("md");
