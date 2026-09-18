import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base so GitHub Pages project sites and local preview both work.
export default defineConfig({
  plugins: [react()],
  base: './',
})
