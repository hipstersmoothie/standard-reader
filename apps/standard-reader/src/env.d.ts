/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_PLAUSIBLE_DOMAIN?: string;
  readonly VITE_PLAUSIBLE_ENDPOINT?: string;
  readonly VITE_PLAUSIBLE_CAPTURE_ON_LOCALHOST?: string;
  /** Base URL of the Standard Writer deploy the reader links out to. */
  readonly VITE_WRITER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
