import React, { useState } from 'react';
import { HelpCircle, X, BookOpen, Map, Bell, Users, Shield, Activity, BarChart3, Wrench } from 'lucide-react';

interface UserGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserGuide: React.FC<UserGuideProps> = ({ isOpen, onClose }) => {
  const [activeSection, setActiveSection] = useState<'intro' | 'modules' | 'alerts' | 'admin'>('intro');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-700 dark:to-cyan-700 p-6 rounded-t-2xl text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Guía de Usuario</h2>
                <p className="text-blue-100 text-sm">Sistema Magnex Torre - Control de Flota</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
          <div className="flex gap-2 p-2 overflow-x-auto">
            <button
              onClick={() => setActiveSection('intro')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                activeSection === 'intro'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              Introducción
            </button>
            <button
              onClick={() => setActiveSection('modules')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                activeSection === 'modules'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              Módulos
            </button>
            <button
              onClick={() => setActiveSection('alerts')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                activeSection === 'alerts'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              Sistema de Alertas
            </button>
            <button
              onClick={() => setActiveSection('admin')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                activeSection === 'admin'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              Administración
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeSection === 'intro' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">Bienvenido a Magnex Torre</h3>
                <p className="text-slate-600 dark:text-slate-400 mb-4">
                  Sistema integral de gestión y monitoreo de flotas en tiempo real. Magnex Torre integra datos de múltiples
                  plataformas GPS (Coltrack y Fagor) para proporcionar una vista unificada de su operación.
                </p>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                <h4 className="font-bold text-blue-900 dark:text-blue-200 mb-2 flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Características Principales
                </h4>
                <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-300">
                  <li>• Monitoreo en tiempo real de toda la flota</li>
                  <li>• Sistema de alertas automáticas (velocidad, ralentí, combustible)</li>
                  <li>• Integración con Coltrack y Fagor GPS</li>
                  <li>• Análisis y métricas avanzadas</li>
                  <li>• Gestión de conductores y contratos</li>
                  <li>• Historial completo de eventos</li>
                </ul>
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                <h4 className="font-bold text-amber-900 dark:text-amber-200 mb-2">⚡ Inicio Rápido</h4>
                <ol className="space-y-2 text-sm text-amber-800 dark:text-amber-300">
                  <li>1. <strong>Dashboard</strong>: Vista general con KPIs principales</li>
                  <li>2. <strong>Mapa en Vivo</strong>: Visualización geográfica de la flota</li>
                  <li>3. <strong>Centro de Alertas</strong>: Monitoreo de alertas críticas</li>
                  <li>4. <strong>Análisis</strong>: Métricas y tendencias detalladas</li>
                </ol>
              </div>

              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
                <h4 className="font-bold text-green-900 dark:text-green-200 mb-2">✓ Sistema Operativo</h4>
                <p className="text-sm text-green-800 dark:text-green-300">
                  El sistema actualiza automáticamente cada 5 segundos y mantiene un historial de alertas de 12 horas
                  (optimizado para turnos operativos).
                </p>
              </div>
            </div>
          )}

          {activeSection === 'modules' && (
            <div className="space-y-4">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Módulos del Sistema</h3>

              <ModuleCard
                icon={<Activity className="w-5 h-5 text-blue-600" />}
                title="Dashboard"
                description="Vista general con KPIs principales: vehículos activos, alertas críticas, velocidad promedio, combustible, contratos activos, conductores, eficiencia operativa."
                color="blue"
              />

              <ModuleCard
                icon={<Map className="w-5 h-5 text-green-600" />}
                title="Mapa en Vivo"
                description="Visualización geográfica en tiempo real de todos los vehículos. Incluye estado de cada vehículo (movimiento, detenido, idle), geocercas y rutas."
                color="green"
              />

              <ModuleCard
                icon={<Bell className="w-5 h-5 text-red-600" />}
                title="Centro de Alertas"
                description="Monitoreo de alertas automáticas: exceso de velocidad (>80 km/h), ralentí prolongado (>10 min), combustible bajo (<15%). Incluye sonido de alerta configurable."
                color="red"
              />

              <ModuleCard
                icon={<BarChart3 className="w-5 h-5 text-purple-600" />}
                title="Análisis y Métricas"
                description="Puntaje de seguridad, tendencias semanales, ranking de conductores, eficiencia operativa, distribución de alertas por tipo."
                color="purple"
              />

              <ModuleCard
                icon={<Users className="w-5 h-5 text-cyan-600" />}
                title="Gestión de Conductores"
                description="Registro de conductores, asignación a vehículos, historial de infracciones, puntajes de seguridad individuales."
                color="cyan"
              />

              <ModuleCard
                icon={<Wrench className="w-5 h-5 text-orange-600" />}
                title="Mantenimiento"
                description="Programación de mantenimientos preventivos, historial de servicios, alertas por kilometraje u horas de operación."
                color="orange"
              />
            </div>
          )}

          {activeSection === 'alerts' && (
            <div className="space-y-6">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Sistema de Alertas</h3>

              <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl p-5">
                <h4 className="font-bold text-red-900 dark:text-red-200 mb-3 flex items-center gap-2">
                  <Bell className="w-5 h-5" />
                  Tipos de Alertas
                </h4>

                <div className="space-y-3">
                  <AlertTypeCard
                    severity="Crítica"
                    severityColor="bg-red-500"
                    title="Exceso de Velocidad"
                    description="Se activa cuando un vehículo supera los 80 km/h"
                    action="Sonido de alerta + Notificación visual"
                  />

                  <AlertTypeCard
                    severity="Alta"
                    severityColor="bg-amber-500"
                    title="Ralentí Prolongado"
                    description="Vehículo encendido sin movimiento por más de 10 minutos"
                    action="Notificación visual + Registro en tiempo real"
                  />

                  <AlertTypeCard
                    severity="Media"
                    severityColor="bg-blue-500"
                    title="Combustible Bajo"
                    description="Nivel de combustible inferior al 15%"
                    action="Notificación visual"
                  />
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
                <h4 className="font-bold text-slate-900 dark:text-white mb-3">📋 Gestión de Alertas</h4>
                <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                  <p><strong>1. Detección Automática:</strong> El sistema detecta alertas cada 5 segundos</p>
                  <p><strong>2. Auto-Guardado:</strong> Todas las alertas se guardan automáticamente en la base de datos</p>
                  <p><strong>3. Planes de Acción:</strong> Puedes agregar planes de acción a las alertas guardadas</p>
                  <p><strong>4. Historial:</strong> Las alertas se mantienen por 12 horas en caché (turno operativo)</p>
                  <p><strong>5. Exportación:</strong> Exporta alertas a Excel para análisis externo</p>
                </div>
              </div>

              <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-5">
                <h4 className="font-bold text-purple-900 dark:text-purple-200 mb-3">🔊 Configuración de Sonido</h4>
                <p className="text-sm text-purple-800 dark:text-purple-300">
                  Puedes activar/desactivar el sonido de alertas desde el botón 🔔 en el header. El sonido se reproduce
                  solo para alertas críticas (exceso de velocidad).
                </p>
              </div>
            </div>
          )}

          {activeSection === 'admin' && (
            <div className="space-y-6">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Panel de Administración</h3>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-5">
                <h4 className="font-bold text-blue-900 dark:text-blue-200 mb-3 flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Gestión de Usuarios
                </h4>
                <p className="text-sm text-blue-800 dark:text-blue-300 mb-3">
                  Solo disponible para usuarios con rol de <strong>Administrador</strong>
                </p>

                <div className="space-y-2 text-sm text-blue-800 dark:text-blue-300">
                  <p><strong>Roles disponibles:</strong></p>
                  <ul className="ml-4 space-y-1">
                    <li>• <strong>Admin:</strong> Acceso completo a todos los módulos</li>
                    <li>• <strong>Operator:</strong> Monitoreo y gestión operativa</li>
                    <li>• <strong>Viewer:</strong> Solo visualización de datos</li>
                  </ul>
                </div>
              </div>

              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-5">
                <h4 className="font-bold text-green-900 dark:text-green-200 mb-3">✓ Funciones de Administrador</h4>
                <ul className="space-y-2 text-sm text-green-800 dark:text-green-300">
                  <li>• Crear nuevos usuarios del sistema</li>
                  <li>• Editar información y roles de usuarios</li>
                  <li>• Activar/desactivar cuentas</li>
                  <li>• Resetear contraseñas (envío de email)</li>
                  <li>• Visualizar últimos accesos</li>
                  <li>• Acceso a análisis avanzados</li>
                </ul>
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-5">
                <h4 className="font-bold text-amber-900 dark:text-amber-200 mb-3">⚙️ Configuración del Sistema</h4>
                <div className="space-y-2 text-sm text-amber-800 dark:text-amber-300">
                  <p><strong>Fuentes de Datos:</strong></p>
                  <ul className="ml-4 space-y-1">
                    <li>• Coltrack GPS (API primaria)</li>
                    <li>• Fagor FlotasNet (API secundaria)</li>
                    <li>• Google Sheets (Datos de contratos)</li>
                    <li>• Supabase (Base de datos principal)</li>
                  </ul>
                  <p className="mt-3"><strong>Actualización:</strong> Automática cada 5 segundos</p>
                  <p><strong>Retención de alertas:</strong> 12 horas en caché</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center justify-between text-sm">
            <div className="text-slate-600 dark:text-slate-400">
              <p>Sistema Magnex Torre v1.0</p>
              <p className="text-xs">Desarrollado para control de flota vehicular</p>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              Cerrar Guía
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper Components
interface ModuleCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}

const ModuleCard: React.FC<ModuleCardProps> = ({ icon, title, description, color }) => {
  const colorClasses = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    green: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    red: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    purple: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800',
    cyan: 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800',
    orange: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800',
  };

  return (
    <div className={`${colorClasses[color as keyof typeof colorClasses]} border rounded-xl p-4`}>
      <div className="flex items-start gap-3">
        <div className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
          {icon}
        </div>
        <div className="flex-1">
          <h4 className="font-bold text-slate-900 dark:text-white mb-1">{title}</h4>
          <p className="text-sm text-slate-600 dark:text-slate-400">{description}</p>
        </div>
      </div>
    </div>
  );
};

interface AlertTypeCardProps {
  severity: string;
  severityColor: string;
  title: string;
  description: string;
  action: string;
}

const AlertTypeCard: React.FC<AlertTypeCardProps> = ({ severity, severityColor, title, description, action }) => {
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
      <div className="flex items-start gap-3">
        <div className={`w-3 h-3 rounded-full mt-1 ${severityColor}`}></div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">{severity}</span>
            <span className="text-sm font-bold text-slate-900 dark:text-white">{title}</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">{description}</p>
          <p className="text-xs text-slate-500 dark:text-slate-500">→ {action}</p>
        </div>
      </div>
    </div>
  );
};

// Export Button Component
export const UserGuideButton: React.FC = () => {
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsGuideOpen(true)}
        className="p-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
        title="Guía de Usuario"
      >
        <HelpCircle className="w-5 h-5 text-slate-600 dark:text-slate-400" />
      </button>

      <UserGuide isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
    </>
  );
};
