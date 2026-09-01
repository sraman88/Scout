import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/* GitHub Pages serves a project site from /<repo>/, so the bundle needs a
   matching base or every asset 404s. Vercel serves from the root. CI sets
   GITHUB_PAGES=true, so one config covers both without either deploy
   breaking the other. */
const base = process.env.GITHUB_PAGES === 'true' ? '/Scout/' : '/'

/* Stamped into the UI so a deployed build can be identified on sight. Several
   rounds of "the fix isn't working" turned out to be a stale deploy, which is
   invisible without this. */
function buildId() {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'local'
  }
}

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react()],
  define: {
    __BUILD_ID__: JSON.stringify(buildId()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
  },
})
