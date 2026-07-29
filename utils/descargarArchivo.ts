/**
 * Descarga un Blob como archivo desde el navegador.
 *
 * Centraliza el patrón que estaba repetido en cada servicio de exportación,
 * porque esas copias compartían dos fallos que hacían que la descarga no se
 * completara en algunos navegadores:
 *
 * 1. `URL.revokeObjectURL()` se llamaba en la misma vuelta del bucle de
 *    eventos que `click()`. Chrome de escritorio suele tolerarlo, pero Safari,
 *    iOS y varios WebView de Android liberan el blob antes de haber empezado a
 *    leerlo y abortan la descarga **en silencio**: sin archivo y sin error en
 *    consola. Aquí se libera de forma diferida.
 *
 * 2. Varias copias no insertaban el enlace en el documento antes de pulsarlo.
 *    Firefox exige que el elemento esté en el DOM para que `click()` dispare
 *    la descarga.
 *
 * El comportamiento visible es el de siempre: se descarga el mismo archivo con
 * el mismo nombre. Lo único que cambia es que ahora también termina en los
 * navegadores donde antes fallaba.
 */

/** Margen antes de liberar la URL del blob. Suficiente para que el navegador
 *  haya tomado el contenido, sin retener memoria de forma apreciable. */
const MS_ANTES_DE_LIBERAR = 60_000;

export function descargarBlob(blob: Blob, nombreArchivo: string): void {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');

  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.rel = 'noopener';
  enlace.style.display = 'none';

  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);

  // No liberar todavía: la descarga puede no haber leído el blob aún.
  setTimeout(() => URL.revokeObjectURL(url), MS_ANTES_DE_LIBERAR);
}

/** Atajo para los servicios que construyen el Blob a partir de un buffer. */
export function descargarBuffer(
  buffer: ArrayBuffer | Uint8Array,
  nombreArchivo: string,
  tipoMime: string,
): void {
  descargarBlob(new Blob([buffer as BlobPart], { type: tipoMime }), nombreArchivo);
}

/** Tipo MIME de los libros de Excel (.xlsx). */
export const MIME_XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
