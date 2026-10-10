import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import { parseModules } from './src/lib/modules';

// v0.1.6 (B4): MFE remote — `VITE_MODULES`-д `mfe` байвал (анхдагч "all") хаяг нь VITE_MFE_REQUISITIONS_URL (анхдагч :5174).
// Байхгүй бол (пилот: VITE_MODULES=camp) remote-ийг бүрэн хасаж, import-ийг хоосон компонент руу чиглүүлнэ.
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  const mfeEnabled = parseModules(env.VITE_MODULES).has('mfe');
  const mfeRequisitionsUrl = env.VITE_MFE_REQUISITIONS_URL || 'http://localhost:5174/assets/remoteEntry.js';

  return {
    plugins: [
      react(),
      federation({
        name: 'shell',
        remotes: mfeEnabled ? { mfe_requisitions: mfeRequisitionsUrl } : {},
        shared: ['react', 'react-dom', '@tanstack/react-query'],
      }),
    ],
    resolve: {
      alias: mfeEnabled
        ? []
        : [{
            find: 'mfe_requisitions/RequisitionApp',
            replacement: fileURLToPath(new URL('./src/components/MfeDisabled.tsx', import.meta.url)),
          }],
    },
    server: {
      port: 5173,
      host: 'localhost',
      hmr: {
        protocol: 'ws',
        host: 'localhost',
        port: 5173,
      },
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  };
});
