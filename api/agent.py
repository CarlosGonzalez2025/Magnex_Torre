"""
Agente de IA propio — Torre de Control (Python puro, sin APIs externas).

Motor determinista de dominio cerrado: entiende preguntas en español sobre la
flota, las enruta a "herramientas" (consultas de solo lectura a Supabase vía
PostgREST) y redacta la respuesta con plantillas. NO usa Claude/OpenAI/Gemini ni
ningún modelo externo — corre como función serverless de Vercel (runtime Python),
solo con la librería estándar.

Contrato HTTP (compatible con el front AiChat.tsx):
  POST /api/agent  { "messages": [{ "role": "user"|"assistant", "content": "..." }] }
  -> 200 { "answer": "...", "toolResults": [{ "tool", "args", "result" }] }
  -> 4xx/5xx { "error": "..." }

La capa de conversación abierta con un LLM local (Ollama en un VPS) se puede
enchufar después como "fallback" cuando el router no reconoce la intención; este
archivo es el núcleo determinista que ambas variantes comparten.
"""

from http.server import BaseHTTPRequestHandler
import json
import os
import re
import unicodedata
import urllib.request
import urllib.parse
from datetime import datetime, timezone, timedelta

# ─────────────────────────────────────────────────────────────────────────────
# Configuración
# ─────────────────────────────────────────────────────────────────────────────
SUPABASE_URL = (os.environ.get('VITE_SUPABASE_URL') or os.environ.get('SUPABASE_URL')
                or 'https://cmzeijcyykzdmvisojte.supabase.co')
SUPABASE_KEY = (os.environ.get('VITE_SUPABASE_ANON_KEY') or os.environ.get('SUPABASE_ANON_KEY')
                or 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME')

COL_OFFSET = timezone(timedelta(hours=-5))  # Colombia (UTC-5, sin horario de verano)


def hoy_col() -> str:
    return datetime.now(COL_OFFSET).strftime('%Y-%m-%d')


def ayer_col() -> str:
    return (datetime.now(COL_OFFSET) - timedelta(days=1)).strftime('%Y-%m-%d')


# ─────────────────────────────────────────────────────────────────────────────
# Acceso a datos (PostgREST, solo lectura)
# ─────────────────────────────────────────────────────────────────────────────
def _q(col: str, op: str, val) -> str:
    return f"{col}={op}.{urllib.parse.quote(str(val), safe='*')}"


def pg_fetch_all(table: str, select: str = '*', filters=None, order: str = None, page: int = 1000):
    """Trae todas las filas de una tabla (con filtros) paginando de a 1000."""
    rows, offset = [], 0
    while True:
        parts = [f"select={urllib.parse.quote(select, safe='*,')}", f"limit={page}", f"offset={offset}"]
        if order:
            parts.append(f"order={order}")
        for f in (filters or []):
            parts.append(f)
        url = f"{SUPABASE_URL}/rest/v1/{table}?" + "&".join(parts)
        req = urllib.request.Request(url, headers={
            'apikey': SUPABASE_KEY,
            'Authorization': f'Bearer {SUPABASE_KEY}',
            'Accept': 'application/json',
        })
        with urllib.request.urlopen(req, timeout=25) as r:
            data = json.loads(r.read().decode('utf-8'))
        rows.extend(data)
        if len(data) < page:
            break
        offset += page
    return rows


# ─────────────────────────────────────────────────────────────────────────────
# Utilidades de dominio
# ─────────────────────────────────────────────────────────────────────────────
def strip_accents(s: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFD', s or '') if unicodedata.category(c) != 'Mn')


def norm(s) -> str:
    return re.sub(r'\s+', '', str(s or '').upper()).strip()


def normtxt(s: str) -> str:
    return strip_accents(str(s or '')).lower().strip()


def es_activo(estado) -> bool:
    return norm(estado) == 'ACTIVO'


PLACEHOLDER_COND = {'', 'no registra', 'sin conductor', 'desconocido', 'no asignado',
                    'conductor n/a', 'na', 'n/a', 'sin asignar'}


def es_cond_placeholder(nombre) -> bool:
    return normtxt(nombre).strip() in PLACEHOLDER_COND


_veh_cache = None


def get_vehiculos():
    global _veh_cache
    if _veh_cache is None:
        _veh_cache = pg_fetch_all('vehiculos', 'id,placa,cliente,contrato_id,estado,tipo_activo')
    return _veh_cache


def placa_map():
    return {norm(v.get('placa')): v for v in get_vehiculos()}


MESES = {
    'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 'mayo': 5, 'junio': 6,
    'julio': 7, 'agosto': 8, 'septiembre': 9, 'setiembre': 9, 'octubre': 10,
    'noviembre': 11, 'diciembre': 12,
    'ene': 1, 'feb': 2, 'mar': 3, 'abr': 4, 'jun': 6, 'jul': 7, 'ago': 8,
    'sep': 9, 'oct': 10, 'nov': 11, 'dic': 12,
}


def _last_day(year: int, month: int) -> int:
    if month == 12:
        return 31
    return (datetime(year, month + 1, 1) - timedelta(days=1)).day


def extract_placa(text: str):
    m = re.search(r'\bplaca\s+([A-Za-z]{3}[0-9][0-9A-Za-z]{2})\b', text, re.I)
    if m:
        return m.group(1).upper()
    m = re.search(r'\b([A-Z]{3}[0-9][0-9A-Z]{2})\b', text.upper())
    if m:
        return m.group(1)
    return None


def extract_dates(tn: str):
    """Devuelve (inicio, fin) en YYYY-MM-DD o (None, None). tn = texto normalizado."""
    yr = int(hoy_col()[:4])
    if 'hoy' in tn:
        return hoy_col(), hoy_col()
    if 'ayer' in tn:
        return ayer_col(), ayer_col()
    # ISO explícitas
    iso = re.findall(r'\b(\d{4}-\d{2}-\d{2})\b', tn)
    if len(iso) >= 2:
        return min(iso[0], iso[1]), max(iso[0], iso[1])
    if len(iso) == 1:
        return iso[0], iso[0]
    # dd/mm/yyyy
    dmy = re.findall(r'\b(\d{1,2})/(\d{1,2})/(\d{4})\b', tn)
    if dmy:
        vals = [f"{y}-{int(m):02d}-{int(d):02d}" for d, m, y in dmy]
        return min(vals), max(vals)
    # "del N al M de MES [de YYYY]" / "entre N y M de MES"
    m = re.search(r'(?:del|entre)\s+(?:el\s+)?(\d{1,2})\s+(?:al|y|a)\s+(?:el\s+)?(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?', tn)
    if m and m.group(3) in MESES:
        mo = MESES[m.group(3)]
        y = int(m.group(4)) if m.group(4) else yr
        d1, d2 = sorted((int(m.group(1)), int(m.group(2))))
        return f"{y}-{mo:02d}-{d1:02d}", f"{y}-{mo:02d}-{d2:02d}"
    # "el N de MES [de YYYY]"
    m = re.search(r'\b(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?', tn)
    if m and m.group(2) in MESES:
        mo = MESES[m.group(2)]
        y = int(m.group(3)) if m.group(3) else yr
        d = int(m.group(1))
        return f"{y}-{mo:02d}-{d:02d}", f"{y}-{mo:02d}-{d:02d}"
    # mes completo: "en/de MES [de YYYY]" o "este mes"
    if 'este mes' in tn:
        h = datetime.now(COL_OFFSET)
        return f"{h.year}-{h.month:02d}-01", f"{h.year}-{h.month:02d}-{_last_day(h.year, h.month):02d}"
    for name, mo in MESES.items():
        if len(name) > 3 and re.search(rf'\bde\s+{name}\b|\ben\s+{name}\b', tn):
            ym = re.search(rf'{name}\s+de\s+(\d{{4}})', tn)
            y = int(ym.group(1)) if ym else yr
            return f"{y}-{mo:02d}-01", f"{y}-{mo:02d}-{_last_day(y, mo):02d}"
    return None, None


def match_contrato_cliente(tn: str):
    """Busca un nombre de contrato o cliente mencionado en el texto."""
    contrato = cliente = None
    try:
        contratos = pg_fetch_all('contratos', 'nombre,cliente')
    except Exception:
        contratos = []
    best = ''
    for c in contratos:
        n = normtxt(c.get('nombre'))
        if n and len(n) >= 3 and n in tn and len(n) > len(best):
            best, contrato = n, c.get('nombre')
    bestc = ''
    for c in contratos:
        cl = normtxt(c.get('cliente'))
        if cl and len(cl) >= 3 and cl in tn and len(cl) > len(bestc):
            bestc, cliente = cl, c.get('cliente')
    return contrato, cliente


# ─────────────────────────────────────────────────────────────────────────────
# Herramientas (mismos cálculos que el núcleo JS, reutilizables/validados)
# ─────────────────────────────────────────────────────────────────────────────
def tool_excesos_velocidad(args):
    desde = (args.get('fecha_inicio') or args.get('fecha') or hoy_col())
    hasta = (args.get('fecha_fin') or args.get('fecha') or hoy_col())
    filters = [_q('fecha_dia', 'gte', desde), _q('fecha_dia', 'lte', hasta)]
    if args.get('placa'):
        filters.append(_q('placa', 'ilike', f"*{args['placa']}*"))
    if args.get('contrato'):
        filters.append(_q('contrato_nombre', 'ilike', f"*{args['contrato']}*"))
    if args.get('cliente'):
        filters.append(_q('cliente', 'ilike', f"*{args['cliente']}*"))
    rows = pg_fetch_all('alertas_diarias_gps',
                        'placa,conductor,velocidad,infraccion_80_kmh,excesos_50_80_kmh,contrato_nombre,cliente,fecha_dia',
                        filters)

    def es_exceso(r):
        return (float(r.get('infraccion_80_kmh') or 0) > 0 or float(r.get('excesos_50_80_kmh') or 0) > 0
                or float(r.get('velocidad') or 0) >= 50)

    def es_grave(r):
        return float(r.get('infraccion_80_kmh') or 0) > 0 or float(r.get('velocidad') or 0) >= 80

    eventos = [r for r in rows if es_exceso(r)]
    if args.get('solo_graves'):
        eventos = [r for r in eventos if es_grave(r)]
    rango = desde if desde == hasta else f"{desde} a {hasta}"
    if not eventos:
        return {'rango': rango, 'totalEventos': 0,
                'mensaje': 'No se registraron excesos de velocidad para ese día/filtro.'}
    por_veh, por_cond = {}, {}
    for r in eventos:
        vel = float(r.get('velocidad') or 0)
        grave = es_grave(r)
        p = norm(r.get('placa')) or 'SIN_PLACA'
        o = por_veh.setdefault(p, {'placa': p, 'eventos': 0, 'graves': 0, 'velMax': 0,
                                   'contrato': r.get('contrato_nombre') or ''})
        o['eventos'] += 1
        o['graves'] += 1 if grave else 0
        o['velMax'] = max(o['velMax'], vel)
        if not es_cond_placeholder(r.get('conductor')):
            c = str(r.get('conductor')).strip()
            oc = por_cond.setdefault(c, {'conductor': c, 'eventos': 0, 'graves': 0, 'velMax': 0})
            oc['eventos'] += 1
            oc['graves'] += 1 if grave else 0
            oc['velMax'] = max(oc['velMax'], vel)
    vehs = sorted(por_veh.values(), key=lambda x: -x['eventos'])
    conds = sorted(por_cond.values(), key=lambda x: -x['eventos'])
    for o in vehs + conds:
        o['velMax'] = round(o['velMax'], 1)
    return {
        'rango': rango,
        'filtro': {'placa': args.get('placa') or 'Todas', 'contrato': args.get('contrato') or 'Todos',
                   'cliente': args.get('cliente') or 'Todos', 'soloGraves': bool(args.get('solo_graves'))},
        'totalEventos': len(eventos),
        'totalGraves': sum(1 for r in eventos if es_grave(r)),
        'totalVehiculos': len(vehs),
        'totalConductores': len(conds),
        'por_vehiculo': vehs[:40],
        'por_conductor': conds[:40],
    }


def tool_auditoria_excesos(args):
    uploads = pg_fetch_all('file_uploads', 'id,source')
    src_map = {str(u['id']): u.get('source') for u in uploads}
    filters = []
    if args.get('placa'):
        filters.append(_q('plate', 'ilike', f"*{args['placa']}*"))
    if args.get('fecha_inicio'):
        filters.append(_q('timestamp', 'gte', f"{args['fecha_inicio']}T00:00:00.000-05:00"))
    if args.get('fecha_fin'):
        filters.append(_q('timestamp', 'lte', f"{args['fecha_fin']}T23:59:59.999-05:00"))
    if args.get('solo_graves'):
        filters.append(_q('is_grave', 'eq', 'true'))
    # Sin order en el servidor: ordenar por timestamp en PostgREST sobre un ilike con
    # comodín inicial dispara "statement timeout". Se ordena en memoria (pocas filas).
    rows = pg_fetch_all('batch_alerts',
                        'plate,driver,alert_type,speed,timestamp,is_grave,location,upload_id',
                        filters)
    rows.sort(key=lambda r: str(r.get('timestamp') or ''), reverse=True)
    rango = (f"{args.get('fecha_inicio', 'inicio')} a {args.get('fecha_fin', 'hoy')}"
             if args.get('fecha_inicio') or args.get('fecha_fin') else 'todo el histórico')
    if not rows:
        quien = f"la placa {args['placa']}" if args.get('placa') else 'ese filtro'
        return {'placa': args.get('placa') or 'Todas', 'rango': rango, 'totalEventos': 0,
                'mensaje': f'No hay excesos de velocidad guardados en la Auditoría de Flota para {quien}.'}
    graves = sum(1 for r in rows if r.get('is_grave') is True)
    vel_max = max((float(r.get('speed') or 0) for r in rows), default=0)
    por_fuente, por_placa = {}, {}
    for r in rows:
        src = src_map.get(str(r.get('upload_id'))) or 'N/A'
        por_fuente[src] = por_fuente.get(src, 0) + 1
        p = norm(r.get('plate')) or 'SIN_PLACA'
        o = por_placa.setdefault(p, {'placa': p, 'eventos': 0, 'graves': 0, 'velMax': 0})
        o['eventos'] += 1
        o['graves'] += 1 if r.get('is_grave') else 0
        o['velMax'] = max(o['velMax'], float(r.get('speed') or 0))
    detalle = [{
        'fecha': str(r.get('timestamp'))[:16].replace('T', ' '),
        'placa': r.get('plate'), 'conductor': r.get('driver') or 'N/A',
        'velocidad': float(r.get('speed') or 0), 'grave': bool(r.get('is_grave')),
        'plataforma': src_map.get(str(r.get('upload_id'))) or 'N/A', 'lugar': r.get('location'),
    } for r in rows[:15]]
    for o in por_placa.values():
        o['velMax'] = round(o['velMax'], 1)
    return {
        'placa': args.get('placa') or 'Todas', 'rango': rango, 'totalEventos': len(rows),
        'totalGraves': graves, 'velMax': round(vel_max, 1), 'porPlataforma': por_fuente,
        'por_placa': sorted(por_placa.values(), key=lambda x: -x['eventos'])[:40], 'detalle': detalle,
    }


def tool_km_recorridos(args):
    desde = (args.get('fecha_inicio') or args.get('fecha') or hoy_col())
    hasta = (args.get('fecha_fin') or args.get('fecha') or hoy_col())
    filters = [_q('fecha', 'gte', desde), _q('fecha', 'lte', hasta)]
    if args.get('placa'):
        filters.append(_q('placa', 'ilike', f"*{args['placa']}*"))
    rows = pg_fetch_all('geotab_daily_metrics', 'placa,km,horas_conduccion,horas_ralenti,viajes,fecha', filters)
    pmap = placa_map()
    contrato_id = None
    if args.get('contrato'):
        try:
            c = pg_fetch_all('contratos', 'id,nombre', [_q('nombre', 'ilike', f"*{args['contrato']}*")])
            contrato_id = str(c[0]['id']) if c else '__none__'
        except Exception:
            contrato_id = '__none__'
    cliente = normtxt(args['cliente']) if args.get('cliente') else None

    def match(placa):
        if not contrato_id and not cliente:
            return True
        v = pmap.get(norm(placa))
        if not v:
            return False
        if contrato_id and str(v.get('contrato_id')) != contrato_id:
            return False
        if cliente and normtxt(v.get('cliente')) != cliente:
            return False
        return True

    fr = [r for r in rows if match(r.get('placa'))]
    rango = desde if desde == hasta else f"{desde} a {hasta}"
    if not fr:
        return {'rango': rango, 'totalKm': 0,
                'mensaje': 'No hay datos de kilómetros (Geotab) para ese día/filtro.'}
    agg = {}
    tk = tc = tr = tv = 0
    for r in fr:
        km = float(r.get('km') or 0); co = float(r.get('horas_conduccion') or 0)
        ra = float(r.get('horas_ralenti') or 0); vj = int(r.get('viajes') or 0)
        tk += km; tc += co; tr += ra; tv += vj
        p = norm(r.get('placa')) or 'SIN_PLACA'
        o = agg.setdefault(p, {'placa': p, 'km': 0, 'viajes': 0})
        o['km'] += km; o['viajes'] += vj
    por_veh = sorted(({'placa': o['placa'], 'km': round(o['km'], 1), 'viajes': o['viajes']}
                      for o in agg.values()), key=lambda x: -x['km'])
    return {
        'rango': rango, 'totalKm': round(tk, 1), 'vehiculosConDatos': len(agg),
        'horasConduccion': round(tc, 1), 'horasRalenti': round(tr, 1), 'viajes': tv,
        'por_vehiculo': por_veh[:40],
    }


def tool_listar_contratos(args):
    contratos = pg_fetch_all('contratos', 'id,nombre,cliente')
    vehs = pg_fetch_all('vehiculos', 'contrato_id,estado')
    conds = pg_fetch_all('conductores', 'contrato_id,estado')
    acc = {}
    for v in vehs:
        if v.get('contrato_id') is None:
            continue
        o = acc.setdefault(str(v['contrato_id']), {'veh': 0, 'vehAct': 0, 'cond': 0, 'condAct': 0})
        o['veh'] += 1; o['vehAct'] += 1 if es_activo(v.get('estado')) else 0
    for c in conds:
        if c.get('contrato_id') is None:
            continue
        o = acc.setdefault(str(c['contrato_id']), {'veh': 0, 'vehAct': 0, 'cond': 0, 'condAct': 0})
        o['cond'] += 1; o['condAct'] += 1 if es_activo(c.get('estado')) else 0
    lista = []
    for c in contratos:
        o = acc.get(str(c['id']), {'veh': 0, 'vehAct': 0, 'cond': 0, 'condAct': 0})
        lista.append({'contrato': c.get('nombre'), 'cliente': c.get('cliente') or '',
                      'vehiculos': o['veh'], 'vehiculosActivos': o['vehAct'],
                      'conductores': o['cond'], 'conductoresActivos': o['condAct']})
    if args.get('nombre'):
        n = normtxt(args['nombre'])
        lista = [c for c in lista if n in normtxt(c['contrato'])]
        if not lista:
            return {'encontrado': False, 'mensaje': f"No se encontró el contrato \"{args['nombre']}\"."}
    lista.sort(key=lambda x: -x['vehiculos'])
    return {'totalContratos': len(lista), 'contratos': lista}


def tool_estadisticas_flota(_args=None):
    vehs = pg_fetch_all('vehiculos', 'estado,cliente,tipo_activo')
    conds = pg_fetch_all('conductores', 'estado')
    contratos = pg_fetch_all('contratos', 'id')
    veh_act = sum(1 for v in vehs if es_activo(v.get('estado')))
    cond_act = sum(1 for c in conds if es_activo(c.get('estado')))
    por_cliente = {}
    for v in vehs:
        k = (str(v.get('cliente') or 'Sin cliente').strip() or 'Sin cliente')
        por_cliente[k] = por_cliente.get(k, 0) + 1
    clientes = sorted(({'cliente': k, 'vehiculos': n} for k, n in por_cliente.items()),
                      key=lambda x: -x['vehiculos'])[:20]
    return {
        'vehiculos': {'total': len(vehs), 'activos': veh_act, 'inactivos': len(vehs) - veh_act},
        'conductores': {'total': len(conds), 'activos': cond_act},
        'contratos': len(contratos), 'vehiculosPorCliente': clientes,
    }


def tool_buscar_vehiculo(args):
    placa = str(args.get('placa') or '').strip()
    vehs = pg_fetch_all('vehiculos',
                        'id,placa,estado,cliente,numero_contrato,marca,linea,tipo_activo,tipo_combustible,modelo,lugar,zona,coordinador,km_actual,fecha_venc_soat,fecha_venc_rtm',
                        [_q('placa', 'ilike', f"*{placa}*")])[:3]
    if not vehs:
        return {'encontrado': False, 'mensaje': f'No se encontró ningún vehículo con placa parecida a "{placa}".'}
    veh = vehs[0]
    per = pg_fetch_all('ralentis_periodos',
                       'periodo_inicio,periodo_fin,horas_motor_encendido,horas_motor_ralenti,consumo_combustible',
                       [_q('vehiculo_id', 'eq', veh['id'])], order='periodo_inicio.desc')[:1]
    ral = None
    if per:
        p = per[0]
        enc = float(p.get('horas_motor_encendido') or 0)
        pct = round(float(p.get('horas_motor_ralenti') or 0) / enc * 100, 1) if enc > 0 else None
        ral = {'periodo': f"{p['periodo_inicio']} a {p['periodo_fin']}", 'pctRalenti': pct,
               'horasRalenti': p.get('horas_motor_ralenti'), 'galones': p.get('consumo_combustible')}
    return {'encontrado': True, 'vehiculo': veh, 'ultimoPeriodoRalenti': ral,
            'coincidencias': [v['placa'] for v in vehs] if len(vehs) > 1 else None}


def tool_info_conductor(args):
    nombre = str(args.get('nombre') or '').strip()
    conds = pg_fetch_all('conductores',
                         'id,nombres,cedula,cargo,base,estado,proyecto,tipo_licencia,fecha_venc_particular,fecha_venc_publica',
                         [_q('nombres', 'ilike', f"*{nombre}*")])[:3]
    if not conds:
        return {'encontrado': False, 'mensaje': f'No se encontró el conductor "{nombre}".'}
    return {'encontrado': True, 'conductor': conds[0],
            'coincidencias': [c['nombres'] for c in conds] if len(conds) > 1 else None}


# ─────────────────────────────────────────────────────────────────────────────
# Redacción de respuestas (plantillas en español)
# ─────────────────────────────────────────────────────────────────────────────
def _fnum(n):
    try:
        f = float(n)
        return f"{int(f):,}".replace(',', '.') if f == int(f) else f"{f:,.1f}".replace(',', 'X').replace('.', ',').replace('X', '.')
    except Exception:
        return str(n)


def render_excesos(r):
    if r.get('totalEventos', 0) == 0:
        return r.get('mensaje', 'Sin excesos.')
    top_v = ', '.join(f"{v['placa']} ({v['eventos']})" for v in r['por_vehiculo'][:3])
    s = (f"El {r['rango']} se registraron {_fnum(r['totalEventos'])} excesos de velocidad "
         f"({_fnum(r['totalGraves'])} graves ≥80 km/h) en {r['totalVehiculos']} vehículos "
         f"y {r['totalConductores']} conductores.")
    if top_v:
        s += f" Vehículos con más excesos: {top_v}."
    if r.get('por_conductor'):
        c = r['por_conductor'][0]
        s += f" Conductor con más excesos: {c['conductor']} ({c['eventos']}, vel. máx {_fnum(c['velMax'])} km/h)."
    return s


def render_auditoria(r):
    if r.get('totalEventos', 0) == 0:
        return r.get('mensaje', 'Sin excesos guardados.')
    fuentes = ', '.join(f"{k}: {v}" for k, v in r.get('porPlataforma', {}).items())
    if r.get('placa') and r['placa'] != 'Todas':
        return (f"La placa {r['placa']} tiene {_fnum(r['totalEventos'])} excesos de velocidad guardados "
                f"en la Auditoría de Flota ({r['rango']}): {_fnum(r['totalGraves'])} graves ≥80 km/h, "
                f"velocidad máxima {_fnum(r['velMax'])} km/h. Plataforma(s): {fuentes}.")
    top = ', '.join(f"{v['placa']} ({v['eventos']})" for v in r.get('por_placa', [])[:3])
    return (f"En la Auditoría de Flota ({r['rango']}) hay {_fnum(r['totalEventos'])} excesos guardados "
            f"({_fnum(r['totalGraves'])} graves). Vehículos con más: {top}.")


def render_km(r):
    if r.get('totalKm', 0) == 0 and r.get('mensaje'):
        return r['mensaje']
    return (f"El {r['rango']}, la flota recorrió {_fnum(r['totalKm'])} km en {r['vehiculosConDatos']} "
            f"vehículos ({r['viajes']} viajes, {_fnum(r['horasConduccion'])} h de conducción). "
            + (f"Mayor recorrido: " + ', '.join(f"{v['placa']} ({_fnum(v['km'])} km)" for v in r['por_vehiculo'][:3]) + "."
               if r.get('por_vehiculo') else ''))


def render_listar_contratos(r):
    if r.get('encontrado') is False:
        return r['mensaje']
    if r['totalContratos'] == 1:
        c = r['contratos'][0]
        return (f"El contrato {c['contrato']} ({c['cliente']}) tiene {c['vehiculos']} vehículos "
                f"({c['vehiculosActivos']} activos) y {c['conductores']} conductores "
                f"({c['conductoresActivos']} activos).")
    top = '; '.join(f"{c['contrato']}: {c['vehiculos']} veh / {c['conductores']} cond" for c in r['contratos'][:5])
    return f"Hay {r['totalContratos']} contratos. Los de mayor flota — {top}."


def render_estadisticas(r):
    v, c = r['vehiculos'], r['conductores']
    top = ', '.join(f"{x['cliente']} ({x['vehiculos']})" for x in r['vehiculosPorCliente'][:5])
    return (f"La flota tiene {_fnum(v['total'])} vehículos ({v['activos']} activos, {v['inactivos']} inactivos), "
            f"{_fnum(c['total'])} conductores ({c['activos']} activos) y {r['contratos']} contratos. "
            f"Principales clientes por vehículos: {top}.")


def render_vehiculo(r):
    if not r.get('encontrado'):
        return r['mensaje']
    v = r['vehiculo']
    s = (f"Vehículo {v.get('placa')}: {v.get('marca') or ''} {v.get('linea') or ''}".strip()
         + f", tipo {v.get('tipo_activo') or 'N/D'}, cliente {v.get('cliente') or 'N/D'}, "
         f"estado {v.get('estado') or 'N/D'}, ubicación {v.get('lugar') or 'N/D'}.")
    if v.get('km_actual'):
        s += f" Km actual: {_fnum(v['km_actual'])}."
    if v.get('fecha_venc_soat'):
        s += f" SOAT vence {v['fecha_venc_soat']}."
    if r.get('ultimoPeriodoRalenti'):
        p = r['ultimoPeriodoRalenti']
        if p.get('pctRalenti') is not None:
            s += f" Último ralentí ({p['periodo']}): {p['pctRalenti']}%."
    return s


def render_conductor(r):
    if not r.get('encontrado'):
        return r['mensaje']
    c = r['conductor']
    return (f"Conductor {c.get('nombres')} (CC {c.get('cedula') or 'N/D'}): cargo {c.get('cargo') or 'N/D'}, "
            f"base {c.get('base') or 'N/D'}, estado {c.get('estado') or 'N/D'}, "
            f"licencia {c.get('tipo_licencia') or 'N/D'}"
            + (f", vence {c['fecha_venc_publica']}" if c.get('fecha_venc_publica') else '') + ".")


CAPACIDADES = (
    "Puedo responder con datos reales de la flota. Prueba con:\n"
    "• Excesos de velocidad de hoy o de un rango (por vehículo y por conductor).\n"
    "• ¿La placa ABC123 tiene excesos de velocidad? (auditoría guardada)\n"
    "• Kilómetros recorridos por la flota o una placa en un período.\n"
    "• ¿Cuántos vehículos y conductores tiene el contrato X? / todos los contratos.\n"
    "• Tamaño de la flota (vehículos activos, conductores, contratos).\n"
    "• Ficha de un vehículo (placa) o de un conductor (nombre)."
)


# ─────────────────────────────────────────────────────────────────────────────
# Router de intenciones
# ─────────────────────────────────────────────────────────────────────────────
def run_agent(messages):
    """Recibe el historial; enruta la última pregunta del usuario. Devuelve dict del contrato HTTP."""
    user_msgs = [m for m in (messages or []) if m.get('role') == 'user' and m.get('content')]
    if not user_msgs:
        return {'answer': CAPACIDADES, 'toolResults': []}
    text = str(user_msgs[-1]['content'])
    tn = normtxt(text)
    placa = extract_placa(text)
    d1, d2 = extract_dates(tn)
    contrato, cliente = (None, None)
    if any(k in tn for k in ('contrato', 'cliente', 'km', 'kilomet', 'exceso', 'velocidad')):
        contrato, cliente = match_contrato_cliente(tn)
    solo_graves = 'grave' in tn

    tool = tool_args = None

    # 1) Kilómetros
    if re.search(r'\bkm\b|kilomet|recorr|kilometra', tn):
        tool = ('km_recorridos', tool_km_recorridos)
        tool_args = {'placa': placa, 'contrato': contrato, 'cliente': cliente}
        if d1:
            tool_args.update(fecha_inicio=d1, fecha_fin=d2)
    # 2) Excesos de velocidad
    elif re.search(r'exceso|excesos|velocidad|infrac|veloc', tn):
        usa_auditoria = any(k in tn for k in ('auditor', 'guard', 'autoguard', 'histor', 'cargad'))
        if not usa_auditoria and not d1 and placa:
            usa_auditoria = True  # "¿la placa X tiene excesos?" sin fecha -> histórico auditoría
        if usa_auditoria:
            tool = ('auditoria_excesos', tool_auditoria_excesos)
            tool_args = {'placa': placa, 'solo_graves': solo_graves}
            if d1:
                tool_args.update(fecha_inicio=d1, fecha_fin=d2)
        else:
            tool = ('excesos_velocidad', tool_excesos_velocidad)
            tool_args = {'placa': placa, 'contrato': contrato, 'cliente': cliente, 'solo_graves': solo_graves}
            if d1:
                tool_args.update(fecha_inicio=d1, fecha_fin=d2)
    # 3) Contratos
    elif 'contrato' in tn:
        if contrato or re.search(r'del contrato|contrato\s+\w', tn):
            tool = ('listar_contratos', tool_listar_contratos)
            tool_args = {'nombre': contrato} if contrato else {}
        else:
            tool = ('listar_contratos', tool_listar_contratos)
            tool_args = {}
    # 4) Flota / conteos globales
    elif re.search(r'cuantos?\s+(vehiculos|carros|conductores)|flota|estadistic|total de (vehiculos|conductores)', tn):
        if 'por contrato' in tn:
            tool = ('listar_contratos', tool_listar_contratos); tool_args = {}
        else:
            tool = ('estadisticas_flota', tool_estadisticas_flota); tool_args = {}
    # 5) Ficha de vehículo
    elif placa and re.search(r'ficha|vehiculo|informacion|datos|estado|soat|ralenti', tn):
        tool = ('buscar_vehiculo', tool_buscar_vehiculo); tool_args = {'placa': placa}
    # 6) Ficha de conductor
    elif re.search(r'conductor|conducto|cedula|licencia', tn):
        m = re.search(r'conductor\s+([a-záéíóúñ ]{3,})', tn)
        nombre = m.group(1).strip() if m else None
        if nombre:
            tool = ('info_conductor', tool_info_conductor); tool_args = {'nombre': nombre}

    if tool is None:
        return {'answer': "No estoy seguro de qué dato necesitas.\n\n" + CAPACIDADES, 'toolResults': []}

    name, fn = tool
    tool_args = {k: v for k, v in (tool_args or {}).items() if v is not None}
    try:
        result = fn(tool_args)
    except Exception as e:  # noqa: BLE001
        return {'error': f'Fallo al consultar la base ({name}): {e}'}

    renderers = {
        'excesos_velocidad': render_excesos, 'auditoria_excesos': render_auditoria,
        'km_recorridos': render_km, 'listar_contratos': render_listar_contratos,
        'estadisticas_flota': render_estadisticas, 'buscar_vehiculo': render_vehiculo,
        'info_conductor': render_conductor,
    }
    answer = renderers[name](result)
    return {'answer': answer, 'toolResults': [{'tool': name, 'args': tool_args, 'result': result}]}


# ─────────────────────────────────────────────────────────────────────────────
# Handler serverless (Vercel Python)
# ─────────────────────────────────────────────────────────────────────────────
class handler(BaseHTTPRequestHandler):
    def _send(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST,OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):  # noqa: N802
        self._send(200, {})

    def do_POST(self):  # noqa: N802
        global _veh_cache
        _veh_cache = None  # refrescar caché por invocación
        try:
            length = int(self.headers.get('Content-Length') or 0)
            raw = self.rfile.read(length) if length else b'{}'
            body = json.loads(raw.decode('utf-8') or '{}')
            messages = body.get('messages') or []
            if not isinstance(messages, list) or not messages:
                return self._send(400, {'error': 'Falta el historial de mensajes.'})
            out = run_agent(messages)
            self._send(200, out)
        except Exception as e:  # noqa: BLE001
            self._send(500, {'error': f'Fallo en el asistente: {e}'})
