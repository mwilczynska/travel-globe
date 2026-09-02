import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Env lives in the repo root .env, shared with the backend, rather than a
// second frontend-only copy. Inside the Docker build this path does not exist
// (the build context is ./frontend); there the values arrive as build args on
// process.env instead, which loadEnv also picks up.
const envDir = path.resolve(__dirname, '..')

// Neutral defaults so a fresh clone runs and looks finished with no .env at
// all. A deployment overrides these in .env. Keep in sync with src/config.ts,
// which applies the same fallbacks for the values read from React.
const SITE_DEFAULTS: Record<string, string> = {
  VITE_SITE_NAME: 'Travel Globe',
  VITE_SITE_TAGLINE: 'Enter the password to continue',
  VITE_SITE_DESCRIPTION: 'A private travel blog with an interactive 3D globe',
}

const proxy = {
  '/api': {
    target: 'http://localhost:3001',
    changeOrigin: true,
  },
  '/uploads': {
    target: 'http://localhost:3001',
    changeOrigin: true,
  },
}

export default defineConfig(({ mode }) => {
  // Fill in any branding variable the environment did not supply. Vite's
  // %VITE_*% replacement in index.html leaves the placeholder verbatim when a
  // variable is unset, so without this an unconfigured clone would show a
  // literal "%VITE_SITE_NAME%" as its tab title. Defaults are applied only
  // where nothing is set, so .env and build args still win.
  const configured = loadEnv(mode, envDir, 'VITE_')
  for (const [key, value] of Object.entries(SITE_DEFAULTS)) {
    if (!configured[key]) process.env[key] = value
  }

  return {
    envDir,
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      host: true,
      proxy,
    },
    preview: {
      port: 4173,
      host: true,
      proxy,
    },
  }
})
