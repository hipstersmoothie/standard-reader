/**
 * Is the app running as an installed PWA rather than in a browser tab?
 *
 * Lives on its own because two unrelated features need it: web push (iOS only
 * exposes it to an installed app) and the update prompt (which is meaningless on
 * a website, where reloading is just what the browser does).
 */
export function isStandalone(): boolean {
  if (globalThis.window === undefined) return false;
  if (globalThis.matchMedia?.("(display-mode: standalone)").matches) {
    return true;
  }
  // iOS predates `display-mode` and still reports via this non-standard flag.
  return (
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
