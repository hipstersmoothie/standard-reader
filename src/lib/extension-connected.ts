/** DOM event the extension auth-callback content script listens for. */
export const EXTENSION_CLOSE_LOGIN_EVENT =
  "standard-reader-extension:close-login";

export function requestExtensionCloseLoginTab(): void {
  globalThis.dispatchEvent(new CustomEvent(EXTENSION_CLOSE_LOGIN_EVENT));
}
