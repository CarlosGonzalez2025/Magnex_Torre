/**
 * hojaVidaPdf.tsx
 *
 * Exporta la Hoja de Vida COMPLETA del conductor a PDF (multi-sección,
 * paginado) con @react-pdf/renderer y el logo Magnex.
 */

import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet, pdf } from '@react-pdf/renderer';
import type { HojaDeVida } from './hojaDeVidaService';

const COL = { verde: '#16a34a', ambar: '#f59e0b', rojo: '#dc2626', slate: '#64748b', ink: '#0f172a', muted: '#64748b', line: '#e2e8f0' };
const SEM: Record<string, { bg: string; label: string }> = {
  VERDE: { bg: COL.verde, label: 'OK' },
  AMARILLO: { bg: COL.ambar, label: 'ALERTA' },
  ROJO: { bg: COL.rojo, label: 'CRÍTICO' },
};

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 9, color: COL.ink, fontFamily: 'Helvetica' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, borderBottomWidth: 2, borderBottomColor: COL.line, paddingBottom: 8 },
  logo: { height: 26, objectFit: 'contain' },
  title: { fontSize: 14, fontFamily: 'Helvetica-Bold' },
  sub: { fontSize: 8, color: COL.muted },
  idRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 4 },
  name: { fontSize: 13, fontFamily: 'Helvetica-Bold' },
  chip: { fontSize: 8, color: '#fff', paddingVertical: 2, paddingHorizontal: 8, borderRadius: 8 },
  scoreBox: { alignItems: 'center', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8 },
  scoreNum: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#fff' },
  scoreLbl: { fontSize: 8, color: '#fff' },
  section: { marginTop: 10 },
  secTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: COL.ink, backgroundColor: '#f1f5f9', padding: 4, borderRadius: 3, marginBottom: 4 },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COL.line, paddingVertical: 3 },
  th: { fontFamily: 'Helvetica-Bold', color: COL.muted, fontSize: 8 },
  cell: { flexGrow: 1, flexBasis: 0 },
  small: { fontSize: 8, color: COL.muted },
  badge: { fontSize: 7, paddingVertical: 1, paddingHorizontal: 5, borderRadius: 6 },
  metaFoot: { position: 'absolute', bottom: 16, left: 28, right: 28, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: COL.muted, borderTopWidth: 1, borderTopColor: COL.line, paddingTop: 4 },
});

function estadoColor(estado: string | null): string {
  const e = (estado || '').toLowerCase();
  if (e.includes('vencid')) return COL.rojo;
  if (e.includes('vigente')) return COL.verde;
  if (e.includes('vencer') || e.includes('proxim') || e.includes('próxim')) return COL.ambar;
  return COL.slate;
}
const fdate = (iso: string | null | undefined) => { if (!iso) return '—'; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-CO'); };

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={s.section} wrap={false}><Text style={s.secTitle}>{title}</Text>{children}</View>;
}

async function logoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch('/logo.png');
    const blob = await res.blob();
    return await new Promise((r) => { const fr = new FileReader(); fr.onloadend = () => r(fr.result as string); fr.readAsDataURL(blob); });
  } catch { return null; }
}

export async function generarHojaVidaPdf(hv: HojaDeVida): Promise<Blob> {
  const c = hv.conductor;
  const logo = await logoDataUrl();
  const sem = hv.score ? SEM[hv.score.semaforo] : { bg: COL.slate, label: 'SIN PUNTAJE' };
  const lics = hv.verificacion
    ? hv.verificacion.licencias.map(l => ({ tipo: l.tipo, categoria: l.categoria, fecha: l.fecha_venc, estado: l.alerta }))
    : hv.licencias.map(l => ({ tipo: l.etiqueta, categoria: null as string | null, fecha: l.fecha, estado: l.estado }));

  const doc = (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.headerRow} fixed>
          <View>
            <Text style={s.title}>Hoja de Vida del Conductor</Text>
            <Text style={s.sub}>Generado el {new Date().toLocaleString('es-CO')}</Text>
          </View>
          {logo ? <Image src={logo} style={s.logo} /> : <Text style={s.title}>MAGNEX</Text>}
        </View>

        {/* Identidad + puntaje */}
        <View style={s.idRow}>
          <View>
            <Text style={s.name}>{c.nombres}</Text>
            <Text style={s.small}>CC {c.cedula}{c.cargo ? `  ·  ${c.cargo}` : ''}{c.proyecto ? `  ·  ${c.proyecto}` : ''}</Text>
            <Text style={s.small}>{c.estado || 'ACTIVO'}  ·  {(c.ibutton && String(c.ibutton).trim()) ? 'iButton OK' : 'Sin iButton'}</Text>
          </View>
          <View style={[s.scoreBox, { backgroundColor: sem.bg }]}>
            <Text style={s.scoreNum}>{hv.score ? hv.score.puntaje : '—'}<Text style={s.scoreLbl}>/100</Text></Text>
            <Text style={s.scoreLbl}>{sem.label}</Text>
          </View>
        </View>
        {hv.score && hv.score.detonadores.length > 0 && (
          <Text style={{ fontSize: 8, color: COL.rojo, marginBottom: 2 }}>Detonadores: {hv.score.detonadores.join(', ')}</Text>
        )}

        {/* Licencias */}
        <Sec title="Licencias de conducción">
          {lics.length === 0 ? <Text style={s.small}>Sin información.</Text> : (
            <>
              <View style={s.row}><Text style={[s.th, s.cell]}>Licencia</Text><Text style={[s.th, s.cell]}>Categoría</Text><Text style={[s.th, s.cell]}>Vence</Text><Text style={[s.th, s.cell]}>Estado</Text></View>
              {lics.map((l, i) => (
                <View style={s.row} key={i}>
                  <Text style={s.cell}>{l.tipo}</Text>
                  <Text style={s.cell}>{l.categoria || '—'}</Text>
                  <Text style={s.cell}>{fdate(l.fecha)}</Text>
                  <View style={s.cell}><Text style={[s.badge, { backgroundColor: estadoColor(l.estado), color: '#fff' }]}>{l.estado || '—'}</Text></View>
                </View>
              ))}
            </>
          )}
        </Sec>

        {/* Capacitaciones manejo defensivo */}
        <Sec title="Capacitaciones — Manejo Defensivo">
          {hv.capacitacionesMD.total === 0 ? <Text style={s.small}>Sin certificados registrados.</Text> : (
            <>
              {hv.capacitacionesMD.proximo_vencimiento && (
                <Text style={{ fontSize: 9, marginBottom: 3, color: hv.capacitacionesMD.proximo_vencimiento.vencida ? COL.rojo : COL.ink }}>
                  Vencimiento vigente más próximo: {fdate(hv.capacitacionesMD.proximo_vencimiento.fecha_vencimiento)}
                  {hv.capacitacionesMD.proximo_vencimiento.vencida ? ' · VENCIDA' : ''}
                </Text>
              )}
              <View style={s.row}><Text style={[s.th, s.cell]}>Tipo/Vehículo</Text><Text style={[s.th, s.cell]}>Certificado</Text><Text style={[s.th, s.cell]}>Vence</Text><Text style={[s.th, s.cell]}>Estado</Text></View>
              {hv.capacitacionesMD.intervenciones.slice(0, 12).map((cap, i) => (
                <View style={s.row} key={i}>
                  <Text style={s.cell}>{cap.vehiculo || cap.tipo || '—'}</Text>
                  <Text style={s.cell}>{fdate(cap.fecha_certificado)}</Text>
                  <Text style={s.cell}>{fdate(cap.fecha_vencimiento)}</Text>
                  <View style={s.cell}><Text style={[s.badge, { backgroundColor: cap.vencida ? COL.rojo : COL.verde, color: '#fff' }]}>{cap.vencida ? 'Vencida' : 'Vigente'}</Text></View>
                </View>
              ))}
            </>
          )}
        </Sec>

        {/* SIMIT */}
        <Sec title="SIMIT / Comparendos">
          {hv.verificacion ? (
            <>
              <Text style={s.small}>Validado: {fdate(hv.verificacion.fecha_validacion)} · Comparendos: {hv.verificacion.numero_comparendos} · Valor: ${hv.verificacion.valor_comparendos.toLocaleString()}</Text>
              {hv.verificacion.comparendos.slice(0, 6).map((cp, i) => (
                <Text style={s.small} key={i}>• {cp.fecha || '—'} {cp.codigo || ''} {cp.descripcion || ''}</Text>
              ))}
            </>
          ) : (
            <Text style={s.small}>Tipo: {hv.simit.tipo_comparendo || 'Ninguno'} · Valor: ${hv.simit.valor_comparendo.toLocaleString()}</Text>
          )}
        </Sec>

        {/* Desempeño mensual */}
        <Sec title="Desempeño mensual">
          {hv.desempenoMensual.length === 0 ? <Text style={s.small}>Sin informes.</Text> : (
            <>
              <View style={s.row}><Text style={[s.th, s.cell]}>Periodo</Text><Text style={[s.th, s.cell]}>Calif.</Text><Text style={[s.th, s.cell]}>Excesos</Text><Text style={[s.th, s.cell]}>Frenadas</Text><Text style={[s.th, s.cell]}>Kms</Text></View>
              {hv.desempenoMensual.slice(0, 8).map((m, i) => (
                <View style={s.row} key={i}>
                  <Text style={s.cell}>{fdate(m.periodo_fin)}</Text>
                  <Text style={s.cell}>{m.calificacion ?? '—'}</Text>
                  <Text style={s.cell}>{m.excesos_total}</Text>
                  <Text style={s.cell}>{m.frenadas_bruscas}</Text>
                  <Text style={s.cell}>{m.kms != null ? Math.round(m.kms) : '—'}</Text>
                </View>
              ))}
            </>
          )}
        </Sec>

        {/* Alertas + inspecciones */}
        <Sec title="Alertas y telemetría (últimos 90 días)">
          <Text style={s.small}>Excesos graves: {hv.resumenAlertas.excesos_graves} · Moderados: {hv.resumenAlertas.excesos_moderados} · Frenadas: {hv.resumenAlertas.frenadas_bruscas} · Vel. máx: {hv.resumenAlertas.velocidad_max} km/h · Ralentí: {hv.ralentiEventos}</Text>
        </Sec>

        {hv.inspecciones.length > 0 && (
          <Sec title="Inspecciones preoperacionales">
            {hv.inspecciones.slice(0, 8).map((ins, i) => (
              <Text style={s.small} key={i}>{fdate(ins.fecha)} · {ins.placa} · {ins.status} ({ins.findings})</Text>
            ))}
          </Sec>
        )}

        {hv.registrosCampo.length > 0 && (
          <Sec title="Registros de comportamiento en campo">
            {hv.registrosCampo.slice(0, 12).map((r, i) => (
              <Text style={s.small} key={i}>{new Date(r.created_at).toLocaleString('es-CO')} · [{r.severidad}] {r.tipo_evento}: {r.descripcion}{r.registrado_por_nombre ? ` — ${r.registrado_por_nombre}` : ''}</Text>
            ))}
          </Sec>
        )}

        <View style={s.metaFoot} fixed>
          <Text>Magnex · Torre de Control — Seguridad Vial</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );

  return await pdf(doc).toBlob();
}
