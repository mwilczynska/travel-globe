// Site branding, injected at build time.
//
// These are the only place the site's identity lives in the frontend. The repo
// ships neutral defaults so a fresh clone runs and looks sensible with no
// configuration; a deployment overrides them through VITE_* variables in .env,
// which Vite inlines into the bundle at build time.
//
// Because they are baked in at build time, changing them requires a rebuild
// (`docker compose up --build`), not just a restart.

export const SITE_NAME = import.meta.env.VITE_SITE_NAME || 'Travel Globe';

export const SITE_TAGLINE =
  import.meta.env.VITE_SITE_TAGLINE || 'Enter the password to continue';
