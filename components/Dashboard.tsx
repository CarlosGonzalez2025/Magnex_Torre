import React, { useState, useEffect, useMemo } from 'react';
import {
    Truck,
    AlertTriangle,
    ClipboardCheck,
    TrendingUp,
    MapPin,
    Clock,
    Users,
    Activity,
    ArrowUpRight,
    ArrowDownRight,
    Bell,
    Calendar,
    Fuel,
    Gauge,
} from 'lucide-react';
import { Vehicle, Alert, VehicleStatus } from '../types';
import { getAlertStatistics } from '../services/databaseService';

interface DashboardProps {
    vehicles: Vehicle[];
    alerts: Alert[];
    onNavigate?: (tab: string) => void;
}

interface StatCardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: React.ReactNode;
    trend?: { value: number; isPositive: boolean };
    color: 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'cyan';
    onClick?: () => void;
}

const StatCard: React.FC<StatCardProps> = ({
    title,
    value,
    subtitle,
    icon,
    trend,
    color,
    onClick,
}) => {
    const colorClasses = {
        blue: 'bg-blue-500 dark:bg-blue-600',
        green: 'bg-green-500 dark:bg-green-600',
        amber: 'bg-amber-500 dark:bg-amber-600',
        red: 'bg-red-500 dark:bg-red-600',
        purple: 'bg-purple-500 dark:bg-purple-600',
        cyan: 'bg-cyan-500 dark:bg-cyan-600',
    };

    const lightColorClasses = {
        blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
        green: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
        amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
        red: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
        purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
        cyan: 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400',
    };

    return (
        <div
            onClick={onClick}
            className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm hover:shadow-md transition-all ${onClick ? 'cursor-pointer hover:border-blue-300 dark:hover:border-blue-600' : ''
                }`}
        >
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
                    <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{value}</p>
                    {subtitle && (
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{subtitle}</p>
                    )}
                    {trend && (
                        <div className="flex items-center gap-1 mt-2">
                            {trend.isPositive ? (
                                <ArrowUpRight className="w-4 h-4 text-green-500" />
                            ) : (
                                <ArrowDownRight className="w-4 h-4 text-red-500" />
                            )}
                            <span
                                className={`text-sm font-medium ${trend.isPositive ? 'text-green-600' : 'text-red-600'
                                    }`}
                            >
                                {trend.value}%
                            </span>
                            <span className="text-xs text-slate-400">vs ayer</span>
                        </div>
                    )}
                </div>
                <div className={`p-3 rounded-xl ${lightColorClasses[color]}`}>{icon}</div>
            </div>
        </div>
    );
};

export const Dashboard: React.FC<DashboardProps> = ({ vehicles, alerts, onNavigate }) => {
    const [stats, setStats] = useState<any>(null);

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        const result = await getAlertStatistics();
        if (result.success && result.data) {
            setStats(result.data);
        }
    };

    // Vehicle statistics
    const vehicleStats = useMemo(() => {
        const total = vehicles.length;
        const moving = vehicles.filter((v) => v.status === VehicleStatus.MOVING).length;
        const stopped = vehicles.filter((v) => v.status === VehicleStatus.STOPPED).length;
        const idle = vehicles.filter((v) => v.status === VehicleStatus.IDLE).length;
        const off = vehicles.filter((v) => v.status === VehicleStatus.OFF).length;
        const avgSpeed = total > 0 ? Math.round(vehicles.reduce((acc, v) => acc + v.speed, 0) / total) : 0;
        const avgFuel = total > 0 ? Math.round(vehicles.reduce((acc, v) => acc + v.fuelLevel, 0) / total) : 0;

        return { total, moving, stopped, idle, off, avgSpeed, avgFuel };
    }, [vehicles]);

    // Alert statistics
    const alertStats = useMemo(() => {
        const critical = alerts.filter((a) => a.severity === 'critical').length;
        const high = alerts.filter((a) => a.severity === 'high').length;
        const pending = alerts.filter((a) => !a.sent).length;
        const today = alerts.filter(
            (a) => new Date(a.timestamp).toDateString() === new Date().toDateString()
        ).length;

        return { critical, high, pending, today };
    }, [alerts]);

    // Recent alerts (last 5)
    const recentAlerts = useMemo(() => {
        return [...alerts]
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 5);
    }, [alerts]);

    // Top vehicles by alerts
    const topAlertVehicles = useMemo(() => {
        const vehicleAlerts: Record<string, number> = {};
        alerts.forEach((a) => {
            vehicleAlerts[a.plate] = (vehicleAlerts[a.plate] || 0) + 1;
        });

        return Object.entries(vehicleAlerts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([plate, count]) => ({ plate, count }));
    }, [alerts]);

    return (
        <div className="space-y-6">
            {/* Welcome Banner */}
            <div className="bg-gradient-to-r from-blue-600 to-cyan-500 dark:from-blue-700 dark:to-cyan-600 rounded-2xl p-6 text-white shadow-lg">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold">Bienvenido a Torre de Control</h1>
                        <p className="text-blue-100 mt-1">
                            Última actualización: {new Date().toLocaleTimeString()}
                        </p>
                    </div>
                    <div className="hidden md:flex items-center gap-4">
                        <div className="text-right">
                            <p className="text-sm text-blue-100">Vehículos Monitoreados</p>
                            <p className="text-3xl font-bold">{vehicleStats.total}</p>
                        </div>
                        <div className="w-16 h-16 bg-white/20 rounded-xl flex items-center justify-center">
                            <Truck className="w-8 h-8" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    title="Vehículos Activos"
                    value={vehicleStats.moving}
                    subtitle={`${vehicleStats.idle} en ralentí`}
                    icon={<Truck className="w-6 h-6" />}
                    color="green"
                    onClick={() => onNavigate?.('table')}
                />
                <StatCard
                    title="Alertas Críticas"
                    value={alertStats.critical}
                    subtitle={`${alertStats.today} alertas hoy`}
                    icon={<AlertTriangle className="w-6 h-6" />}
                    color="red"
                    onClick={() => onNavigate?.('alerts')}
                />
                <StatCard
                    title="Velocidad Promedio"
                    value={`${vehicleStats.avgSpeed} km/h`}
                    icon={<Gauge className="w-6 h-6" />}
                    color="blue"
                />
                <StatCard
                    title="Combustible Promedio"
                    value={`${vehicleStats.avgFuel}%`}
                    icon={<Fuel className="w-6 h-6" />}
                    color="amber"
                />
            </div>

            {/* Secondary Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Fleet Status */}
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                        <Activity className="w-5 h-5 text-blue-500" />
                        Estado de la Flota
                    </h3>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                <span className="text-sm text-slate-600 dark:text-slate-400">En Movimiento</span>
                            </div>
                            <span className="font-semibold text-slate-900 dark:text-white">
                                {vehicleStats.moving}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                                <span className="text-sm text-slate-600 dark:text-slate-400">Encendidos (Idle)</span>
                            </div>
                            <span className="font-semibold text-slate-900 dark:text-white">
                                {vehicleStats.idle}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                <span className="text-sm text-slate-600 dark:text-slate-400">Detenidos</span>
                            </div>
                            <span className="font-semibold text-slate-900 dark:text-white">
                                {vehicleStats.stopped}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-slate-400"></div>
                                <span className="text-sm text-slate-600 dark:text-slate-400">Apagados</span>
                            </div>
                            <span className="font-semibold text-slate-900 dark:text-white">
                                {vehicleStats.off}
                            </span>
                        </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                        <div className="flex h-2 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700">
                            <div
                                className="bg-green-500"
                                style={{ width: `${(vehicleStats.moving / vehicleStats.total) * 100}%` }}
                            ></div>
                            <div
                                className="bg-amber-500"
                                style={{ width: `${(vehicleStats.idle / vehicleStats.total) * 100}%` }}
                            ></div>
                            <div
                                className="bg-red-500"
                                style={{ width: `${(vehicleStats.stopped / vehicleStats.total) * 100}%` }}
                            ></div>
                            <div
                                className="bg-slate-400"
                                style={{ width: `${(vehicleStats.off / vehicleStats.total) * 100}%` }}
                            ></div>
                        </div>
                    </div>
                </div>

                {/* Recent Alerts */}
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                            <Bell className="w-5 h-5 text-red-500" />
                            Alertas Recientes
                        </h3>
                        <button
                            onClick={() => onNavigate?.('alerts')}
                            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        >
                            Ver todas
                        </button>
                    </div>
                    <div className="space-y-3">
                        {recentAlerts.length > 0 ? (
                            recentAlerts.map((alert, index) => (
                                <div
                                    key={alert.id || index}
                                    className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                                >
                                    <div
                                        className={`w-2 h-2 rounded-full mt-2 ${alert.severity === 'critical'
                                                ? 'bg-red-500'
                                                : alert.severity === 'high'
                                                    ? 'bg-amber-500'
                                                    : 'bg-blue-500'
                                            }`}
                                    ></div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                                            {alert.type}
                                        </p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            {alert.plate} • {new Date(alert.timestamp).toLocaleTimeString()}
                                        </p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">
                                No hay alertas recientes
                            </p>
                        )}
                    </div>
                </div>

                {/* Top Alert Vehicles */}
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-purple-500" />
                        Vehículos con Más Alertas
                    </h3>
                    <div className="space-y-3">
                        {topAlertVehicles.length > 0 ? (
                            topAlertVehicles.map((item, index) => (
                                <div key={item.plate} className="flex items-center gap-3">
                                    <span
                                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${index === 0
                                                ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                                                : index === 1
                                                    ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                                                    : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                                            }`}
                                    >
                                        {index + 1}
                                    </span>
                                    <span className="flex-1 text-sm font-medium text-slate-900 dark:text-white">
                                        {item.plate}
                                    </span>
                                    <span className="text-sm text-slate-500 dark:text-slate-400">
                                        {item.count} alertas
                                    </span>
                                </div>
                            ))
                        ) : (
                            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">
                                Sin datos de alertas
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                    Acciones Rápidas
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <button
                        onClick={() => onNavigate?.('map')}
                        className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border border-blue-100 dark:border-blue-800 hover:shadow-md transition-all text-center"
                    >
                        <MapPin className="w-6 h-6 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
                        <span className="text-sm font-medium text-slate-900 dark:text-white">Ver Mapa</span>
                    </button>
                    <button
                        onClick={() => onNavigate?.('inspections')}
                        className="p-4 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-100 dark:border-green-800 hover:shadow-md transition-all text-center"
                    >
                        <ClipboardCheck className="w-6 h-6 text-green-600 dark:text-green-400 mx-auto mb-2" />
                        <span className="text-sm font-medium text-slate-900 dark:text-white">Inspecciones</span>
                    </button>
                    <button
                        onClick={() => onNavigate?.('schedules')}
                        className="p-4 rounded-xl bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border border-purple-100 dark:border-purple-800 hover:shadow-md transition-all text-center"
                    >
                        <Calendar className="w-6 h-6 text-purple-600 dark:text-purple-400 mx-auto mb-2" />
                        <span className="text-sm font-medium text-slate-900 dark:text-white">Cronogramas</span>
                    </button>
                    <button
                        onClick={() => onNavigate?.('analytics')}
                        className="p-4 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-100 dark:border-amber-800 hover:shadow-md transition-all text-center"
                    >
                        <TrendingUp className="w-6 h-6 text-amber-600 dark:text-amber-400 mx-auto mb-2" />
                        <span className="text-sm font-medium text-slate-900 dark:text-white">Análisis</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
