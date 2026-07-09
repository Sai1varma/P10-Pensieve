import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the static build works whether it's served from the
// domain root or a GitHub Pages project subpath (https://user.github.io/<repo>/).
// No need to hardcode the repo name.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('@xyflow') || id.includes('@dagrejs')) return 'reactflow';
          if (id.includes('@supabase')) return 'supabase';
          return undefined;
        },
      },
    },
  },
})
