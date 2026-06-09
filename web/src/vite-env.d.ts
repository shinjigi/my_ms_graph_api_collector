/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_TP_BASE_URL: string;
    readonly VITE_ORG_NAME: string;
    readonly VITE_USER_DISPLAY_NAME: string;
    readonly VITE_USER_INITIALS: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
