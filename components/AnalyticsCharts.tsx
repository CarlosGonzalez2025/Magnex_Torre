import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

// --- TREND CHART (Bar Chart) - IMPROVED ---

interface TrendData {
    label: string; // e.g., "Lun 7/12", "Mar 8/12"
    total: number;
    critical: number;
    idle?: number; // Idle time in hours
}

interface TrendChartProps {
    data: TrendData[];
    title?: string;
    height?: number;
    showIdle?: boolean;
}

// Helper to shorten date labels
const shortenLabel = (label: string): string => {
    // If label is like "Lun 7/12", shorten to "L7" or "7"
    const parts = label.split(' ');
    if (parts.length >= 2) {
        const dayPart = parts[1].split('/')[0]; // Get day number
        const weekDay = parts[0].charAt(0).toUpperCase(); // First letter of weekday
        return `${weekDay}${dayPart}`;
    }
    // If already short (like "Sem 1"), return first char + number
    if (label.length > 4) {
        return label.slice(0, 3);
    }
    return label;
};

export const TrendChart: React.FC<TrendChartProps> = ({ data, title, height = 220, showIdle = false }) => {
    const maxAlerts = Math.max(...data.map(d => d.total), 1);
    const maxIdle = showIdle ? Math.max(...data.map(d => d.idle || 0), 1) : 1;

    // Calculate totals for display
    const totalAlerts = data.reduce((sum, d) => sum + d.total, 0);
    const totalCritical = data.reduce((sum, d) => sum + d.critical, 0);
    const totalIdle = data.reduce((sum, d) => sum + (d.idle || 0), 0);

    return (
        <div className="w-full">
            {title && <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">{title}</h4>}

            {/* Chart Container */}
            <div className="w-full flex items-end justify-around gap-1 sm:gap-2 px-2" style={{ height: `${height}px` }}>
                {data.map((item, index) => {
                    const alertHeightPercent = Math.max((item.total / maxAlerts) * 100, item.total > 0 ? 8 : 0);
                    const criticalPercent = item.total > 0 ? (item.critical / item.total) * 100 : 0;
                    const idleHeightPercent = showIdle ? Math.max(((item.idle || 0) / maxIdle) * 100, (item.idle || 0) > 0 ? 8 : 0) : 0;
                    const shortLabel = shortenLabel(item.label);

                    return (
                        <div key={index} className="flex flex-col items-center flex-1 min-w-0 max-w-[50px] group relative">
                            {/* Tooltip */}
                            <div className="absolute bottom-full mb-3 opacity-0 group-hover:opacity-100 transition-all duration-200 bg-slate-900 text-white text-xs py-2 px-3 rounded-xl pointer-events-none whitespace-nowrap z-20 shadow-xl transform group-hover:scale-100 scale-95">
                                <div className="font-bold mb-1.5 text-sm border-b border-slate-700 pb-1">{item.label}</div>
                                <div className="flex items-center gap-2 py-0.5">
                                    <span className="w-2.5 h-2.5 bg-blue-400 rounded-full shadow-sm"></span>
                                    <span>Alertas: <strong>{item.total}</strong></span>
                                </div>
                                <div className="flex items-center gap-2 py-0.5">
                                    <span className="w-2.5 h-2.5 bg-red-500 rounded-full shadow-sm"></span>
                                    <span>Críticas: <strong>{item.critical}</strong></span>
                                </div>
                                {showIdle && item.idle !== undefined && (
                                    <div className="flex items-center gap-2 py-0.5">
                                        <span className="w-2.5 h-2.5 bg-amber-500 rounded-full shadow-sm"></span>
                                        <span>Ralentí: <strong>{(item.idle).toFixed(1)}h</strong></span>
                                    </div>
                                )}
                                {/* Tooltip arrow */}
                                <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-transparent border-t-slate-900"></div>
                            </div>

                            {/* Bars Container */}
                            <div className="flex gap-1 w-full justify-center h-full items-end">
                                {/* Alert Bar */}
                                <div
                                    className="w-5 sm:w-6 bg-gradient-to-t from-blue-500 to-blue-400 rounded-t-md relative overflow-hidden transition-all duration-500 hover:brightness-110 shadow-sm cursor-pointer"
                                    style={{ height: `${alertHeightPercent}%`, minHeight: item.total > 0 ? '8px' : '0' }}
                                >
                                    {/* Critical overlay with gradient */}
                                    <div
                                        className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-red-600 to-red-500 w-full transition-all duration-500"
                                        style={{ height: `${criticalPercent}%` }}
                                    ></div>
                                    {/* Shine effect */}
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                </div>

                                {/* Idle Bar */}
                                {showIdle && (
                                    <div
                                        className="w-5 sm:w-6 bg-gradient-to-t from-amber-500 to-amber-400 rounded-t-md relative overflow-hidden transition-all duration-500 hover:brightness-110 shadow-sm cursor-pointer"
                                        style={{ height: `${idleHeightPercent}%`, minHeight: (item.idle || 0) > 0 ? '8px' : '0' }}
                                    >
                                        {/* Shine effect */}
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    </div>
                                )}
                            </div>

                            {/* Shortened Label */}
                            <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-2 font-semibold w-full text-center">
                                {shortLabel}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* Enhanced Legend with cards */}
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 mt-5 px-2">
                <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-full">
                    <div className="w-3 h-3 bg-gradient-to-br from-blue-400 to-blue-500 rounded-sm shadow-sm"></div>
                    <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Alertas</span>
                    <span className="text-xs font-bold text-blue-800 dark:text-blue-200">{totalAlerts}</span>
                </div>
                <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded-full">
                    <div className="w-3 h-3 bg-gradient-to-br from-red-500 to-red-600 rounded-sm shadow-sm"></div>
                    <span className="text-xs font-medium text-red-700 dark:text-red-300">Críticas</span>
                    <span className="text-xs font-bold text-red-800 dark:text-red-200">{totalCritical}</span>
                </div>
                {showIdle && (
                    <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 rounded-full">
                        <div className="w-3 h-3 bg-gradient-to-br from-amber-400 to-amber-500 rounded-sm shadow-sm"></div>
                        <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Ralentí</span>
                        <span className="text-xs font-bold text-amber-800 dark:text-amber-200">{totalIdle.toFixed(1)}h</span>
                    </div>
                )}
            </div>
        </div>
    );
};



// --- DONUT CHART ---

interface DonutSegment {
    name: string;
    value: number;
    color: string;
}

interface DonutChartProps {
    data: DonutSegment[];
    size?: number;
    thickness?: number;
}

export const DonutChart: React.FC<DonutChartProps> = ({ data, size = 160, thickness = 20 }) => {
    const total = data.reduce((sum, item) => sum + item.value, 0);
    const radius = (size - thickness) / 2;
    const circumference = 2 * Math.PI * radius;
    let accumulatedOffset = 0;

    if (total === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-4">
                <div className="rounded-full border-4 border-slate-100 flex items-center justify-center text-slate-400 text-xs" style={{ width: size, height: size }}>
                    Sin datos
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center">
            <div className="relative" style={{ width: size, height: size }}>
                <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
                    {data.map((segment, index) => {
                        const strokeDasharray = `${(segment.value / total) * circumference} ${circumference}`;
                        const strokeDashoffset = -accumulatedOffset;
                        accumulatedOffset += (segment.value / total) * circumference;

                        return (
                            <circle
                                key={index}
                                r={radius}
                                cx={size / 2}
                                cy={size / 2}
                                fill="transparent"
                                stroke={segment.color}
                                strokeWidth={thickness}
                                strokeDasharray={strokeDasharray}
                                strokeDashoffset={strokeDashoffset}
                                className="transition-all duration-1000 ease-out"
                            />
                        );
                    })}
                </svg>
                {/* Center Text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-bold text-slate-800">{total}</span>
                    <span className="text-xs text-slate-500 uppercase font-semibold">Total</span>
                </div>
            </div>

            {/* Legend */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-6">
                {data.map((item, index) => (
                    <div key={index} className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></span>
                        <span className="text-sm text-slate-600">{item.name}</span>
                        <span className="text-xs text-slate-400 font-medium ml-auto">{Math.round((item.value / total) * 100)}%</span>
                    </div>
                ))}
            </div>
        </div>
    );
};


// --- SCORE GAUGE ---

interface ScoreGaugeProps {
    score: number; // 0 to 100
    label?: string;
    size?: number;
}

export const ScoreGauge: React.FC<ScoreGaugeProps> = ({ score, label = "Score", size = 120 }) => {
    // Score color logic
    const getColor = (s: number) => {
        if (s >= 90) return '#22c55e'; // Green 500
        if (s >= 70) return '#eab308'; // Yellow 500
        if (s >= 50) return '#f97316'; // Orange 500
        return '#ef4444'; // Red 500
    };

    const color = getColor(score);
    const radius = 45;
    const circumference = 2 * Math.PI * radius;
    // We only want a semi-circle (current * 0.5)
    // Actually for a full circle gauge that fills up to score:
    const dashOffset = circumference - ((score / 100) * circumference);

    return (
        <div className="flex flex-col items-center relative">
            <svg width={size} height={size} viewBox="0 0 120 120">
                {/* Background Circle */}
                <circle
                    cx="60"
                    cy="60"
                    r={radius}
                    fill="none"
                    stroke="#f1f5f9" // Slate 100
                    strokeWidth="10"
                />
                {/* Progress Circle */}
                <circle
                    cx="60"
                    cy="60"
                    r={radius}
                    fill="none"
                    stroke={color}
                    strokeWidth="10"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out transform -rotate-90 origin-center"
                />

            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold" style={{ color }}>{Math.round(score)}</span>
                <span className="text-xs text-slate-400 uppercase tracking-wider">{label}</span>
            </div>
        </div>
    );
}

// --- EFFICIENCY BAR ---

interface EfficiencyProps {
    moving: number;
    idle: number;
    stopped: number;
}

export const EfficiencyBar: React.FC<EfficiencyProps> = ({ moving, idle, stopped }) => {
    const total = moving + idle + stopped;
    if (total === 0) return null;

    const movingPct = (moving / total) * 100;
    const idlePct = (idle / total) * 100;
    const stoppedPct = (stopped / total) * 100;

    return (
        <div className="w-full">
            <div className="flex justify-between text-xs mb-2 font-medium text-slate-500">
                <span>Eficiencia de Flota</span>
                <span>{total} Vehículos</span>
            </div>
            <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden flex">
                <div
                    className="h-full bg-green-500 transition-all duration-700 hover:opacity-90 relative group"
                    style={{ width: `${movingPct}%` }}
                >
                    <div className="opacity-0 group-hover:opacity-100 absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                        En movimiento: {moving}
                    </div>
                </div>
                <div
                    className="h-full bg-orange-400 transition-all duration-700 hover:opacity-90 relative group"
                    style={{ width: `${idlePct}%` }}
                >
                    <div className="opacity-0 group-hover:opacity-100 absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                        Ralentí: {idle}
                    </div>
                </div>
                <div
                    className="h-full bg-slate-300 transition-all duration-700 hover:opacity-90 relative group"
                    style={{ width: `${stoppedPct}%` }}
                >
                    <div className="opacity-0 group-hover:opacity-100 absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                        Detenido: {stopped}
                    </div>
                </div>
            </div>

            <div className="flex justify-between mt-2 text-xs text-slate-500">
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500"></div>{Math.round(movingPct)}% Mov.</div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-orange-400"></div>{Math.round(idlePct)}% Ralentí</div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-slate-300"></div>{Math.round(stoppedPct)}% Stop</div>
            </div>
        </div>
    );
}

// --- TREND INSIGHTS CARDS ---

interface TrendInsight {
    label: string;
    value: string | number;
    change?: number; // percentage change vs previous period
    changeLabel?: string;
    icon?: 'up' | 'down' | 'neutral';
    color?: 'green' | 'red' | 'amber' | 'blue' | 'slate';
}

interface TrendInsightsProps {
    insights: TrendInsight[];
}

export const TrendInsights: React.FC<TrendInsightsProps> = ({ insights }) => {
    const getColorClasses = (color?: string, isPositive?: boolean) => {
        if (color === 'green') return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
        if (color === 'red') return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
        if (color === 'amber') return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800';
        if (color === 'blue') return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
        return 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700';
    };

    const getIconColor = (icon?: string) => {
        if (icon === 'up') return 'text-red-500';
        if (icon === 'down') return 'text-green-500';
        return 'text-slate-400';
    };

    const renderChangeIcon = (icon?: string) => {
        if (icon === 'up') {
            return (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
            );
        }
        if (icon === 'down') {
            return (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
            );
        }
        return (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
            </svg>
        );
    };

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {insights.map((insight, index) => (
                <div
                    key={index}
                    className={`p-4 rounded-xl border-2 transition-all hover:shadow-md ${getColorClasses(insight.color)}`}
                >
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-2">
                        {insight.label}
                    </p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">
                        {insight.value}
                    </p>
                    {insight.change !== undefined && (
                        <div className={`flex items-center gap-1 mt-2 text-sm font-medium ${getIconColor(insight.icon)}`}>
                            {renderChangeIcon(insight.icon)}
                            <span>{insight.change > 0 ? '+' : ''}{insight.change.toFixed(1)}%</span>
                            {insight.changeLabel && (
                                <span className="text-xs text-slate-500 dark:text-slate-400 ml-1">
                                    {insight.changeLabel}
                                </span>
                            )}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};
