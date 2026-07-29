"""
Acceso a Supabase (PostgREST) para los jobs de ML.

A diferencia de api/agent.py — que lee con la anon key y solo hace SELECT — los
jobs de este paquete ESCRIBEN resultados, así que necesitan SUPABASE_SERVICE_ROLE_KEY.
Esa clave bypassa RLS y nunca debe salir de GitHub Actions / el worker.
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

COL_OFFSET = timezone(timedelta(hours=-5))  # Colombia (UTC-5, sin horario de verano)

SUPABASE_URL = (os.environ.get('VITE_SUPABASE_URL') or os.environ.get('SUPABASE_URL') or '').rstrip('/')
SERVICE_KEY = (os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_SERVICE_KEY') or '')

# Clave de solo lectura. Permite correr `--dry-run` en local sin tener la
# service_role a mano: las tablas de origen ya son legibles por anon.
ANON_KEY = (os.environ.get('VITE_SUPABASE_ANON_KEY') or os.environ.get('SUPABASE_ANON_KEY') or '')


def hoy_col() -> str:
    return datetime.now(COL_OFFSET).strftime('%Y-%m-%d')


def dias_atras_col(n: int) -> str:
    return (datetime.now(COL_OFFSET) - timedelta(days=n)).strftime('%Y-%m-%d')


def check_env(write: bool = True) -> None:
    """Falla temprano y con un mensaje claro: un job de cron que revienta a mitad
    de la escritura es peor que uno que no arranca.

    `write=False` (dry-run) se conforma con la anon key, porque solo lee.
    """
    faltantes = []
    if not SUPABASE_URL:
        faltantes.append('SUPABASE_URL (o VITE_SUPABASE_URL)')
    if write and not SERVICE_KEY:
        faltantes.append('SUPABASE_SERVICE_ROLE_KEY')
    if not write and not (SERVICE_KEY or ANON_KEY):
        faltantes.append('SUPABASE_SERVICE_ROLE_KEY o VITE_SUPABASE_ANON_KEY')
    if faltantes:
        print(f"ERROR: faltan variables de entorno: {', '.join(faltantes)}", file=sys.stderr)
        sys.exit(1)


def _read_key() -> str:
    return SERVICE_KEY or ANON_KEY


def _headers(extra: dict | None = None, key: str | None = None) -> dict:
    k = key or SERVICE_KEY
    h = {
        'apikey': k,
        'Authorization': f'Bearer {k}',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    }
    if extra:
        h.update(extra)
    return h


# Caracteres que PostgREST interpreta como SINTAXIS dentro del valor de un filtro
# y que por tanto no se pueden percent-encodear: `*` es el comodín de like/ilike,
# y `,()` delimitan las listas de `in.(...)`.
_SAFE_EN_VALOR = '*,()'

# col=[not.]op.valor  — el valor es todo lo que sigue al primer operador.
_FILTRO = re.compile(r'^(?P<col>[^=]+)=(?P<op>(?:not\.)?[a-z]+\.)(?P<val>.*)$', re.S)


def encode_filter(f: str) -> str:
    """Percent-encodea el VALOR de un filtro PostgREST dejando intacta la sintaxis.

    Imprescindible porque los identificadores del sistema llevan espacios y `:`;
    p. ej. `COL-PWQ878-51-Exceso de Velocidad-2026-07-27T15:38:34.089Z`.
    Interpolado crudo en la URL, http.client lanza
    `InvalidURL: URL can't contain control characters`, que no es HTTPError y por
    tanto se escapaba de todos los `except` del worker y tumbaba el lote completo
    en la primera alerta. También encodea `+`, que PostgREST leería como espacio
    y rompería silenciosamente cualquier filtro sobre timestamps con offset.

    Lo que no reconoce (`or=(...)`, `and=(...)`) se devuelve tal cual: es sintaxis
    compuesta y el llamador es responsable de construirla ya válida.
    """
    m = _FILTRO.match(f)
    if not m:
        return f
    return f"{m['col']}={m['op']}{urllib.parse.quote(m['val'], safe=_SAFE_EN_VALOR)}"


def _encode_filters(filters: list[str] | None) -> list[str]:
    return [encode_filter(f) for f in (filters or [])]


def fetch_all(table: str, select: str = '*', filters: list[str] | None = None,
              order: str | None = None, page: int = 1000,
              max_rows: int | None = None) -> list[dict]:
    """Pagina hasta traer todo. PostgREST corta en 1000 filas por defecto.

    `max_rows` corta la paginación en seco. Sin él, un llamador que solo quiere
    las primeras N filas de una tabla grande se las trae todas y descarta el
    resto: la cola de validación tenía 1.670 pendientes y el worker hacía 9
    peticiones para quedarse con 200.
    """
    out: list[dict] = []
    offset = 0
    while True:
        lote = page if max_rows is None else min(page, max_rows - len(out))
        if lote <= 0:
            return out
        parts = [f"select={urllib.parse.quote(select, safe='*,')}", f'limit={lote}', f'offset={offset}']
        if order:
            parts.append(f'order={order}')
        parts.extend(_encode_filters(filters))
        url = f'{SUPABASE_URL}/rest/v1/{table}?' + '&'.join(parts)
        req = urllib.request.Request(url, headers=_headers(key=_read_key()))
        with urllib.request.urlopen(req, timeout=60) as r:
            chunk = json.loads(r.read().decode('utf-8'))
        out.extend(chunk)
        if len(chunk) < lote:
            return out
        offset += lote


def upsert(table: str, rows: list[dict], on_conflict: str, chunk: int = 500) -> int:
    """Upsert por lotes. `on_conflict` debe coincidir con el UNIQUE de la tabla,
    de lo contrario PostgREST inserta duplicados en vez de actualizar."""
    if not rows:
        return 0
    total = 0
    for i in range(0, len(rows), chunk):
        batch = rows[i:i + chunk]
        url = f'{SUPABASE_URL}/rest/v1/{table}?on_conflict={urllib.parse.quote(on_conflict)}'
        body = json.dumps(batch, ensure_ascii=False, default=str).encode('utf-8')
        req = urllib.request.Request(
            url, data=body, method='POST',
            headers=_headers({'Prefer': 'resolution=merge-duplicates,return=minimal'}),
        )
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                r.read()
            total += len(batch)
        except urllib.error.HTTPError as e:
            detalle = e.read().decode('utf-8', 'replace')[:500]
            raise RuntimeError(f'Upsert en {table} falló ({e.code}): {detalle}') from e
    return total


def patch(table: str, filters: list[str], values: dict) -> None:
    """UPDATE por filtro PostgREST. `filters` va como ['id=eq.<uuid>']."""
    url = f'{SUPABASE_URL}/rest/v1/{table}?' + '&'.join(_encode_filters(filters))
    body = json.dumps(values, ensure_ascii=False, default=str).encode('utf-8')
    req = urllib.request.Request(
        url, data=body, method='PATCH',
        headers=_headers({'Prefer': 'return=minimal'}),
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            r.read()
    except urllib.error.HTTPError as e:
        detalle = e.read().decode('utf-8', 'replace')[:500]
        raise RuntimeError(f'Patch en {table} falló ({e.code}): {detalle}') from e


def count(table: str, filters: list[str] | None = None) -> int:
    """COUNT exacto sin traer filas (Range 0-0 + count=exact)."""
    parts = ['select=id', 'limit=1']
    parts.extend(_encode_filters(filters))
    url = f'{SUPABASE_URL}/rest/v1/{table}?' + '&'.join(parts)
    req = urllib.request.Request(url, headers=_headers(
        {'Prefer': 'count=exact', 'Range': '0-0'}, key=_read_key()))
    with urllib.request.urlopen(req, timeout=60) as r:
        r.read()
        cr = r.headers.get('Content-Range') or ''
    tail = cr.split('/')[-1] if '/' in cr else ''
    return int(tail) if tail.isdigit() else 0


def insert(table: str, row: dict) -> dict | None:
    url = f'{SUPABASE_URL}/rest/v1/{table}'
    body = json.dumps(row, ensure_ascii=False, default=str).encode('utf-8')
    req = urllib.request.Request(
        url, data=body, method='POST',
        headers=_headers({'Prefer': 'return=representation'}),
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.loads(r.read().decode('utf-8'))
        return data[0] if data else None
    except urllib.error.HTTPError as e:
        detalle = e.read().decode('utf-8', 'replace')[:500]
        raise RuntimeError(f'Insert en {table} falló ({e.code}): {detalle}') from e
