"""
Acceso a Supabase (PostgREST) para los jobs de ML.

A diferencia de api/agent.py — que lee con la anon key y solo hace SELECT — los
jobs de este paquete ESCRIBEN resultados, así que necesitan SUPABASE_SERVICE_ROLE_KEY.
Esa clave bypassa RLS y nunca debe salir de GitHub Actions / el worker.
"""

from __future__ import annotations

import json
import os
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


def fetch_all(table: str, select: str = '*', filters: list[str] | None = None,
              order: str | None = None, page: int = 1000) -> list[dict]:
    """Pagina hasta traer todo. PostgREST corta en 1000 filas por defecto."""
    out: list[dict] = []
    offset = 0
    while True:
        parts = [f"select={urllib.parse.quote(select, safe='*,')}", f'limit={page}', f'offset={offset}']
        if order:
            parts.append(f'order={order}')
        parts.extend(filters or [])
        url = f'{SUPABASE_URL}/rest/v1/{table}?' + '&'.join(parts)
        req = urllib.request.Request(url, headers=_headers(key=_read_key()))
        with urllib.request.urlopen(req, timeout=60) as r:
            chunk = json.loads(r.read().decode('utf-8'))
        out.extend(chunk)
        if len(chunk) < page:
            return out
        offset += page


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
    url = f'{SUPABASE_URL}/rest/v1/{table}?' + '&'.join(filters)
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
    parts.extend(filters or [])
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
