import { EXTENSION_CLOSE_LOGIN_EVENT } from "#/lib/extension-connected";

const CONNECTED_PATH = "/extension/connected";

function isExtensionConnectedPage(): boolean {
  return (
    globalThis.location.pathname === CONNECTED_PATH ||
    globalThis.location.pathname === `${CONNECTED_PATH}/`
  );
}

function notifyLoginComplete(): void {
  void browser.runtime.sendMessage({ type: "loginComplete" }).catch(() => {
    // Extension may be reloading during dev.
  });
}

export default defineContentScript({
  matches: [
    "http://127.0.0.1/extension/connected*",
    "https://standard-reader.app/extension/connected*",
    "https://staging.standard-reader.app/extension/connected*",
  ],
  runAt: "document_idle",
  main() {
    if (!isExtensionConnectedPage()) return;

    globalThis.addEventListener(
      EXTENSION_CLOSE_LOGIN_EVENT,
      notifyLoginComplete,
    );
    globalThis.setTimeout(notifyLoginComplete, 2500);
  },
});
