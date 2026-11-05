import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The app lives at citysafetymap.com/sf/ (the deploy workflow assembles the
// final site: this build under /sf/, plus root files from root-site/).
export default defineConfig({
  plugins: [react()],
  base: '/sf/',
})
