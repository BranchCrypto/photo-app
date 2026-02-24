import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig(async () => {
  const { cloudflare } = await import('@cloudflare/vite-plugin');
  return {
    plugins: [react(), cloudflare()],
    server: {
      port: 5173,
    },
  };
});

