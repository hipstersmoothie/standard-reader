/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PLAUSIBLE_DOMAIN?: string;
  readonly VITE_PLAUSIBLE_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
