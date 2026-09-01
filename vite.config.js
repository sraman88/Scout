import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/* GitHub Pages serves a project site from /<repo>/, so the bundle needs a
   matching base or every asset 404s. Vercel serves from the root. CI sets
   GITHUB_PAGES=true, so one config covers both without either deploy
   breaking the other. */
const base = process.env.GITHUB_PAGES === 'true' ? '/Scout/' : '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react()],
})
