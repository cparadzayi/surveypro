/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string
  readonly VITE_LITE_FAV_SEED?: string // CSV of slugs, e.g., "polar,intersections"
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
