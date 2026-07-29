/**
 * Configuración de Tailwind compilada en el build.
 *
 * Reemplaza al script https://cdn.tailwindcss.com que antes generaba los
 * estilos en el navegador: si ese dominio quedaba bloqueado por la red, una
 * extensión o el proxy, la aplicación entera se servía sin CSS. Ahora el CSS
 * viaja dentro de dist/assets y se sirve desde el propio dominio de Vercel.
 *
 * Los valores replican exactamente los que tenía el bloque `tailwind.config`
 * de index.html, para no alterar ni un estilo existente.
 */
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  // Rutas donde el compilador busca los nombres de clase. Todas las clases del
  // proyecto son literales estáticos (no hay `bg-${color}-500`), por lo que la
  // detección es completa y no hace falta safelist.
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './types.ts',
    './components/**/*.{js,ts,jsx,tsx}',
    './contexts/**/*.{js,ts,jsx,tsx}',
    './hooks/**/*.{js,ts,jsx,tsx}',
    './services/**/*.{js,ts,jsx,tsx}',
    './config/**/*.{js,ts,jsx,tsx}',
    './utils/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },
    },
  },
  plugins: [],
};
