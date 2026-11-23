/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  /** Base URL of the public storefront (no trailing slash) — used to build
   * the "Link" button on a Pedido's /pedido/:token tracking page. */
  readonly VITE_STOREFRONT_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
