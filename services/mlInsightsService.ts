import { supabase } from './supabaseClient';

/**
 * Lectura de la capa de inteligencia (ML).
 *
 * Todo lo que hay aquí son SELECT sobre resultados YA calculados por el job
 * batch (ml/train_driver_risk.py, cron diario). El navegador no calcula nada:
 * lee filas precalculadas, así que el panel abre instantáneo por más que la
 * ventana de análisis sean 90 días y 75k eventos.
 */

export interface RiskFactor {
    factor: string;
    etiqueta: string;
    valor: number;
    percentil: number;
    peso: number;
    contribucion: number;
    detalle: string;
}

export type RiskNivel = 'BAJO' | 'MEDIO' | 'ALTO' | 'CRITICO';
export type Tendencia = 'MEJORANDO' | 'ESTABLE' | 'EMPEORANDO';

export interface DriverScore {
    id: string;
    fecha_calculo: string;
    conductor: string;
    conductor_key: string;
    contrato_nombre: string;
    cliente: string;
    ventana_dias: number;
    dias_activos: number;
    eventos_exceso: number;
    eventos_graves: number;
    frenadas_bruscas: number;
    velocidad_max: number;
    velocidad_p95: number;
    excesos_por_dia: number;
    graves_por_dia: number;
    frenadas_por_dia: number;
    risk_score: number;
    risk_percentil: number;
    risk_nivel: RiskNivel;
    es_anomalia: boolean;
    anomaly_score: number;
    tendencia: Tendencia;
    tendencia_slope: number;
    factores: RiskFactor[];
    modelo_version: string;
}

export interface MlResumen {
    fechaCalculo: string | null;
    totalConductores: number;
    criticos: number;
    altos: number;
    anomalias: number;
    empeorando: number;
    mejorando: number;
    modeloVersion: string;
}

export interface MlInsights {
    resumen: MlResumen;
    topRiesgo: DriverScore[];
    anomalias: DriverScore[];
    empeorando: DriverScore[];
}

/** Fecha del último cálculo disponible. Todo el panel se ancla a ella para que
 *  no se mezclen corridas de días distintos en un mismo tablero. */
async function getUltimaFechaCalculo(): Promise<string | null> {
    const { data, error } = await supabase
        .from('ml_driver_scores')
        .select('fecha_calculo')
        .order('fecha_calculo', { ascending: false })
        .limit(1);

    if (error || !data?.length) return null;
    return data[0].fecha_calculo as string;
}

/**
 * Carga los insights del último cálculo.
 *
 * Devuelve `null` cuando todavía no ha corrido el job (tabla vacía): el panel
 * muestra un estado explícito de "sin datos" en vez de ceros, que se leerían
 * como "la flota no tiene riesgo" — exactamente lo contrario de la verdad.
 */
export async function getMlInsights(limite = 10): Promise<MlInsights | null> {
    const fecha = await getUltimaFechaCalculo();
    if (!fecha) return null;

    const { data, error } = await supabase
        .from('ml_driver_scores')
        .select('*')
        .eq('fecha_calculo', fecha)
        .order('risk_score', { ascending: false });

    if (error || !data?.length) return null;

    const scores = data as DriverScore[];

    return {
        resumen: {
            fechaCalculo: fecha,
            totalConductores: scores.length,
            criticos: scores.filter(s => s.risk_nivel === 'CRITICO').length,
            altos: scores.filter(s => s.risk_nivel === 'ALTO').length,
            anomalias: scores.filter(s => s.es_anomalia).length,
            empeorando: scores.filter(s => s.tendencia === 'EMPEORANDO').length,
            mejorando: scores.filter(s => s.tendencia === 'MEJORANDO').length,
            modeloVersion: scores[0]?.modelo_version || '',
        },
        topRiesgo: scores.slice(0, limite),
        // Anomalías: perfiles raros que el ranking lineal esconde a media tabla.
        anomalias: scores.filter(s => s.es_anomalia).slice(0, limite),
        // Los que empeoran ordenados por pendiente: la degradación más acelerada
        // primero. Este es el listado que hoy el sistema no puede producir.
        empeorando: scores
            .filter(s => s.tendencia === 'EMPEORANDO')
            .sort((a, b) => b.tendencia_slope - a.tendencia_slope)
            .slice(0, limite),
    };
}

/** Histórico de un conductor: permite ver si el plan de acción sirvió. */
export async function getHistorialConductor(conductorKey: string, dias = 60): Promise<DriverScore[]> {
    const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
    const { data, error } = await supabase
        .from('ml_driver_scores')
        .select('*')
        .eq('conductor_key', conductorKey)
        .gte('fecha_calculo', desde)
        .order('fecha_calculo', { ascending: true });

    if (error || !data) return [];
    return data as DriverScore[];
}

/**
 * Feedback del asistente (pulgar arriba/abajo).
 *
 * Este es el bucle de aprendizaje: `acierto` es lo que después separa las
 * preguntas que el router entendió bien de las que no. Sin este dato el
 * reentrenamiento del router sería el modelo aprendiendo de sus propias
 * suposiciones — que es como se degrada un sistema, no como mejora.
 */
export async function enviarFeedbackAsistente(interactionId: string, acierto: boolean): Promise<boolean> {
    const { error } = await supabase
        .from('agent_interactions')
        .update({ acierto })
        .eq('id', interactionId);

    if (error) {
        console.warn('[ML] No se pudo registrar el feedback:', error.message);
        return false;
    }
    return true;
}
