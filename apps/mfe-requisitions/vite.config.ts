import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'mfe_requisitions',
      filename: 'remoteEntry.js',
      exposes: {
        './RequisitionApp': './src/RequisitionApp.tsx',
      },
      shared: ['react', 'react-dom', '@tanstack/react-query'],
    }),
  ],
  server: {
    port: 5174,
  },
});
