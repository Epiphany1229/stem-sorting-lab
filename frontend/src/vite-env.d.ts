/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 本项目后端的 base URL，默认 /api；不要填香港天文台地址。 */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
