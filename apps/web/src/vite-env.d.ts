/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ONESHOT_API_BASE_URL?: string;
  readonly VITE_PRIVY_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
