import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  
  // Preview server configuration - allows iframe embedding
  preview: {
    port: 4173,
    host: true,
    cors: true,
    headers: {
      // Allow iframe embedding from same origin
      'X-Frame-Options': 'SAMEORIGIN',
      // Allow embedding from localhost
      'Content-Security-Policy': "frame-ancestors 'self' http://localhost:* https://localhost:* http://127.0.0.1:* https://127.0.0.1:* file:"
    },
  },
  
  server: {
    port: 4173,
    host: true,
    cors: true,
    headers: {
      // Allow iframe embedding from same origin
      'X-Frame-Options': 'SAMEORIGIN',
      // Allow embedding from localhost
      'Content-Security-Policy': "frame-ancestors 'self' http://localhost:* https://localhost:* http://127.0.0.1:* https://127.0.0.1:* file:"
    },
  }
});