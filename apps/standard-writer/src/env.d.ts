/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PLAUSIBLE_DOMAIN?: string;
  readonly VITE_PLAUSIBLE_ENDPOINT?: string;
  /** Base URL of the Standard Reader deploy a site's headlines link into. */
  readonly VITE_READER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
