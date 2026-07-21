import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// StyleX CSS is injected by @stylexjs/unplugin: it serves it in dev and appends
// it to the app's emitted stylesheet at build time (this `styles.css` import is
// what produces that stylesheet asset).
import "./styles.css";

import { App } from "./App";

const container = document.querySelector("#app");
if (!container) throw new Error("Missing #app root element");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
