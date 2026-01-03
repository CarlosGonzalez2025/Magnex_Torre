import React, { useState } from 'react';
import {
    Home,
    LayoutDashboard,
    Map as MapIcon,
    Bell,
    History,
    Database,
    BarChart3,
    ClipboardCheck,
    Calendar,
    Users,
    MapPin,
    Settings,
    X,
    LogOut,
    User as UserIcon,
    ChevronDown,
    ChevronRight,
    Activity,
    AlertTriangle,
    Wrench,
    Shield
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export type TabType = 'dashboard' | 'table' | 'map' | 'alerts' | 'history' | 'saved' | 'analytics' | 'inspections' | 'schedules' | 'drivers' | 'geofences' | 'users' | 'maintenance';

interface SidebarProps {
    activeTab: TabType;
    setActiveTab: (tab: TabType) => void;
    isOpen: boolean;
    onClose: () => void;
    criticalAlertsCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
    activeTab,
    setActiveTab,
    isOpen,
    onClose,
    criticalAlertsCount
}) => {
    const { user, logout } = useAuth();

    // Estado para controlar qué grupos están expandidos
    const [expandedGroups, setExpandedGroups] = useState<string[]>(['monitoring', 'alerts', 'management', 'admin']);

    // Definición de grupos de menú
    const menuGroups = [
        {
            id: 'monitoring',
            label: 'Monitoreo',
            icon: Activity,
            items: [
                { id: 'dashboard', label: 'Dashboard', icon: Home },
                { id: 'table', label: 'Tabla de Flota', icon: LayoutDashboard },
                { id: 'map', label: 'Mapa en Vivo', icon: MapIcon },
            ]
        },
        {
            id: 'alerts',
            label: 'Alertas',
            icon: AlertTriangle,
            items: [
                { id: 'alerts', label: 'Centro de Alertas', icon: Bell, badge: criticalAlertsCount },
                { id: 'history', label: 'Historial', icon: History },
                { id: 'saved', label: 'Auto-Guardadas', icon: Database },
            ]
        },
        {
            id: 'management',
            label: 'Gestión',
            icon: Wrench,
            items: [
                { id: 'drivers', label: 'Conductores', icon: Users },
                { id: 'geofences', label: 'Geocercas', icon: MapPin },
                { id: 'inspections', label: 'Inspecciones', icon: ClipboardCheck },
                { id: 'schedules', label: 'Cronogramas', icon: Calendar },
                { id: 'maintenance', label: 'Mantenimiento', icon: Settings },
            ]
        },
    ];

    // Grupo de administración (solo para admins)
    const adminGroup = user?.role === 'admin' ? {
        id: 'admin',
        label: 'Administración',
        icon: Shield,
        items: [
            { id: 'users', label: 'Usuarios', icon: UserIcon },
            { id: 'analytics', label: 'Análisis', icon: BarChart3 },
        ]
    } : null;

    const allGroups = adminGroup ? [...menuGroups, adminGroup] : menuGroups;

    const handleTabClick = (id: string) => {
        setActiveTab(id as TabType);
        if (window.innerWidth < 1024) { // Close on mobile click
            onClose();
        }
    };

    const toggleGroup = (groupId: string) => {
        setExpandedGroups(prev =>
            prev.includes(groupId)
                ? prev.filter(id => id !== groupId)
                : [...prev, groupId]
        );
    };

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden"
                    onClick={onClose}
                />
            )}

            {/* Sidebar Container */}
            <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        flex flex-col h-full shadow-xl lg:shadow-none
      `}>

                {/* Header Logo Area */}
                <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 h-16">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                            <span className="text-white font-bold text-lg">M</span>
                        </div>
                        <span className="text-lg font-bold text-slate-800 dark:text-white tracking-tight">Magnex</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="lg:hidden p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Navigation Items */}
                <div className="flex-1 overflow-y-auto py-4 px-3 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
                    <nav className="space-y-2">
                        {allGroups.map((group) => {
                            const GroupIcon = group.icon;
                            const isExpanded = expandedGroups.includes(group.id);

                            return (
                                <div key={group.id} className="space-y-1">
                                    {/* Group Header */}
                                    <button
                                        onClick={() => toggleGroup(group.id)}
                                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
                                    >
                                        <div className="flex items-center gap-2">
                                            <GroupIcon className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                                            <span className="text-xs font-semibold uppercase tracking-wider">{group.label}</span>
                                        </div>
                                        {isExpanded ? (
                                            <ChevronDown className="w-4 h-4 text-slate-400" />
                                        ) : (
                                            <ChevronRight className="w-4 h-4 text-slate-400" />
                                        )}
                                    </button>

                                    {/* Group Items */}
                                    {isExpanded && (
                                        <div className="ml-2 space-y-1">
                                            {group.items.map((item) => {
                                                const ItemIcon = item.icon;
                                                const isActive = activeTab === item.id;

                                                return (
                                                    <button
                                                        key={item.id}
                                                        onClick={() => handleTabClick(item.id)}
                                                        className={`
                                                            w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all duration-200 group
                                                            ${isActive
                                                                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium shadow-sm'
                                                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
                                                            }
                                                        `}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <ItemIcon className={`w-4 h-4 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300'}`} />
                                                            <span className="text-sm">{item.label}</span>
                                                        </div>
                                                        {item.badge && item.badge > 0 && (
                                                            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-sm">
                                                                {item.badge}
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </nav>
                </div>

                {/* User Footer */}
                <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                            <UserIcon className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                                {user?.name || 'Usuario'}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                {user?.email}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={logout}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                        <LogOut className="w-4 h-4" />
                        <span>Cerrar Sesión</span>
                    </button>
                </div>
            </aside>
        </>
    );
};
