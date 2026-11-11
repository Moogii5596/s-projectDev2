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
  // v0.2.5 H3 (#18): Sentry release — Vercel build-ийн commit (VITE_APP_RELEASE өгөөгүй бол)
  const release = env.VITE_APP_RELEASE || (env.VERCEL_GIT_COMMIT_SHA ? `s-project-web@${env.VERCEL_GIT_COMMIT_SHA.slice(0, 12)}` : '');

  return {
    define: { 'import.meta.env.VITE_APP_RELEASE': JSON.stringify(release) },
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
    // v0.2.2 Блок 6 (PIL-10): vendor сангууд тусдаа chunk — release бүрт апп-ын код л өөрчлөгдөж,
    // эдгээрийн hash хэвээр → утас cache-аас уншина. react/react-dom/react-query-г federation `shared` зохицуулна.
    build: {
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined
            if (id.includes('/@supabase/')) return 'vendor-supabase'
            if (id.includes('/react-router') || id.includes('/@remix-run/router/')) return 'vendor-router'
            if (id.includes('/i18next') || id.includes('/react-i18next/')) return 'vendor-i18n'
            if (id.includes('/axios/')) return 'vendor-axios'
            return undefined
          },
        },
      },
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
