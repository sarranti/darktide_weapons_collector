import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // MUST match your repository name exactly for GitHub Pages
  base: '/darktide_weapons_collector/', 
})