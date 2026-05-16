/// <reference types="vite/client" />

/**
 * Frontend env-var contract.
 *
 * Vite exposes `import.meta.env` populated from `.env*` files. Vars
 * MUST start with `VITE_` to be exposed to the client bundle —
 * `VITE_API_BASE_URL` is the only one we read today.
 *
 * Production builds inline `import.meta.env.VITE_*` at build time;
 * there's no runtime env on the client.
 */
interface ImportMetaEnv {
  /**
   * Override the API client's baseURL. Defaults to `/api/v1` (handled
   * by Vite's dev proxy or same-origin in prod). Set this only if
   * the SPA needs to talk to a backend at a different origin (e.g.
   * a staging API while developing locally).
   */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
