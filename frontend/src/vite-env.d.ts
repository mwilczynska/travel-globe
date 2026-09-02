/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SITE_NAME?: string;
  readonly VITE_SITE_TAGLINE?: string;
  readonly VITE_SITE_DESCRIPTION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
