/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** « 1 » dans le build statique de démonstration (GitHub Pages) : démarre directement en mode démo. */
  readonly VITE_STATIC_DEMO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
