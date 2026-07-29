import React from 'react';
import ReactDOM from 'react-dom/client';
// Estilos compilados en el build (Tailwind + Leaflet + ajustes propios).
// Antes llegaban por CDN externo en runtime; ahora viajan en el bundle.
import './index.css';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AuthProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </AuthProvider>
  </React.StrictMode>
);