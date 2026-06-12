/**
 * Side-effect import so Vite/WXT emit StyleX CSS as a real asset (popup/options
 * HTML link or content-scripts/content.css). Do not use virtual:stylex:* modules
 * — they require a dev-server middleware and break under chrome-extension://.
 */
import "./stylex.css";
