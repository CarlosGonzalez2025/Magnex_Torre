import React from 'react';

// --- TREND CHART (Bar Chart) ---

interface TrendData {
    label: string; // e.g., "Lun", "Mar"
    total: number;
    critical: number;
}

interface TrendChartProps {
    data: TrendData[];
    title?: string;
    height?: number;
}

export const TrendChart: React.FC<TrendChartProps> = ({ data, title, height = 200 }) => {
    const maxValue = Math.max(...data.map(d => d.total), 1); // Avoid division by zero

    return (
        <div className="w-full">
            {title && <h4 className="text-sm font-semibold text-slate-700 mb-4">{title}</h4>}

            <div className="w-full flex items-end justify-between gap-2" style={{ height: `${height}px` }}>
                {data.map((item, index) => {
                    const heightPercent = (item.total / maxValue) * 100;
                    const criticalPercent = item.total > 0 ? (item.critical / item.total) * 100 : 0;

                    return (
                        <div key={index} className="flex flex-col items-center flex-1 group relative">
                            {/* Tooltip */}
                            <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-xs py-1 px-2 rounded pointer-events-none whitespace-nowrap z-10">
                                {item.label}: {item.total} alertas ({item.critical} críticas)
                            </div>

                            {/* Bar Container */}
                            <div className="w-full max-w-[30px] bg-slate-100 rounded-t-sm relative overflow-hidden transition-all duration-500 hover:brightness-95"
                                style={{ height: `${heightPercent}%` }}>

                                {/* Regular Alerts (Base) */}
                                <div className="absolute inset-0 bg-blue-400 w-full h-full"></div>

                                {/* Critical Alerts (Overlay) */}
                                <div
                                    className="absolute bottom-0 left-0 right-0 bg-red-500 w-full transition-all duration-500"
                                    style={{ height: `${criticalPercent}%` }}
                                ></div>
                            </div>

                            {/* Label */}
                            <span className="text-xs text-slate-500 mt-2 font-medium truncate w-full text-center">
                                {item.label}
                            </span>
                        </div>
                    );
                })}
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
