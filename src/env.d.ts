/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PLAUSIBLE_DOMAIN?: string;
  readonly VITE_PLAUSIBLE_ENDPOINT?: string;
  readonly VITE_PLAUSIBLE_CAPTURE_ON_LOCALHOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
