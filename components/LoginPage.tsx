import React, { useState, FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export const LoginPage: React.FC = () => {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Si ya está autenticado, redirigir
  React.useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    // Validar campos
    if (!email || !password) {
      setError('Por favor ingrese email y contraseña');
      return;
    }

    try {
      setIsLoading(true);

      const result = await login(email, password);

      if (result.success) {
        // Redirigir al dashboard
        navigate('/');
      } else {
        setError(result.error || 'Error al iniciar sesión');
      }
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Logo y título */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            Magnex Torre
          </h1>
          <p className="text-gray-400">
            Sistema de Control de Flota
          </p>
        </div>

        {/* Formulario de login */}
        <div className="bg-gray-800 rounded-lg shadow-xl p-8 border border-gray-700">
          <h2 className="text-2xl font-semibold text-white mb-6">
            Iniciar Sesión
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-300 mb-2"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="usuario@magnex.com"
                disabled={isLoading}
                autoComplete="email"
                required
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-300 mb-2"
              >
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="••••••••"
                disabled={isLoading}
                autoComplete="current-password"
                required
              />
            </div>

            {/* Error message */}
            {error && (
              <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg">
                <p className="text-sm">{error}</p>
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition duration-200 flex items-center justify-center"
            >
              {isLoading ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Iniciando sesión...
                </>
              ) : (
                'Ingresar'
              )}
            </button>
          </form>

          {/* Footer info */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-400">
              Usuario por defecto: <span className="text-blue-400">admin@magnex.com</span>
            </p>
            <p className="text-sm text-gray-400 mt-1">
              Contraseña: <span className="text-blue-400">Admin123!</span>
            </p>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-8 text-center">
          <p className="text-gray-500 text-sm">
            &copy; 2026 Magnex. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </div>
  );
};
