import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff, Truck, Lock, Mail, User, AlertCircle, CheckCircle } from 'lucide-react';

type AuthMode = 'login' | 'register';

export const Login: React.FC = () => {
    const { login, register, isLoading } = useAuth();
    const [mode, setMode] = useState<AuthMode>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (mode === 'login') {
            const result = await login(email, password);
            if (!result.success) {
                setError(result.error || 'Error al iniciar sesión');
            }
        } else {
            if (!name.trim()) {
                setError('El nombre es requerido');
                return;
            }
            const result = await register(email, password, name);
            if (!result.success) {
                setError(result.error || 'Error al registrar');
            } else {
                setSuccess('Cuenta creada exitosamente');
                setMode('login');
            }
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4">
            {/* Background Pattern */}
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-50"></div>

            <div className="relative w-full max-w-md">
                {/* Logo Section */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 shadow-2xl shadow-blue-500/30 mb-4">
                        <Truck className="w-10 h-10 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2">Torre de Control</h1>
                    <p className="text-blue-200/70">Sistema de Gestión de Flotas</p>
                </div>

                {/* Login Card */}
                <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 shadow-2xl p-8">
                    <h2 className="text-xl font-semibold text-white text-center mb-6">
                        {mode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}
                    </h2>

                    {/* Error Message */}
                    {error && (
                        <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-200">
                            <AlertCircle className="w-5 h-5 flex-shrink-0" />
                            <span className="text-sm">{error}</span>
                        </div>
                    )}

                    {/* Success Message */}
                    {success && (
                        <div className="mb-4 p-3 bg-green-500/20 border border-green-500/30 rounded-lg flex items-center gap-2 text-green-200">
                            <CheckCircle className="w-5 h-5 flex-shrink-0" />
                            <span className="text-sm">{success}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Name Input (Register only) */}
                        {mode === 'register' && (
                            <div>
                                <label htmlFor="name" className="block text-sm font-medium text-blue-100 mb-2">
                                    Nombre Completo
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <User className="w-5 h-5 text-blue-300/60" />
                                    </div>
                                    <input
                                        id="name"
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Juan Pérez"
                                        className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-200/50 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent transition-all"
                                        required={mode === 'register'}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Email Input */}
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-blue-100 mb-2">
                                Correo Electrónico
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Mail className="w-5 h-5 text-blue-300/60" />
                                </div>
                                <input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="usuario@empresa.com"
                                    className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-200/50 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent transition-all"
                                    required
                                />
                            </div>
                        </div>

                        {/* Password Input */}
                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-blue-100 mb-2">
                                Contraseña
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Lock className="w-5 h-5 text-blue-300/60" />
                                </div>
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full pl-10 pr-12 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-200/50 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-transparent transition-all"
                                    required
                                    minLength={6}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                                >
                                    {showPassword ? (
                                        <EyeOff className="w-5 h-5 text-blue-300/60 hover:text-blue-200 transition-colors" />
                                    ) : (
                                        <Eye className="w-5 h-5 text-blue-300/60 hover:text-blue-200 transition-colors" />
                                    )}
                                </button>
                            </div>
                            {mode === 'register' && (
                                <p className="mt-1 text-xs text-blue-200/50">Mínimo 6 caracteres</p>
                            )}
                        </div>

                        {/* Remember Me / Forgot Password */}
                        {mode === 'login' && (
                            <div className="flex items-center justify-between text-sm">
                                <label className="flex items-center gap-2 text-blue-200/70 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-400/50"
                                    />
                                    Recordarme
                                </label>
                                <button
                                    type="button"
                                    className="text-blue-300 hover:text-blue-200 transition-colors"
                                >
                                    ¿Olvidaste tu contraseña?
                                </button>
                            </div>
                        )}

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/30 transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
                        >
                            {isLoading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    Procesando...
                                </>
                            ) : mode === 'login' ? (
                                'Iniciar Sesión'
                            ) : (
                                'Crear Cuenta'
                            )}
                        </button>
                    </form>

                    {/* Toggle Mode */}
                    <div className="mt-6 text-center text-sm text-blue-200/70">
                        {mode === 'login' ? (
                            <>
                                ¿No tienes cuenta?{' '}
                                <button
                                    onClick={() => {
                                        setMode('register');
                                        setError('');
                                        setSuccess('');
                                    }}
                                    className="text-blue-300 hover:text-blue-200 font-medium transition-colors"
                                >
                                    Regístrate aquí
                                </button>
                            </>
                        ) : (
                            <>
                                ¿Ya tienes cuenta?{' '}
                                <button
                                    onClick={() => {
                                        setMode('login');
                                        setError('');
                                        setSuccess('');
                                    }}
                                    className="text-blue-300 hover:text-blue-200 font-medium transition-colors"
                                >
                                    Inicia sesión
                                </button>
                            </>
                        )}
                    </div>

                    {/* Demo Hint */}
                    <div className="mt-6 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                        <p className="text-xs text-amber-200/80 text-center">
                            <strong>Modo Demo:</strong> Usa cualquier email y contraseña (mín. 6 caracteres) para acceder.
                            Incluye "admin" en el email para rol de administrador.
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <p className="mt-8 text-center text-sm text-blue-200/50">
                    © {new Date().getFullYear()} Torre de Control. Todos los derechos reservados.
                </p>
            </div>
        </div>
    );
};

export default Login;
