"""
Worker de validación de alertas de velocidad (Torre de Control).

Consume `alert_validation_queue` y verifica cada alerta contra el informe diario
del propio proveedor, que el sistema YA ingiere en `alertas_diarias_gps`.

Por qué esta fuente y no el portal (RPA):

  El agente anterior abría Chrome, navegaba el portal por texto y leía el DOM.
  Se investigó la alternativa por API y está bloqueada: Coltrack (api.jsp) solo
  expone la instantánea actual, sin parámetros de histórico; Fagor sí tiene
  histórico (InformePosiciones / InformeAlarmasGeo) pero ambos exigen
  `idVehiculo`, y EstadoActualFlota devuelve `Codigo` vacío en los 497 vehículos
  — no hay forma de mapear matrícula -> id. `InformeGeocercas`, el único que
  acepta matrícula, devolvió 0 filas contra eventos reales (solo cubre alarmas
  de geocerca).

  Pero el dato del proveedor ya está en la base: `alertas_diarias_gps` guarda
  `fecha` (timestamp completo), `velocidad`, `latitud`/`longitud` y `lugar` por
  evento. Es la misma telemetría que muestra el portal, sin navegador, sin
  scraping y sin depender del DOM de un tercero.

  El precio es que el informe diario llega con retraso: la validación es diferida
  (horas), no instantánea. A cambio es reproducible y auditable.

REGLA QUE SOSTIENE TODO EL DISEÑO
  "El informe del día aún no se ha cargado" NO es "la alerta es falsa".
  Ausencia de dato != evidencia de ausencia. Mientras el informe del (proveedor,
  día) no esté en la base, la alerta queda 'pendiente' y se reintenta. Solo se
  descarta cuando el informe SÍ está cargado y aun así no aparece el evento.
  Confundir esas dos cosas es exactamente como se acusa a un conductor con un
  dato que nadie verificó.

Uso:
    export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
    python -m alerts.validate_alerts [--limite 200] [--dry-run]
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime, timedelta

# `ml.supabase_io` es el cliente Supabase compartido por los jobs Python offline
# (no es específico de ML).
from ml.supabase_io import (
    COL_OFFSET, check_env, count, fetch_all, patch,
)

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, 'reconfigure'):
        _s.reconfigure(encoding='utf-8', errors='replace')

# ─────────────────────────────────────────────────────────────────────────────
# Parámetros
# ─────────────────────────────────────────────────────────────────────────────

# Tolerancia entre la hora de la alerta en vivo y la del evento en el informe
# diario. No son el mismo reloj: la alerta se detecta sobre el feed en vivo y el
# informe lo genera el proveedor después, con su propia marca de tiempo.
VENTANA_MIN = 15

# Umbrales — misma semántica que api/agent.py y ml/train_driver_risk.py. Si estas
# constantes divergen, el asistente, el dashboard y el validador dan veredictos
# distintos sobre el mismo evento.
UMBRAL_EXCESO = 50.0
UMBRAL_GRAVE = 80.0

# Cuántas veces se reintenta antes de rendirse. Con el cron cada 2h, 24 intentos
# ≈ 2 días de margen para que el proveedor publique su informe.
MAX_INTENTOS = 24

# Si el informe no llegó en este plazo, ya no va a llegar: se cierra como
# inconcluyente en vez de reintentar para siempre.
DIAS_MAX_ESPERA = 3


def norm_placa(p) -> str:
    return re.sub(r'\s+', '', str(p or '').upper()).strip()


def _parse_ts(s: str) -> datetime | None:
    """Parsea timestamps de PostgREST ('...+00:00' o '...Z')."""
    if not s:
        return None
    t = str(s).strip().replace('Z', '+00:00')
    # Postgres emite microsegundos de longitud variable; fromisoformat es
    # tolerante desde 3.11, pero normalizamos por si acaso.
    try:
        return datetime.fromisoformat(t)
    except ValueError:
        m = re.match(r'(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})', t)
        return datetime.fromisoformat(m.group(1)) if m else None


def es_exceso(ev: dict) -> bool:
    """Misma definición que el resto del sistema.

    Ojo: `excesos_varios_parametros` NO es velocidad (aparece con 10-28 km/h);
    incluirlo infla el conteo ~2.7x. Por eso ni se consulta.
    """
    return (float(ev.get('infraccion_80_kmh') or 0) > 0
            or float(ev.get('excesos_50_80_kmh') or 0) > 0
            or float(ev.get('velocidad') or 0) >= UMBRAL_EXCESO)


# ─────────────────────────────────────────────────────────────────────────────
# Núcleo
# ─────────────────────────────────────────────────────────────────────────────
def informe_cargado(source: str, fecha_dia: str) -> bool:
    """¿Existe ya el informe diario de este proveedor para este día?

    Es la pregunta que separa 'descartada' de 'todavía no sé'. Se responde
    mirando si hay CUALQUIER evento de esa fuente ese día — el informe se carga
    completo, para toda la flota, de una sola vez.
    """
    return count('alertas_diarias_gps', [
        f'gps=ilike.*{source}*',
        f'fecha_dia=eq.{fecha_dia}',
    ]) > 0


def eventos_de_placa(placa: str, fecha_dia: str) -> list[dict]:
    return fetch_all(
        'alertas_diarias_gps',
        'placa,fecha,fecha_dia,velocidad,infraccion_80_kmh,excesos_50_80_kmh,latitud,longitud,lugar,gps,estado',
        filters=[f'placa=eq.{placa}', f'fecha_dia=eq.{fecha_dia}'],
        order='fecha.asc',
    )


def validar(item: dict) -> dict:
    """Devuelve el resultado para una entrada de la cola.

    `estado='pendiente'` significa "reintentar": el informe aún no está.
    """
    placa = norm_placa(item['plate'])
    source = str(item['source'] or '').upper()
    t_alerta = _parse_ts(item['alert_timestamp'])

    if t_alerta is None:
        return {'estado': 'error', 'ultimo_error': f"alert_timestamp ilegible: {item['alert_timestamp']!r}"}

    # El informe diario se indexa por fecha_dia en hora Colombia.
    fecha_dia = t_alerta.astimezone(COL_OFFSET).strftime('%Y-%m-%d')
    dias_transcurridos = (datetime.now(COL_OFFSET) - t_alerta.astimezone(COL_OFFSET)).days

    if not informe_cargado(source, fecha_dia):
        if dias_transcurridos > DIAS_MAX_ESPERA or item.get('intentos', 0) + 1 >= MAX_INTENTOS:
            return {
                'estado': 'inconcluyente',
                'motivo': (f'El informe diario de {source} para el {fecha_dia} no se cargó dentro del plazo '
                           f'({DIAS_MAX_ESPERA} días). No se pudo verificar; requiere revisión manual.'),
                'processed_at': datetime.now(COL_OFFSET).isoformat(),
            }
        # Sin informe no hay veredicto. Se reintenta.
        return {
            'estado': 'pendiente',
            'ultimo_error': f'Informe diario de {source} del {fecha_dia} aún no cargado; se reintentará.',
        }

    eventos = [e for e in eventos_de_placa(placa, fecha_dia) if es_exceso(e)]

    # Eventos del proveedor dentro de la ventana alrededor de la alerta.
    cercanos = []
    for e in eventos:
        t_ev = _parse_ts(e.get('fecha'))
        if t_ev is None:
            continue
        delta = abs((t_ev - t_alerta).total_seconds()) / 60.0
        if delta <= VENTANA_MIN:
            cercanos.append((delta, e))
    cercanos.sort(key=lambda x: x[0])

    ahora = datetime.now(COL_OFFSET).isoformat()

    if not cercanos:
        # El informe SÍ está cargado y no registra el exceso: es un falso positivo.
        return {
            'estado': 'completado',
            'veredicto': 'descartada',
            'motivo': (f'El informe diario de {source} del {fecha_dia} está cargado y no registra ningún exceso '
                       f'de {placa} en ±{VENTANA_MIN} min de la alerta '
                       f'({len(eventos)} excesos ese día, ninguno en la ventana). Falso positivo.'),
            'traza': [_fila_traza(e) for e in eventos[:20]],
            'processed_at': ahora,
        }

    mejor = cercanos[0][1]
    vel_max = max(float(e.get('velocidad') or 0) for _, e in cercanos)
    grave = vel_max >= UMBRAL_GRAVE

    return {
        'estado': 'completado',
        'veredicto': 'confirmada',
        'motivo': (f'Confirmado contra el informe diario de {source} ({fecha_dia}): '
                   f'{len(cercanos)} evento(s) de exceso de {placa} en ±{VENTANA_MIN} min de la alerta. '
                   f'Velocidad máxima registrada {vel_max:.0f} km/h'
                   f'{" (exceso GRAVE ≥80)" if grave else ""}. Lugar: {mejor.get("lugar") or "n/d"}.'),
        'velocidad_max': round(vel_max, 2),
        'traza': [_fila_traza(e) for _, e in cercanos[:20]],
        'processed_at': ahora,
    }


def _fila_traza(e: dict) -> dict:
    return {
        'fecha': e.get('fecha'),
        'velocidad': float(e.get('velocidad') or 0),
        'lat': e.get('latitud'),
        'lon': e.get('longitud'),
        'lugar': e.get('lugar'),
        'grave': float(e.get('infraccion_80_kmh') or 0) > 0 or float(e.get('velocidad') or 0) >= UMBRAL_GRAVE,
    }


def propagar_a_alertas(alert_id: str, res: dict) -> None:
    """Escribe el veredicto en saved_alerts y alert_history.

    Solo se llama con veredicto real. `is_real_alert` queda NULL cuando no se
    verificó — NULL es información honesta ("no verificado"); true/false sería
    afirmar algo que nadie comprobó.
    """
    valores = {
        'is_real_alert': res['veredicto'] == 'confirmada',
        'validation_reason': res['motivo'],
        'updated_at': datetime.now(COL_OFFSET).isoformat(),
    }
    for tabla in ('saved_alerts', 'alert_history'):
        try:
            patch(tabla, [f'alert_id=eq.{alert_id}'], valores)
        except RuntimeError as e:
            # Que la alerta no exista en una de las tablas es normal (puede haber
            # sido movida a histórico). No es motivo para fallar el lote.
            print(f'      aviso: no se pudo actualizar {tabla} para {alert_id}: {e}', file=sys.stderr)


def main() -> int:
    ap = argparse.ArgumentParser(description='Valida alertas de velocidad contra el informe diario del proveedor.')
    ap.add_argument('--limite', type=int, default=200, help='Máximo de alertas a procesar por corrida.')
    ap.add_argument('--dry-run', action='store_true', help='Calcula e imprime sin escribir nada.')
    args = ap.parse_args()

    check_env(write=not args.dry_run)

    pendientes = fetch_all(
        'alert_validation_queue',
        'id,alert_id,plate,source,alert_timestamp,intentos',
        filters=['estado=eq.pendiente'],
        order='created_at.asc',
        page=min(args.limite, 1000),
    )[:args.limite]

    if not pendientes:
        print('No hay alertas pendientes de validación.')
        return 0

    print(f'Procesando {len(pendientes)} alerta(s) pendiente(s)…\n')
    tally = {'confirmada': 0, 'descartada': 0, 'reintentar': 0, 'inconcluyente': 0, 'error': 0}

    for item in pendientes:
        res = validar(item)
        estado = res['estado']

        if estado == 'pendiente':
            tally['reintentar'] += 1
            etiqueta = 'reintentar'
        elif estado == 'completado':
            tally[res['veredicto']] += 1
            etiqueta = res['veredicto'].upper()
        else:
            tally[estado] = tally.get(estado, 0) + 1
            etiqueta = estado.upper()

        print(f"  {item['plate']:9s} {str(item['alert_timestamp'])[:16]} {item['source']:9s} -> {etiqueta}")
        if res.get('motivo'):
            print(f"      {res['motivo'][:120]}")

        if args.dry_run:
            continue

        patch('alert_validation_queue', [f"id=eq.{item['id']}"],
              {**res, 'intentos': (item.get('intentos') or 0) + 1})

        if estado == 'completado':
            propagar_a_alertas(item['alert_id'], res)

    print(f'\nResumen: {tally}')
    if args.dry_run:
        print('[dry-run] No se escribió nada.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
