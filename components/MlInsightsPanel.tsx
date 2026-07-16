import React, { useState, useEffect } from 'react';
import {
    Brain,
    TrendingUp,
    TrendingDown,
    Minus,
    AlertOctagon,
    Sparkles,
    Loader2,
    ChevronDown,
    Info,
} from 'lucide-react';
import { getMlInsights, MlInsights, DriverScore, RiskNivel, Tendencia } from '../services/mlInsightsService';

/**
 * Panel de inteligencia del Dashboard.
 *
 * Lee resultados YA calculados por ml/train_driver_risk.py (cron diario). No
 * calcula nada en el navegador: por eso abre instantáneo aunque detrás haya una
 * ventana de 90 días y ~75k eventos.
 *
 * Regla de diseño que atraviesa todo el panel: el nivel de riesgo y la tendencia
 * son ESTADO, no series de datos. Nunca se comunican solo con color — siempre
 * con icono + etiqueta de texto, para que sean legibles con daltonismo, en
 * impresión y en modo de alto contraste.
 */

type Tab = 'riesgo' | 'anomalias' | 'empeorando';

// ── Estado: 4 niveles reservados. El texto viaja SIEMPRE junto al color. ──
const NIVEL_STYLE: Record<RiskNivel, { chip: string; barra: string; label: string }> = {
    CRITICO: {
        chip: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900/50',
        barra: 'bg-red-500',
        label: 'Crítico',
    },
    ALTO: {
        chip: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-900/50',
        barra: 'bg-orange-500',
        label: 'Alto',
    },
    MEDIO: {
        chip: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900/50',
        barra: 'bg-amber-500',
        label: 'Medio',
    },
    BAJO: {
        chip: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-900/50',
        barra: 'bg-green-500',
        label: 'Bajo',
    },
};

const TENDENCIA_UI: Record<Tendencia, { icon: React.ReactNode; texto: string; clase: string }> = {
    EMPEORANDO: {
        icon: <TrendingUp className="w-3.5 h-3.5" />,
        texto: 'Empeorando',
        clase: 'text-red-600 dark:text-red-400',
    },
    MEJORANDO: {
        icon: <TrendingDown className="w-3.5 h-3.5" />,
        texto: 'Mejorando',
        clase: 'text-green-600 dark:text-green-400',
    },
    ESTABLE: {
        icon: <Minus className="w-3.5 h-3.5" />,
        texto: 'Estable',
        clase: 'text-slate-500 dark:text-slate-400',
    },
};

const DriverRow: React.FC<{ score: DriverScore; rank: number }> = ({ score, rank }) => {
    const [abierto, setAbierto] = useState(false);
    const nivel = NIVEL_STYLE[score.risk_nivel] ?? NIVEL_STYLE.BAJO;
    const tend = TENDENCIA_UI[score.tendencia] ?? TENDENCIA_UI.ESTABLE;

    return (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
            <button
                onClick={() => setAbierto(o => !o)}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
            >
                <span className="w-6 text-xs font-bold text-slate-400 dark:text-slate-500 shrink-0">
                    {rank}
                </span>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {score.conductor}
                        </span>
                        {/* Estado con etiqueta, nunca color a secas. */}
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${nivel.chip}`}>
                            {nivel.label}
                        </span>
                        {score.es_anomalia && (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-900/50">
                                <Sparkles className="w-2.5 h-2.5" /> Atípico
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-3 mt-1.5">
                        {/* Barra = magnitud del score. El número va al lado: la barra
                            sola no es un dato legible. */}
                        <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden max-w-[140px]">
                            <div
                                className={`h-full rounded-full ${nivel.barra} transition-all duration-500`}
                                style={{ width: `${Math.min(100, score.risk_score)}%` }}
                            />
                        </div>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                            {score.risk_score.toFixed(0)}
                        </span>
                        <span className={`flex items-center gap-1 text-[10px] font-medium ${tend.clase}`}>
                            {tend.icon} {tend.texto}
                        </span>
                    </div>

                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                        {score.dias_activos} días activos · {score.eventos_graves} graves ·{' '}
                        {score.frenadas_bruscas} frenadas
                        {score.contrato_nombre ? ` · ${score.contrato_nombre}` : ''}
                    </p>
                </div>

                <ChevronDown
                    className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`}
                />
            </button>

            {/* Explicabilidad: sin esto el score es un oráculo, y sobre un oráculo
                un supervisor no puede accionar ni sustentar una conversación. */}
            {abierto && (
                <div className="px-3 pb-3 pt-1 border-t border-slate-100 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-900/30">
                    <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 mt-2">
                        Por qué este puntaje
                    </p>
                    <div className="space-y-1.5">
                        {(score.factores || []).map(f => (
                            <div key={f.factor} className="flex items-center gap-2">
                                <span className="text-[11px] text-slate-600 dark:text-slate-300 flex-1 min-w-0 truncate">
                                    {f.etiqueta}
                                </span>
                                <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums shrink-0">
                                    p{Math.round(f.percentil)}
                                </span>
                                <div className="w-16 h-1 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden shrink-0">
                                    <div
                                        className="h-full rounded-full bg-slate-400 dark:bg-slate-500"
                                        style={{ width: `${Math.min(100, f.percentil)}%` }}
                                    />
                                </div>
                                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 tabular-nums w-9 text-right shrink-0">
                                    +{f.contribucion.toFixed(1)}
                                </span>
                            </div>
                        ))}
                    </div>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 leading-relaxed">
                        El puntaje compara a este conductor con el resto de la flota (percentil), no
                        contra un umbral fijo. Las cifras están normalizadas por días activos.
                    </p>
                </div>
            )}
        </div>
    );
};

const MiniStat: React.FC<{ valor: number; etiqueta: string; clase: string }> = ({ valor, etiqueta, clase }) => (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
        <p className={`text-2xl font-bold tabular-nums ${clase}`}>{valor}</p>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{etiqueta}</p>
    </div>
);

const TABS: { id: Tab; label: string }[] = [
    { id: 'riesgo', label: 'Mayor riesgo' },
    { id: 'empeorando', label: 'Empeorando' },
    { id: 'anomalias', label: 'Atípicos' },
];

const DESCRIPCION_TAB: Record<Tab, string> = {
    riesgo: 'Ranking por puntaje compuesto: excesos graves, excesos, frenadas y velocidad sostenida, normalizados por días activos.',
    empeorando: 'Degradación sostenida en las últimas semanas. Estos conductores no cruzan ningún umbral fijo — sin tendencia son invisibles.',
    anomalias: 'Combinaciones de conducta que no se parecen al resto de la flota (IsolationForest). Complementa al ranking: detecta perfiles raros que un orden lineal esconde a media tabla.',
};

export const MlInsightsPanel: React.FC = () => {
    const [insights, setInsights] = useState<MlInsights | null>(null);
    const [cargando, setCargando] = useState(true);
    const [tab, setTab] = useState<Tab>('riesgo');

    useEffect(() => {
        let vivo = true;
        getMlInsights(10)
            .then(d => { if (vivo) setInsights(d); })
            .finally(() => { if (vivo) setCargando(false); });
        return () => { vivo = false; };
    }, []);

    if (cargando) {
        return (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-md">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Cargando análisis de riesgo…</span>
                </div>
            </div>
        );
    }

    // Estado vacío explícito. Mostrar ceros aquí se leería como "la flota no
    // tiene riesgo" — exactamente lo contrario de la verdad.
    if (!insights) {
        return (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-md">
                <div className="flex items-start gap-3">
                    <div className="p-2 bg-slate-100 dark:bg-slate-700 rounded-lg">
                        <Brain className="w-5 h-5 text-slate-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                            Análisis de riesgo no disponible
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                            Todavía no hay un cálculo publicado. Corre el job de inteligencia
                            (<code className="text-[10px] bg-slate-100 dark:bg-slate-700 px-1 py-0.5 rounded">python -m ml.train_driver_risk</code>)
                            o espera al cron diario.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    const { resumen } = insights;
    const lista =
        tab === 'riesgo' ? insights.topRiesgo :
        tab === 'anomalias' ? insights.anomalias :
        insights.empeorando;

    return (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-md">
            <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                        <Brain className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                            Riesgo por Conductor
                        </h3>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500">
                            {resumen.totalConductores} conductores analizados · ventana de 90 días ·
                            cálculo del {resumen.fechaCalculo}
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <MiniStat valor={resumen.criticos} etiqueta="Riesgo crítico" clase="text-red-600 dark:text-red-400" />
                <MiniStat valor={resumen.altos} etiqueta="Riesgo alto" clase="text-orange-600 dark:text-orange-400" />
                <MiniStat valor={resumen.empeorando} etiqueta="Empeorando" clase="text-amber-600 dark:text-amber-400" />
                <MiniStat valor={resumen.mejorando} etiqueta="Mejorando" clase="text-green-600 dark:text-green-400" />
            </div>

            <div className="flex items-center gap-1 mb-3 border-b border-slate-200 dark:border-slate-700">
                {TABS.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors ${
                            tab === t.id
                                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                        }`}
                    >
                        {t.label}
                        {t.id === 'anomalias' && resumen.anomalias > 0 && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-[9px]">
                                {resumen.anomalias}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            <p className="flex items-start gap-1.5 text-[10px] text-slate-400 dark:text-slate-500 mb-3 leading-relaxed">
                <Info className="w-3 h-3 mt-0.5 shrink-0" />
                {DESCRIPCION_TAB[tab]}
            </p>

            <div className="space-y-2">
                {lista.length > 0 ? (
                    lista.map((s, i) => <DriverRow key={s.id} score={s} rank={i + 1} />)
                ) : (
                    <div className="text-center py-8">
                        <AlertOctagon className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Sin conductores en esta categoría.
                        </p>
                    </div>
                )}
            </div>

            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-4 pt-3 border-t border-slate-200 dark:border-slate-700 leading-relaxed">
                Modelo <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">{resumen.modeloVersion || 'n/d'}</code>.
                Se excluyen los conductores con menos de 3 días activos: con esa exposición
                cualquier tasa por día es ruido, no señal. Estas cifras apoyan la decisión de un
                supervisor; no la reemplazan.
            </p>
        </div>
    );
};

export default MlInsightsPanel;
