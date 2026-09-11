"""
Criterio ÚNICO de clasificación de excesos de velocidad (lado Python).

Es la traducción literal de `services/speedingClassification.ts`, que es la
definición canónica. Si cambia una, cambian las dos (y el bloque equivalente de
`api/agent.py`, que va inline porque es una función serverless de un solo
archivo).

Regla: el tramo de un exceso lo decide el UMBRAL CONFIGURADO en la plataforma
GPS, que viaja en el nombre/estado del evento ("Exceso de Velocidad >80 km/h
Magnex", "Infraccion 80 Km/h").

Por qué: las reglas por umbral se solapan. Un vehículo a 85 km/h dispara la
regla de >80 y, si existe en esa zona, también la de >40. Decidir el tramo por
la velocidad medida contaba el evento de la regla de >40 como infracción de >80
—una falta grave que la configuración del GPS nunca emitió—.

Cuando el nombre no declara umbral, depende de la PLATAFORMA:

  GEOTAB → el evento NO cuenta en ningún tramo. Geotab tiene la regla de umbral
    de Magnex Y las genéricas contra el límite de la vía ("Exceso de velocidad",
    "Exceso de velocidad (nuevo)"), que disparan sobre el mismo recorrido y
    duplican: el 10/09/2026, POS648 generó tres eventos del mismo paso a ~101
    km/h. Contarlas por velocidad medida subía las faltas graves del día de 33 a
    62. Los eventos se siguen guardando y se ven en el detalle; no suman.

  COLTRACK / FAGOR (y fuente desconocida) → velocidad medida. Fagor manda
    siempre "Alm. Exceso de velocidad en la via", su único nombre para
    velocidad: exigirle umbral en el nombre borraría todos sus excesos.

Solo librería estándar: lo importan tanto el worker de validación como el
entrenamiento ML.
"""

from __future__ import annotations

import re
import unicodedata

UMBRAL_GRAVE = 80
UMBRAL_MODERADO = 50

_RE_CON_UNIDAD = re.compile(r'(\d{1,3})\s*(?:km\s*/?\s*h|kmh|kph|k/h)\b')
_RE_SIN_UNIDAD = re.compile(r'(?:velocidad|infraccion|speeding|speed|limite)[^\d]{0,12}(\d{1,3})\b')


def _normalizar(valor) -> str:
    """Minúsculas y sin tildes, para comparar nombres de reglas de forma estable."""
    texto = '' if valor is None else str(valor)
    return ''.join(
        c for c in unicodedata.normalize('NFD', texto) if unicodedata.category(c) != 'Mn'
    ).lower().strip()


def _umbral_plausible(valor: int) -> bool:
    return 5 <= valor <= 200


def umbral_configurado(estado) -> int | None:
    """Umbral (km/h) declarado en el nombre del evento, o None si no declara ninguno."""
    nombre = _normalizar(estado)
    if not nombre:
        return None
    for patron in (_RE_CON_UNIDAD, _RE_SIN_UNIDAD):
        m = patron.search(nombre)
        if m:
            valor = int(m.group(1))
            if _umbral_plausible(valor):
                return valor
    return None


def es_frenada_brusca(estado) -> bool:
    nombre = _normalizar(estado)
    return 'frenad' in nombre or 'brake' in nombre or 'desaceleracion' in nombre


def es_exceso_de_velocidad(estado) -> bool:
    """¿El evento es un exceso de VELOCIDAD?

    Se exige una señal explícita de velocidad: que el nombre diga "exceso" no
    basta, porque "Exceso de RPM" de Coltrack no es velocidad.
    """
    nombre = _normalizar(estado)
    if not nombre or es_frenada_brusca(nombre) or 'rpm' in nombre:
        return False
    return ('velocidad' in nombre or 'infraccion' in nombre
            or 'speed' in nombre or 'limite de vel' in nombre)


def exige_umbral_declarado(fuente) -> bool:
    """Plataformas donde un exceso solo cuenta si el nombre declara el umbral."""
    return _normalizar(fuente) == 'geotab'


def velocidad_de_referencia(estado, velocidad, fuente) -> float | None:
    """Umbral declarado en el nombre y, a falta de él, la velocidad medida.

    Devuelve None cuando el evento no se puede ubicar en ningún tramo: una regla
    sin umbral declarado en una plataforma que lo exige (Geotab).
    """
    umbral = umbral_configurado(estado)
    if umbral is not None:
        return float(umbral)
    if exige_umbral_declarado(fuente):
        return None
    try:
        return float(velocidad or 0)
    except (TypeError, ValueError):
        return 0.0


def _tramo(estado, velocidad, fuente) -> float | None:
    if not es_exceso_de_velocidad(estado):
        return None
    return velocidad_de_referencia(estado, velocidad, fuente)


def es_exceso_grave(estado, velocidad, fuente) -> bool:
    """Falta grave = exceso de >= 80 km/h según la configuración del GPS."""
    ref = _tramo(estado, velocidad, fuente)
    return ref is not None and ref >= UMBRAL_GRAVE


def es_exceso(estado, velocidad, fuente) -> bool:
    """Exceso de velocidad reportable (>= 50 km/h de umbral/velocidad)."""
    ref = _tramo(estado, velocidad, fuente)
    return ref is not None and ref >= UMBRAL_MODERADO


def es_evento_reportable(estado) -> bool:
    """¿Vale la pena guardar/mostrar el evento? Más amplio que "cuenta en un tramo"."""
    return es_frenada_brusca(estado) or es_exceso_de_velocidad(estado)
