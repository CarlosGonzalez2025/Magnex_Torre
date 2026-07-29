import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3002,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
        }
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          // Solo se agrupan a mano las librerías que SÍ hacen falta en el
          // arranque; así se cachean por separado y una nueva versión de la
          // aplicación no obliga a volver a descargarlas.
          //
          // Las pesadas (xlsx, exceljs, @react-pdf, leaflet) se dejan
          // deliberadamente fuera: solo se alcanzan desde vistas diferidas, y
          // Rollup ya las aísla en fragmentos asíncronos. Nombrarlas aquí las
          // incorporaba al grafo del punto de entrada y Vite acababa
          // precargándolas con <link rel="modulepreload">, que era justo lo
          // que se quería evitar.
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('@supabase')) return 'vendor-supabase';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) return 'vendor-react';
          },
        },
      },
    },
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
