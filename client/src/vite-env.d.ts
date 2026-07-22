/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EMMIWOOD_PUBLIC_ORIGIN?: string;
  /** Google Maps Embed API key (HTTP referrer–restricted). Enables maps/embed/v1/place. */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
