/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NAVER_MAPS_CLIENT_ID?: string;
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
