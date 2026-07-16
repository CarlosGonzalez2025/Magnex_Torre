"""
Job batch de inteligencia — Scoring de riesgo por conductor + líneas base.

Corre OFFLINE (GitHub Actions, cron diario). Aquí sí usamos pandas/numpy/sklearn
sin límite de peso, porque nada de esto entra al bundle de Vercel: el resultado
se escribe en Supabase y el agente/Dashboard solo leen filas precalculadas.

Decisiones de modelado (deliberadas, no por comodidad):

  * Nada de redes neuronales. Con datos tabulares de este volumen un modelo
    estadístico robusto gana en precisión y, sobre todo, es EXPLICABLE: a un
    conductor se le puede defender "estás en el percentil 95 de frenadas";
    un "riesgo 0.87" de una red neuronal no se puede sustentar frente a nadie.

  * Percentiles, no z-scores clásicos. La telemetría tiene outliers salvajes
    (un conductor con 200 excesos en un día por un GPS defectuoso). La media y
    la desviación estándar se distorsionan; la mediana y el MAD no.

  * Normalización por exposición. Un conductor con 40 días activos y otro con 3
    no son comparables en conteos crudos. Todo se mide POR DÍA ACTIVO.

  * Guardia de exposición mínima. Con 1-2 días activos, cualquier tasa es ruido
    estadístico. Esos conductores se excluyen del ranking en vez de aparecer
    como falsos críticos — que es exactamente lo que destruye la confianza en un
    sistema de scoring.

Uso:
    export SUPABASE_URL=...  SUPABASE_SERVICE_ROLE_KEY=...
    python -m ml.train_driver_risk [--ventana 90] [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from datetime import datetime

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from ml.supabase_io import (
    check_env, dias_atras_col, fetch_all, hoy_col, insert, upsert,
)

# La consola de Windows usa cp1252 y revienta con los acentos y los caracteres de
# caja del resumen. En GitHub Actions ya es UTF-8, pero el job tiene que poder
# correrse a mano en local sin morir imprimiendo.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, 'reconfigure'):
        _stream.reconfigure(encoding='utf-8', errors='replace')

# ─────────────────────────────────────────────────────────────────────────────
# Parámetros del modelo
# ─────────────────────────────────────────────────────────────────────────────
VENTANA_DIAS_DEFAULT = 90

# Exposición mínima para entrar al ranking. Por debajo, las tasas por día son
# ruido: un solo evento en un solo día activo da "1.0 excesos/día", que es peor
# que el peor conductor real de la flota.
MIN_DIAS_ACTIVOS = 3

# Pesos del score. Suman 1.0. Están aquí, explícitos y versionados, para que un
# cambio de criterio de negocio sea un cambio de código revisable — no un número
# mágico enterrado en una consulta.
PESOS = {
    'graves_por_dia': 0.40,    # exceso >=80 km/h: el de mayor consecuencia
    'excesos_por_dia': 0.25,   # exceso 50-80 km/h
    'frenadas_por_dia': 0.20,  # conducción agresiva / anticipación deficiente
    'velocidad_p95': 0.15,     # velocidad sostenida alta, no el pico anecdótico
}

NIVELES = [(85, 'CRITICO'), (70, 'ALTO'), (45, 'MEDIO'), (0, 'BAJO')]

# Proporción esperada de comportamientos atípicos. 5% es un punto de partida
# conservador: marca ~1 de cada 20 conductores para revisión humana, un volumen
# que un supervisor puede atender de verdad.
CONTAMINATION = 0.05

# Pendiente mínima (excesos+frenadas por día, por semana) para no llamar
# "tendencia" a lo que es ruido semana a semana.
SLOPE_UMBRAL = 0.05

MODELO_TIPO = 'driver_risk'

PLACEHOLDER_COND = {'', 'no registra', 'sin conductor', 'desconocido', 'no asignado',
                    'conductor n/a', 'na', 'n/a', 'sin asignar', 'pendiente google sheets'}


# ─────────────────────────────────────────────────────────────────────────────
# Normalización — espejo de api/agent.py. Si estas reglas divergen, el Dashboard
# y el asistente dan cifras distintas para la misma pregunta.
# ─────────────────────────────────────────────────────────────────────────────
def strip_accents(s: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFD', s or '') if unicodedata.category(c) != 'Mn')


def normtxt(s) -> str:
    return strip_accents(str(s or '')).lower().strip()


def es_cond_placeholder(nombre) -> bool:
    t = re.sub(r'\s+', ' ', normtxt(nombre)).strip()
    return t in PLACEHOLDER_COND


def es_identificador_no_persona(nombre) -> bool:
    """Detecta IDs de hardware que llegan en el campo `conductor`.

    La base trae valores como '013865BC1D00006B' (id de dispositivo GPS) donde
    debería ir un nombre. Se verificó: uno de ellos entraba al top 10 de riesgo
    con 106 excesos graves. Un ID de equipo en un ranking de PERSONAS invalida
    el tablero entero a ojos de un supervisor, así que se excluye del scoring y
    se reporta aparte — no se esconde.

    Regla conservadora: sin espacios Y con dígitos. Ningún nombre real de la
    base cumple ambas.
    """
    t = str(nombre or '').strip()
    return bool(t) and ' ' not in t and any(c.isdigit() for c in t)


def conductor_key(nombre) -> str:
    """Clave canónica para agrupar a un conductor.

    Sin esto, 'YORGUIN ROBLES PEÑA' y 'Yorguin Robles Peña' se cuentan como dos
    personas: cada una recibe la mitad de la exposición, ambas aparecen en el
    ranking y ninguna de las dos cifras es cierta. Se verificó contra los datos
    reales — el caso existe hoy en alertas_diarias_gps.
    """
    return re.sub(r'\s+', ' ', strip_accents(str(nombre or '')).upper()).strip()


# ─────────────────────────────────────────────────────────────────────────────
# Carga y preparación
# ─────────────────────────────────────────────────────────────────────────────
def cargar_eventos(ventana_dias: int) -> pd.DataFrame:
    desde = dias_atras_col(ventana_dias)
    hasta = hoy_col()
    print(f'[1/6] Cargando alertas_diarias_gps de {desde} a {hasta}…')
    rows = fetch_all(
        'alertas_diarias_gps',
        'placa,conductor,fecha_dia,velocidad,infraccion_80_kmh,excesos_50_80_kmh,'
        'frenadas_bruscas,contrato_nombre,cliente,gps,tipo_activo',
        filters=[f'fecha_dia=gte.{desde}', f'fecha_dia=lte.{hasta}'],
    )
    df = pd.DataFrame(rows)
    print(f'      {len(df):,} eventos crudos.')
    return df


def preparar(df: pd.DataFrame) -> pd.DataFrame:
    """Aplica la MISMA semántica de exceso que api/agent.py:tool_excesos_velocidad.

    Ojo con `excesos_varios_parametros`: NO es exceso de velocidad (aparece con
    velocidades de 10-28 km/h). Incluirlo infla el conteo ~2.7x. Por eso ni
    siquiera se trae de la base.
    """
    if df.empty:
        return df

    for col in ('velocidad', 'infraccion_80_kmh', 'excesos_50_80_kmh', 'frenadas_bruscas'):
        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

    df['fecha_dia'] = pd.to_datetime(df['fecha_dia'], errors='coerce')
    df = df.dropna(subset=['fecha_dia'])

    df['conductor'] = df['conductor'].astype(str).str.strip()
    df = df[~df['conductor'].map(es_cond_placeholder)]

    ids_equipo = df['conductor'].map(es_identificador_no_persona)
    if ids_equipo.any():
        n_ids = df.loc[ids_equipo, 'conductor'].nunique()
        print(f'      AVISO: {n_ids} valores del campo `conductor` son IDs de dispositivo, '
              f'no personas ({int(ids_equipo.sum()):,} eventos). Excluidos del scoring — '
              f'revisar la fuente: esa telemetría no tiene conductor asignado.')
        df = df[~ids_equipo]

    df['conductor_key'] = df['conductor'].map(conductor_key)

    df['es_exceso'] = (
        (df['infraccion_80_kmh'] > 0) | (df['excesos_50_80_kmh'] > 0) | (df['velocidad'] >= 50)
    )
    df['es_grave'] = (df['infraccion_80_kmh'] > 0) | (df['velocidad'] >= 80)

    print(f'[2/6] {len(df):,} eventos con conductor identificado · '
          f'{int(df["es_exceso"].sum()):,} excesos · {int(df["es_grave"].sum()):,} graves.')
    return df


def agregar_por_conductor(df: pd.DataFrame, ventana_dias: int) -> pd.DataFrame:
    """Una fila por conductor, con métricas normalizadas por exposición.

    Se agrupa por `conductor_key` (canónica), no por el nombre crudo: la base
    trae la misma persona con distintas grafías.
    """
    g = df.groupby('conductor_key')

    agg = pd.DataFrame({
        'dias_activos': g['fecha_dia'].nunique(),
        'eventos_exceso': g['es_exceso'].sum().astype(int),
        'eventos_graves': g['es_grave'].sum().astype(int),
        'frenadas_bruscas': g['frenadas_bruscas'].sum().astype(int),
        'velocidad_max': g['velocidad'].max(),
        # p95 y no max: el máximo es un pico anecdótico (o un GPS con glitch);
        # el p95 describe la velocidad que el conductor sostiene de verdad.
        'velocidad_p95': g['velocidad'].quantile(0.95),
    }).reset_index()

    # Nombre a mostrar y contrato/cliente: la grafía más frecuente de la ventana.
    modo = g[['conductor', 'contrato_nombre', 'cliente']].agg(
        lambda s: s.mode().iloc[0] if not s.mode().empty else ''
    ).reset_index()
    agg = agg.merge(modo, on='conductor_key', how='left')

    agg['excesos_por_dia'] = agg['eventos_exceso'] / agg['dias_activos']
    agg['graves_por_dia'] = agg['eventos_graves'] / agg['dias_activos']
    agg['frenadas_por_dia'] = agg['frenadas_bruscas'] / agg['dias_activos']
    agg['ventana_dias'] = ventana_dias

    total = len(agg)
    agg = agg[agg['dias_activos'] >= MIN_DIAS_ACTIVOS].copy()
    print(f'[3/6] {total:,} conductores agregados · {len(agg):,} con exposición suficiente '
          f'(>={MIN_DIAS_ACTIVOS} días activos) · {total - len(agg):,} excluidos por muestra insuficiente.')
    return agg


# ─────────────────────────────────────────────────────────────────────────────
# Modelo
# ─────────────────────────────────────────────────────────────────────────────
def calcular_score(agg: pd.DataFrame) -> pd.DataFrame:
    """Score 0-100 = suma ponderada de rangos percentiles.

    Percentil y no valor absoluto: hace el score robusto a outliers y lo vuelve
    directamente interpretable ("percentil 95 de frenadas de la flota").
    """
    print('[4/6] Calculando score de riesgo y detectando anomalías…')

    score = np.zeros(len(agg))
    for metrica, peso in PESOS.items():
        # pct=True -> rango percentil en [0,1]. 'min' para que los empates (muy
        # comunes en 0.0) compartan el percentil bajo y no se penalice al azar.
        pct = agg[metrica].rank(pct=True, method='min')
        agg[f'_pct_{metrica}'] = pct
        score += pct.to_numpy() * peso

    agg['risk_score'] = (score * 100).round(2)
    agg['risk_percentil'] = (agg['risk_score'].rank(pct=True, method='min') * 100).round(2)

    def nivel(s: float) -> str:
        for umbral, nombre in NIVELES:
            if s >= umbral:
                return nombre
        return 'BAJO'

    agg['risk_nivel'] = agg['risk_score'].map(nivel)

    # ── Anomalías: IsolationForest sobre las features normalizadas.
    # Complementa al score: el score dice "es peor que los demás"; el bosque dice
    # "esta COMBINACIÓN de comportamiento no se parece a nada en la flota"
    # (p.ej. pocos excesos pero frenadas altísimas — perfil raro que un ranking
    # lineal esconde en la mitad de la tabla).
    feats = agg[list(PESOS.keys())].to_numpy(dtype=float)
    if len(agg) >= 20:
        iso = IsolationForest(
            n_estimators=200, contamination=CONTAMINATION,
            random_state=42,  # reproducibilidad: mismo dato -> mismo resultado
        )
        pred = iso.fit_predict(feats)
        agg['es_anomalia'] = pred == -1
        agg['anomaly_score'] = np.round(-iso.score_samples(feats), 4)
    else:
        # Con <20 conductores el bosque no tiene con qué comparar; declarar
        # anomalías ahí sería inventarlas.
        print('      Menos de 20 conductores: se omite IsolationForest.')
        agg['es_anomalia'] = False
        agg['anomaly_score'] = 0.0

    return agg


def calcular_tendencia(df: pd.DataFrame, agg: pd.DataFrame) -> pd.DataFrame:
    """Pendiente de regresión sobre cubos semanales: ¿mejora o empeora?

    Esto es lo que hoy el sistema no puede ver: un conductor que se degrada de
    forma sostenida durante semanas nunca cruza un umbral fijo y es invisible.
    """
    df = df.copy()
    df['semana'] = df['fecha_dia'].dt.to_period('W').dt.start_time

    sem = df.groupby(['conductor_key', 'semana']).agg(
        eventos=('es_exceso', 'sum'),
        frenadas=('frenadas_bruscas', 'sum'),
        dias=('fecha_dia', 'nunique'),
    ).reset_index()
    sem['tasa'] = (sem['eventos'] + sem['frenadas']) / sem['dias']

    slopes: dict[str, float] = {}
    for conductor, grupo in sem.groupby('conductor_key'):
        # Con menos de 3 semanas, una "tendencia" es una línea entre dos puntos:
        # no distingue señal de ruido.
        if len(grupo) < 3:
            continue
        grupo = grupo.sort_values('semana')
        x = np.arange(len(grupo), dtype=float)
        y = grupo['tasa'].to_numpy(dtype=float)
        slopes[conductor] = float(np.polyfit(x, y, 1)[0])

    agg['tendencia_slope'] = agg['conductor_key'].map(slopes).fillna(0.0).round(4)

    def etiqueta(s: float) -> str:
        if s > SLOPE_UMBRAL:
            return 'EMPEORANDO'
        if s < -SLOPE_UMBRAL:
            return 'MEJORANDO'
        return 'ESTABLE'

    agg['tendencia'] = agg['tendencia_slope'].map(etiqueta)

    n_emp = int((agg['tendencia'] == 'EMPEORANDO').sum())
    n_mej = int((agg['tendencia'] == 'MEJORANDO').sum())
    print(f'[5/6] Tendencia: {n_emp} empeorando · {n_mej} mejorando · '
          f'{len(agg) - n_emp - n_mej} estables.')
    return agg


ETIQUETA_FACTOR = {
    'graves_por_dia': 'Excesos graves (>=80 km/h)',
    'excesos_por_dia': 'Excesos de velocidad (50-80 km/h)',
    'frenadas_por_dia': 'Frenadas bruscas',
    'velocidad_p95': 'Velocidad sostenida (p95)',
}


def construir_factores(fila: pd.Series) -> list[dict]:
    """Explicabilidad: por qué este conductor tiene este score.

    Sin esto el score es un oráculo, y un supervisor no puede accionar sobre un
    oráculo. Se ordena por contribución para que el primer factor sea el titular.
    """
    factores = []
    for metrica, peso in PESOS.items():
        pct = float(fila[f'_pct_{metrica}'])
        contribucion = round(pct * peso * 100, 2)
        factores.append({
            'factor': metrica,
            'etiqueta': ETIQUETA_FACTOR[metrica],
            'valor': round(float(fila[metrica]), 3),
            'percentil': round(pct * 100, 1),
            'peso': peso,
            'contribucion': contribucion,
            'detalle': f'{ETIQUETA_FACTOR[metrica]}: {round(float(fila[metrica]), 2)} '
                       f'(percentil {round(pct * 100)} de la flota)',
        })
    return sorted(factores, key=lambda f: -f['contribucion'])


# ─────────────────────────────────────────────────────────────────────────────
# Líneas base por segmento
# ─────────────────────────────────────────────────────────────────────────────
def calcular_baselines(agg: pd.DataFrame, fecha: str) -> list[dict]:
    """Mediana + MAD por segmento. Convierte "anómalo" en algo relativo al
    comportamiento real del segmento, no a un umbral inventado en una reunión."""
    filas: list[dict] = []
    metricas = ['excesos_por_dia', 'graves_por_dia', 'frenadas_por_dia', 'velocidad_p95']

    def bloque(sub: pd.DataFrame, tipo: str, valor: str) -> None:
        if len(sub) < 5:  # una mediana sobre 4 datos no es una línea base
            return
        for m in metricas:
            serie = sub[m].astype(float)
            mediana = float(serie.median())
            # 1.4826 escala el MAD para que sea comparable a una desviación
            # estándar bajo normalidad; el umbral es mediana + 3 sigmas robustas.
            mad = float((serie - mediana).abs().median())
            filas.append({
                'fecha_calculo': fecha,
                'segmento_tipo': tipo,
                'segmento_valor': valor,
                'metrica': m,
                'mediana': round(mediana, 4),
                'mad': round(mad, 4),
                'p75': round(float(serie.quantile(0.75)), 4),
                'p90': round(float(serie.quantile(0.90)), 4),
                'p95': round(float(serie.quantile(0.95)), 4),
                'umbral_anomalia': round(mediana + 3 * 1.4826 * mad, 4),
                'n_muestras': len(sub),
            })

    bloque(agg, 'FLOTA', '')
    for contrato, sub in agg.groupby('contrato_nombre'):
        if str(contrato).strip():
            bloque(sub, 'CONTRATO', str(contrato))

    return filas


# ─────────────────────────────────────────────────────────────────────────────
# Persistencia
# ─────────────────────────────────────────────────────────────────────────────
def construir_filas_score(agg: pd.DataFrame, fecha: str, version: str) -> list[dict]:
    filas = []
    for _, r in agg.iterrows():
        filas.append({
            'fecha_calculo': fecha,
            'conductor': str(r['conductor']),
            'conductor_key': str(r['conductor_key']),
            'contrato_nombre': str(r.get('contrato_nombre') or ''),
            'cliente': str(r.get('cliente') or ''),
            'ventana_dias': int(r['ventana_dias']),
            'dias_activos': int(r['dias_activos']),
            'eventos_exceso': int(r['eventos_exceso']),
            'eventos_graves': int(r['eventos_graves']),
            'frenadas_bruscas': int(r['frenadas_bruscas']),
            'velocidad_max': round(float(r['velocidad_max']), 2),
            'velocidad_p95': round(float(r['velocidad_p95']), 2),
            'excesos_por_dia': round(float(r['excesos_por_dia']), 3),
            'graves_por_dia': round(float(r['graves_por_dia']), 3),
            'frenadas_por_dia': round(float(r['frenadas_por_dia']), 3),
            'risk_score': float(r['risk_score']),
            'risk_percentil': float(r['risk_percentil']),
            'risk_nivel': str(r['risk_nivel']),
            'es_anomalia': bool(r['es_anomalia']),
            'anomaly_score': float(r['anomaly_score']),
            'tendencia': str(r['tendencia']),
            'tendencia_slope': float(r['tendencia_slope']),
            'factores': construir_factores(r),
            'modelo_version': version,
        })
    return filas


def main() -> int:
    ap = argparse.ArgumentParser(description='Scoring de riesgo por conductor (Torre de Control).')
    ap.add_argument('--ventana', type=int, default=VENTANA_DIAS_DEFAULT,
                    help=f'Días de historia a considerar (default {VENTANA_DIAS_DEFAULT}).')
    ap.add_argument('--dry-run', action='store_true',
                    help='Calcula e imprime el resumen sin escribir en Supabase.')
    args = ap.parse_args()

    check_env(write=not args.dry_run)
    fecha = hoy_col()
    version = f'{MODELO_TIPO}-{fecha}'

    df = cargar_eventos(args.ventana)
    if df.empty:
        print('No hay eventos en la ventana. Nada que calcular.')
        return 0

    df = preparar(df)
    if df.empty:
        print('No quedaron eventos con conductor identificado. Nada que calcular.')
        return 0

    agg = agregar_por_conductor(df, args.ventana)
    if agg.empty:
        print(f'Ningún conductor alcanza {MIN_DIAS_ACTIVOS} días activos. Nada que calcular.')
        return 0

    agg = calcular_score(agg)
    agg = calcular_tendencia(df, agg)

    filas_score = construir_filas_score(agg, fecha, version)
    filas_base = calcular_baselines(agg, fecha)

    # ── Resumen para el log del cron (lo que un humano revisa cada mañana)
    print('\n── Top 10 conductores por riesgo ' + '─' * 40)
    top = agg.nlargest(10, 'risk_score')[
        ['conductor', 'risk_score', 'risk_nivel', 'tendencia', 'dias_activos',
         'eventos_graves', 'frenadas_bruscas']
    ]
    print(top.to_string(index=False))
    dist = agg['risk_nivel'].value_counts().to_dict()
    print(f'\nDistribución de niveles: {dist}')
    print(f'Anomalías detectadas: {int(agg["es_anomalia"].sum())}')

    if args.dry_run:
        print('\n[dry-run] No se escribió nada en Supabase.')
        return 0

    print(f'\n[6/6] Escribiendo resultados (versión {version})…')
    n1 = upsert('ml_driver_scores', filas_score, on_conflict='fecha_calculo,conductor_key')
    n2 = upsert('ml_fleet_baselines', filas_base,
                on_conflict='fecha_calculo,segmento_tipo,segmento_valor,metrica')

    # Bitácora de la corrida, no una compuerta: para `driver_risk` el registro no
    # controla nada — el Dashboard lee `ml_driver_scores` directamente, y el
    # scoring es determinista y explicable, así que no necesita aprobación. Queda
    # en 'entrenado' a propósito: 'activo' está reservado para modelos que SÍ
    # deciden qué se le responde a un usuario (el router de intención), y esos
    # exigen aprobación humana explícita antes de promoverse.
    try:
        insert('ml_model_registry', {
            'version': version,
            'tipo': MODELO_TIPO,
            'estado': 'entrenado',
            'pesos': {'pesos_score': PESOS, 'min_dias_activos': MIN_DIAS_ACTIVOS,
                      'contamination': CONTAMINATION, 'ventana_dias': args.ventana},
            'metricas': {
                'n_conductores': len(agg),
                'distribucion_niveles': {k: int(v) for k, v in dist.items()},
                'n_anomalias': int(agg['es_anomalia'].sum()),
                'n_empeorando': int((agg['tendencia'] == 'EMPEORANDO').sum()),
                'eventos_analizados': int(len(df)),
            },
            'n_muestras_entreno': len(agg),
            'notas': f'Recalculo automático diario sobre ventana de {args.ventana} días.',
        })
    except RuntimeError as e:
        # Ya existe esa versión (se corrió dos veces el mismo día). Los scores sí
        # se actualizaron por upsert; no es motivo para fallar el job.
        print(f'      Aviso al registrar el modelo: {e}', file=sys.stderr)

    print(f'      {n1:,} scores · {n2:,} líneas base escritas.')
    print(f'\nListo — {datetime.now().isoformat(timespec="seconds")}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
