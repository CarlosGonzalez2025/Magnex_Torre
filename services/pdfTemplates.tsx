// PDF Templates – requiere: npm install @react-pdf/renderer
// Generación 100% client-side; no necesita servidor.

import React from 'react';
import {
  Document, Page, Text, View, StyleSheet, Font, pdf,
  Image, Svg, Circle, Line, Path, Polyline,
} from '@react-pdf/renderer';
import { ContratoOption, ReporteAlertasDiariasData, AlertaDiariaGps, ReporteConductorData, ReporteVehiculoData } from './reportService';

const magnexLogo = new URL('../Magnex.png', import.meta.url).href;
const orionLogo = new URL('../Orion.png', import.meta.url).href;

// ── Fuentes ──────────────────────────────────────────────────────────────────
Font.register({
  family: 'Roboto',
  fonts: [
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf', fontWeight: 400 },
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-bold-webfont.ttf', fontWeight: 700 },
  ],
});

// ── Paleta de colores ────────────────────────────────────────────────────────
const COLORS = {
  azul: '#003366',
  azulClaro: '#1e40af',
  azulBg: '#dbeafe',
  gris: '#64748b',
  grisClaro: '#f8fafc',
  grisBorde: '#cbd5e1',
  blanco: '#ffffff',
  verde: '#16a34a',
  verdeBg: '#dcfce7',
  amarillo: '#d97706',
  amarilloBg: '#fef3c7',
  naranja: '#ea580c',
  rojo: '#dc2626',
  rojoBg: '#fee2e2',
  negro: '#0f172a',
  sombra: '#e2e8f0',
};

// ── Estilos comunes ───────────────────────────────────────────────────────────
const base = StyleSheet.create({
  page: { fontFamily: 'Roboto', fontSize: 8, color: COLORS.negro, backgroundColor: COLORS.blanco, padding: 24 },
  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 3, borderBottomColor: COLORS.azul, paddingBottom: 8, marginBottom: 12 },
  headerLeft: { flexDirection: 'column' },
  headerTitle: { fontSize: 16, fontWeight: 700, color: COLORS.azul },
  headerSubtitle: { fontSize: 8, color: COLORS.gris, marginTop: 2 },
  headerRight: { alignItems: 'flex-end' },
  headerDate: { fontSize: 7, color: COLORS.gris },
  // Sections
  section: { marginBottom: 10 },
  sectionTitle: { fontSize: 9, fontWeight: 700, color: COLORS.blanco, backgroundColor: COLORS.azul, padding: '4 8', marginBottom: 4 },
  // Grid
  row: { flexDirection: 'row', marginBottom: 4 },
  col2: { flex: 1 },
  // Info cell
  infoLabel: { fontSize: 7, color: COLORS.gris, marginBottom: 1 },
  infoValue: { fontSize: 8, fontWeight: 700, color: COLORS.negro },
  // Table
  tableHeader: { flexDirection: 'row', backgroundColor: COLORS.azul, padding: '3 4' },
  tableHeaderCell: { color: COLORS.blanco, fontWeight: 700, fontSize: 6, textAlign: 'center' },
  tableRow: { flexDirection: 'row', padding: '2 4', borderBottomWidth: 0.5, borderBottomColor: COLORS.sombra },
  tableRowAlt: { backgroundColor: COLORS.grisClaro },
  tableCell: { fontSize: 5.8, color: COLORS.negro, textAlign: 'center' },
  // Badge
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start' },
  badgeVerde: { backgroundColor: COLORS.verdeBg },
  badgeAmarillo: { backgroundColor: COLORS.amarilloBg },
  badgeRojo: { backgroundColor: COLORS.rojoBg },
  badgeTextoVerde: { color: COLORS.verde, fontWeight: 700, fontSize: 9 },
  badgeTextoAmarillo: { color: COLORS.amarillo, fontWeight: 700, fontSize: 9 },
  badgeTextoRojo: { color: COLORS.rojo, fontWeight: 700, fontSize: 9 },
  // Footer
  footer: { position: 'absolute', bottom: 16, left: 24, right: 24, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: COLORS.grisBorde, paddingTop: 4 },
  footerText: { fontSize: 6, color: COLORS.gris },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function getLocalDateISO(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fmt(d?: string | null): string {
  if (!d) return '—';
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function n(v: number, decimals = 0): string {
  return v.toLocaleString('es-CO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function SemaforoBadge({ tipo }: { tipo: 'verde' | 'amarillo' | 'rojo' }) {
  const map = {
    verde: { badge: base.badgeVerde, texto: base.badgeTextoVerde, label: 'BUENO' },
    amarillo: { badge: base.badgeAmarillo, texto: base.badgeTextoAmarillo, label: 'REGULAR' },
    rojo: { badge: base.badgeRojo, texto: base.badgeTextoRojo, label: 'CRÍTICO' },
  };
  const s = map[tipo];
  return (
    <View style={[base.badge, s.badge]}>
      <Text style={s.texto}>{s.label}</Text>
    </View>
  );
}

function ExcesoRow({ label, valor, alt }: { label: string; valor: number; alt: boolean }) {
  const color = valor === 0 ? COLORS.verde : valor < 5 ? COLORS.amarillo : COLORS.rojo;
  return (
    <View style={[base.tableRow, alt ? base.tableRowAlt : {}]}>
      <Text style={[base.tableCell, { flex: 3 }]}>{label}</Text>
      <Text style={[base.tableCell, { flex: 1, textAlign: 'right', color, fontWeight: 700 }]}>{n(valor)}</Text>
    </View>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ marginBottom: 4 }}>
      <Text style={base.infoLabel}>{label}</Text>
      <Text style={base.infoValue}>{value || '—'}</Text>
    </View>
  );
}

// ── Plantilla: Informe de Conductor ──────────────────────────────────────────

export function InformeConductorPDF({ data }: { data: ReporteConductorData }) {
  const { conductor, metricas, ralenti, periodoInicio, periodoFin, fechaReporte, semaforo } = data;

  return (
    <Document title={`Informe Conductor - ${mayuscula(conductor.nombres)}`}>
      <Page size="LETTER" style={base.page}>
        {/* ── ENCABEZADO ── */}
        <View style={base.header}>
          <View style={base.headerLeft}>
            <Text style={base.headerTitle}>TORRE DE CONTROL</Text>
            <Text style={base.headerSubtitle}>Informe de Comportamiento Conductor</Text>
          </View>
          <View style={base.headerRight}>
            <Text style={base.headerDate}>Fecha de reporte: {fmt(fechaReporte)}</Text>
            <Text style={base.headerDate}>Período: {fmt(periodoInicio)} – {fmt(periodoFin)}</Text>
          </View>
        </View>

        {/* ── 1. INFORMACIÓN GENERAL ── */}
        <View style={base.section}>
          <Text style={base.sectionTitle}>1. INFORMACIÓN GENERAL</Text>
          <View style={base.row}>
            <View style={[base.col2, { paddingRight: 8 }]}>
              <InfoBlock label="Nombres" value={mayuscula(conductor.nombres)} />
              <InfoBlock label="Cédula" value={conductor.cedula} />
              <InfoBlock label="Cargo" value={conductor.cargo} />
              <InfoBlock label="Base" value={conductor.base} />
            </View>
            <View style={[base.col2, { paddingRight: 8 }]}>
              <InfoBlock label="Proyecto" value={conductor.proyecto} />
              <InfoBlock label="Estado" value={conductor.estado} />
              <InfoBlock label="Ibutton" value={conductor.ibutton} />
              <InfoBlock label="Tipo Licencia" value={conductor.licencias.tipo} />
            </View>
            <View style={base.col2}>
              <InfoBlock label="Lic. Particular – Vence" value={fmt(conductor.licencias.fecha_venc_particular)} />
              <InfoBlock label="Lic. Pública – Vence" value={fmt(conductor.licencias.fecha_venc_publica)} />
              <InfoBlock label="Comparendo" value={conductor.tipo_comparendo} />
              <InfoBlock label="Valor Comparendo" value={conductor.valor_comparendo > 0 ? `$${n(conductor.valor_comparendo)}` : '—'} />
            </View>
          </View>
        </View>

        {/* ── 2. ÍNDICE DE COMPORTAMIENTO ── */}
        <View style={base.section}>
          <Text style={base.sectionTitle}>2. ÍNDICE DE COMPORTAMIENTO VIAL</Text>
          <View style={[base.row, { alignItems: 'center', gap: 16, padding: 8, backgroundColor: COLORS.grisClaro, borderRadius: 4 }]}>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text style={{ fontSize: 28, fontWeight: 700, color: semaforo === 'verde' ? COLORS.verde : semaforo === 'amarillo' ? COLORS.amarillo : COLORS.rojo }}>
                {n(metricas.calificacion, 1)}
              </Text>
              <Text style={{ fontSize: 7, color: COLORS.gris }}>Calificación Global</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <SemaforoBadge tipo={semaforo} />
            </View>
            <View style={{ flex: 2 }}>
              <View style={[base.row, { justifyContent: 'space-around' }]}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: 700, color: COLORS.azulClaro }}>{n(metricas.kms, 1)}</Text>
                  <Text style={{ fontSize: 6, color: COLORS.gris }}>Km Recorridos</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: 700, color: COLORS.azulClaro }}>{n(metricas.horas_conduccion, 1)}</Text>
                  <Text style={{ fontSize: 6, color: COLORS.gris }}>Horas Conducción</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: 700, color: COLORS.azulClaro }}>{n(metricas.dias_evaluados)}</Text>
                  <Text style={{ fontSize: 6, color: COLORS.gris }}>Días Evaluados</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* ── 3. EXCESOS DE VELOCIDAD ── */}
        <View style={base.section}>
          <Text style={base.sectionTitle}>3. EXCESOS DE VELOCIDAD</Text>
          <View style={base.tableHeader}>
            <Text style={[base.tableHeaderCell, { flex: 3 }]}>Parámetro</Text>
            <Text style={[base.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Eventos</Text>
          </View>
          {[
            ['Excesos 10 km/h sobre límite', metricas.excesos_10_kph],
            ['Excesos 20 km/h sobre límite', metricas.excesos_20_kph],
            ['Excesos 30 km/h sobre límite', metricas.excesos_30_kph],
            ['Excesos 40 km/h sobre límite', metricas.excesos_40_kph],
            ['Excesos 50 km/h sobre límite', metricas.excesos_50_kph],
            ['Excesos 60 km/h sobre límite', metricas.excesos_60_kph],
            ['Excesos 80 km/h sobre límite', metricas.excesos_80_kph],
          ].map(([label, valor], i) => (
            <ExcesoRow key={i} label={label as string} valor={valor as number} alt={i % 2 === 1} />
          ))}
        </View>

        {/* ── 4. CONDUCCIÓN AGRESIVA ── */}
        <View style={base.section}>
          <Text style={base.sectionTitle}>4. CONDUCCIÓN AGRESIVA</Text>
          <View style={base.tableHeader}>
            <Text style={[base.tableHeaderCell, { flex: 3 }]}>Evento</Text>
            <Text style={[base.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Eventos</Text>
          </View>
          <ExcesoRow label="Aceleraciones Bruscas" valor={metricas.aceleraciones} alt={false} />
          <ExcesoRow label="Frenadas Bruscas" valor={metricas.frenadas} alt={true} />
        </View>

        {/* ── 5. RALENTÍ (si hay datos) ── */}
        {ralenti && (
          <View style={base.section}>
            <Text style={base.sectionTitle}>5. DATOS DE RALENTÍ</Text>
            <View style={[base.row, { gap: 8 }]}>
              {[
                ['Km Recorridos', n(ralenti.kms_recorridos, 1)],
                ['Ralentís Excesivos', n(ralenti.ralentis_excesivos)],
                ['Horas Motor Encendido', n(ralenti.horas_motor_encendido, 1)],
                ['Horas Motor Ralentí', n(ralenti.horas_motor_ralenti, 1)],
                ['Consumo Combustible (L)', n(ralenti.consumo_combustible, 1)],
              ].map(([label, value], i) => (
                <View key={i} style={{ flex: 1, backgroundColor: COLORS.azulBg, padding: 6, borderRadius: 4, alignItems: 'center' }}>
                  <Text style={{ fontSize: 10, fontWeight: 700, color: COLORS.azul }}>{value}</Text>
                  <Text style={{ fontSize: 6, color: COLORS.gris, textAlign: 'center' }}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── 6. CAPACITACIONES ── */}
        <View style={base.section}>
          <Text style={base.sectionTitle}>6. CAPACITACIONES Y COMPETENCIAS</Text>
          <View style={base.row}>
            <View style={base.col2}>
              <InfoBlock label="Manejo Defensivo" value={fmt(conductor.capacitaciones.manejo_def)} />
              <InfoBlock label="Mercancías Peligrosas" value={fmt(conductor.capacitaciones.peligrosas)} />
            </View>
            <View style={base.col2}>
              <InfoBlock label="Trabajo en Alturas" value={fmt(conductor.capacitaciones.alturas)} />
              <InfoBlock label="Otra Capacitación" value={fmt(conductor.capacitaciones.otro)} />
            </View>
          </View>
        </View>

        {/* ── FOOTER ── */}
        <View style={base.footer} fixed>
          <Text style={base.footerText}>Torre de Control – Sistema de Gestión de Flotas</Text>
          <Text style={base.footerText}>Informe generado el {fmt(fechaReporte)}</Text>
          <Text style={base.footerText} render={({ pageNumber, totalPages }) => `Página ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

// ── Plantilla: Informe de Vehículo ────────────────────────────────────────────

export function InformeVehiculoPDF({ data }: { data: ReporteVehiculoData }) {
  const { vehiculo, contrato, metricas, ralenti, periodoInicio, periodoFin, fechaReporte, semaforo } = data;

  return (
    <Document title={`Informe Vehículo – ${vehiculo.placa}`}>
      <Page size="LETTER" style={base.page}>
        {/* ── ENCABEZADO ── */}
        <View style={base.header}>
          <View style={base.headerLeft}>
            <Text style={base.headerTitle}>TORRE DE CONTROL</Text>
            <Text style={base.headerSubtitle}>Informe de Comportamiento Vehículo</Text>
          </View>
          <View style={base.headerRight}>
            <Text style={base.headerDate}>Fecha de reporte: {fmt(fechaReporte)}</Text>
            <Text style={base.headerDate}>Período: {fmt(periodoInicio)} – {fmt(periodoFin)}</Text>
          </View>
        </View>

        {/* ── 1. INFORMACIÓN GENERAL ── */}
        <View style={base.section}>
          <Text style={base.sectionTitle}>1. INFORMACIÓN GENERAL DEL VEHÍCULO</Text>
          <View style={base.row}>
            <View style={[base.col2, { paddingRight: 8 }]}>
              <InfoBlock label="Placa" value={vehiculo.placa} />
              <InfoBlock label="Marca / Línea" value={`${vehiculo.marca} ${vehiculo.linea}`} />
              <InfoBlock label="Modelo" value={vehiculo.modelo} />
              <InfoBlock label="Tipo de Activo" value={vehiculo.tipo_activo} />
            </View>
            <View style={[base.col2, { paddingRight: 8 }]}>
              <InfoBlock label="Combustible" value={vehiculo.tipo_combustible} />
              <InfoBlock label="Estado" value={vehiculo.estado} />
              <InfoBlock label="Cliente" value={vehiculo.cliente} />
              <InfoBlock label="GPS / Proveedor" value={vehiculo.gps_compañia} />
            </View>
            <View style={base.col2}>
              <InfoBlock label="Vence SOAT" value={fmt(vehiculo.fecha_venc_soat)} />
              <InfoBlock label="Vence RTM" value={fmt(vehiculo.fecha_venc_rtm)} />
              <InfoBlock label="KM Actual" value={n(vehiculo.km_actual)} />
              {contrato && <InfoBlock label="Contrato" value={contrato.nombre} />}
            </View>
          </View>
          {contrato && (
            <View style={base.row}>
              <View style={[base.col2, { paddingRight: 8 }]}>
                <InfoBlock label="Tipo Contrato" value={contrato.tipo} />
                <InfoBlock label="Inicio Contrato" value={fmt(contrato.fecha_inicio)} />
              </View>
              <View style={[base.col2, { paddingRight: 8 }]}>
                <InfoBlock label="Fin Contrato" value={fmt(contrato.fecha_fin)} />
                <InfoBlock label="Km Pactados" value={n(contrato.kilometraje_pactado)} />
              </View>
              <View style={base.col2} />
            </View>
          )}
        </View>

        {/* ── 2. ÍNDICE DE COMPORTAMIENTO ── */}
        <View style={base.section}>
          <Text style={base.sectionTitle}>2. ÍNDICE DE COMPORTAMIENTO VIAL</Text>
          <View style={[base.row, { alignItems: 'center', gap: 16, padding: 8, backgroundColor: COLORS.grisClaro, borderRadius: 4 }]}>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text style={{ fontSize: 28, fontWeight: 700, color: semaforo === 'verde' ? COLORS.verde : semaforo === 'amarillo' ? COLORS.amarillo : COLORS.rojo }}>
                {n(metricas.calificacion, 1)}
              </Text>
              <Text style={{ fontSize: 7, color: COLORS.gris }}>Calificación Global</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <SemaforoBadge tipo={semaforo} />
            </View>
            <View style={{ flex: 2 }}>
              <View style={[base.row, { justifyContent: 'space-around' }]}>
                {[
                  [n(metricas.kms, 1), 'Km Recorridos'],
                  [n(metricas.horas_conduccion, 1), 'Horas Conducción'],
                  [n(metricas.dias_evaluados), 'Días Evaluados'],
                ].map(([val, lbl], i) => (
                  <View key={i} style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, fontWeight: 700, color: COLORS.azulClaro }}>{val}</Text>
                    <Text style={{ fontSize: 6, color: COLORS.gris }}>{lbl}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>

        {/* ── 3. EXCESOS DE VELOCIDAD ── */}
        <View style={base.section}>
          <Text style={base.sectionTitle}>3. EXCESOS DE VELOCIDAD</Text>
          <View style={base.tableHeader}>
            <Text style={[base.tableHeaderCell, { flex: 3 }]}>Parámetro</Text>
            <Text style={[base.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Eventos</Text>
          </View>
          {[
            ['Excesos 10 km/h sobre límite', metricas.excesos_10_kph],
            ['Excesos 20 km/h sobre límite', metricas.excesos_20_kph],
            ['Excesos 30 km/h sobre límite', metricas.excesos_30_kph],
            ['Excesos 40 km/h sobre límite', metricas.excesos_40_kph],
            ['Excesos 50 km/h sobre límite', metricas.excesos_50_kph],
            ['Excesos 60 km/h sobre límite', metricas.excesos_60_kph],
            ['Excesos 80 km/h sobre límite', metricas.excesos_80_kph],
          ].map(([label, valor], i) => (
            <ExcesoRow key={i} label={label as string} valor={valor as number} alt={i % 2 === 1} />
          ))}
        </View>

        {/* ── 4. CONDUCCIÓN AGRESIVA ── */}
        <View style={base.section}>
          <Text style={base.sectionTitle}>4. CONDUCCIÓN AGRESIVA</Text>
          <View style={base.tableHeader}>
            <Text style={[base.tableHeaderCell, { flex: 3 }]}>Evento</Text>
            <Text style={[base.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Eventos</Text>
          </View>
          <ExcesoRow label="Aceleraciones Bruscas" valor={metricas.aceleraciones} alt={false} />
          <ExcesoRow label="Frenadas Bruscas" valor={metricas.frenadas} alt={true} />
        </View>

        {/* ── 5. RALENTÍ ── */}
        <View style={base.section}>
          <Text style={base.sectionTitle}>5. DATOS DE RALENTÍ</Text>
          <View style={[base.row, { gap: 6 }]}>
            {[
              ['Km Recorridos', n(ralenti.kms_recorridos, 1)],
              ['Encendidos/Apagados', n(ralenti.encendidos_apagados)],
              ['Ralentís Excesivos', n(ralenti.ralentis_excesivos)],
              ['H. Motor Encendido', n(ralenti.horas_motor_encendido, 1)],
              ['H. Motor Ralentí', n(ralenti.horas_motor_ralenti, 1)],
              ['Consumo (L)', n(ralenti.consumo_combustible, 1)],
            ].map(([label, value], i) => (
              <View key={i} style={{ flex: 1, backgroundColor: COLORS.azulBg, padding: 5, borderRadius: 4, alignItems: 'center' }}>
                <Text style={{ fontSize: 10, fontWeight: 700, color: COLORS.azul }}>{value}</Text>
                <Text style={{ fontSize: 5.5, color: COLORS.gris, textAlign: 'center' }}>{label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── FOOTER ── */}
        <View style={base.footer} fixed>
          <Text style={base.footerText}>Torre de Control – Sistema de Gestión de Flotas</Text>
          <Text style={base.footerText}>Informe generado el {fmt(fechaReporte)}</Text>
          <Text style={base.footerText} render={({ pageNumber, totalPages }) => `Página ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

// ── Función de descarga ───────────────────────────────────────────────────────

function safeFileName(value: string): string {
  return value.trim().replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'contrato';
}

function promedioNumerico(values: number[]): number {
  const valid = values.filter(v => Number.isFinite(v));
  if (valid.length === 0) return 0;
  return valid.reduce((acc, v) => acc + v, 0) / valid.length;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface ConsolidadoContratoResumen {
  totalVehiculos: number;
  totalConductores: number;
  vehiculosConGps: number;
  vehiculosSinGps: number;
}

interface VariacionResultado {
  texto: string;
  bgColor: string;
  textColor: string;
}

function calcularVariacion(actual: number, anterior: number, menorEsMejor = false): VariacionResultado {
  if (anterior === 0) {
    if (actual === 0) {
      return { texto: '0,00%', bgColor: '#c6efce', textColor: '#006100' };
    }
    const esMejora = menorEsMejor ? false : true;
    return {
      texto: '+100,00%',
      bgColor: esMejora ? '#c6efce' : '#ffc7ce',
      textColor: esMejora ? '#006100' : '#9c0006'
    };
  }
  
  const variacion = ((actual - anterior) / anterior) * 100;
  const signo = variacion >= 0 ? '+' : '';
  const texto = `${signo}${variacion.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  
  let esMejora = false;
  if (menorEsMejor) {
    esMejora = variacion <= 0;
  } else {
    esMejora = variacion >= 0;
  }

  return {
    texto,
    bgColor: esMejora ? '#c6efce' : '#ffc7ce',
    textColor: esMejora ? '#006100' : '#9c0006'
  };
}

function CellWithVariation({
  label,
  value,
  varResultado,
  labelFlex = 2.2,
  valueFlex = 1,
  varFlex = 1
}: {
  label: string;
  value: string;
  varResultado: VariacionResultado;
  labelFlex?: number;
  valueFlex?: number;
  varFlex?: number;
}) {
  return (
    <View style={{ flexDirection: 'row', minHeight: 13 }}>
      <View style={{ flex: labelFlex, backgroundColor: '#b7e2f7', justifyContent: 'center', padding: 2, borderWidth: 0.3, borderColor: COLORS.sombra }}>
        <Text style={{ fontSize: 5.3, fontWeight: 700, textAlign: 'left', paddingLeft: 4 }}>{label}</Text>
      </View>
      <View style={{ flex: valueFlex, justifyContent: 'center', padding: 2, borderWidth: 0.3, borderColor: COLORS.sombra, backgroundColor: COLORS.blanco }}>
        <Text style={{ fontSize: 5.7, fontWeight: 700, textAlign: 'center' }}>{value}</Text>
      </View>
      <View style={{ flex: varFlex, justifyContent: 'center', padding: 2, borderWidth: 0.3, borderColor: COLORS.sombra, backgroundColor: varResultado.bgColor }}>
        <Text style={{ fontSize: 5.3, fontWeight: 700, textAlign: 'center', color: varResultado.textColor }}>{varResultado.texto}</Text>
      </View>
    </View>
  );
}


type TipoConsolidado = 'conductores' | 'vehiculos';

function metricasConsolidado(
  tipo: TipoConsolidado,
  conductores: ReporteConductorData[],
  vehiculos: ReporteVehiculoData[],
) {
  const conductorKm = conductores.reduce((acc, d) => acc + d.metricas.kms, 0);
  const vehiculoKm = vehiculos.reduce((acc, d) => acc + d.metricas.kms, 0);
  const conductorHoras = conductores.reduce((acc, d) => acc + d.metricas.horas_conduccion, 0);
  // Para vehículos: usar estrictamente horas_conduccion (horas de conducción en movimiento)
  // como referencia operativa de conducción.
  const vehiculoHoras = vehiculos.reduce((acc, d) => acc + d.metricas.horas_conduccion, 0);
  const fuente = tipo === 'conductores' ? conductores.map(d => d.metricas) : vehiculos.map(d => d.metricas);
  const horasRalenti = vehiculos.reduce((acc, d) => acc + d.ralenti.horas_motor_ralenti, 0);
  return {
    kms: tipo === 'conductores' ? conductorKm : vehiculoKm,
    horasConduccion: tipo === 'conductores' ? conductorHoras : vehiculoHoras,
    horasRalenti,
    excesos80: fuente.reduce((acc, m) => acc + m.excesos_80_kph, 0),
    excesosVarios: fuente.reduce((acc, m) => acc + m.excesos_10_kph + m.excesos_20_kph + m.excesos_30_kph + m.excesos_40_kph + m.excesos_50_kph + m.excesos_60_kph, 0),
    frenadas: fuente.reduce((acc, m) => acc + m.frenadas, 0),
    aceleraciones: fuente.reduce((acc, m) => acc + m.aceleraciones, 0),
  };
}

type MetricasIncidencias = {
  excesos_10_kph: number;
  excesos_20_kph: number;
  excesos_30_kph: number;
  excesos_40_kph: number;
  excesos_50_kph: number;
  excesos_60_kph: number;
  excesos_80_kph: number;
  aceleraciones: number;
  frenadas: number;
};

function excesosVarios(metricas: MetricasIncidencias): number {
  return metricas.excesos_10_kph + metricas.excesos_20_kph + metricas.excesos_30_kph +
    metricas.excesos_40_kph + metricas.excesos_50_kph + metricas.excesos_60_kph;
}

function totalIncidencias(metricas: MetricasIncidencias): number {
  return excesosVarios(metricas) + metricas.excesos_80_kph + metricas.frenadas + metricas.aceleraciones;
}

function mayuscula(value?: string | null): string {
  return String(value ?? '').toUpperCase();
}

function valoresUnicos(values: Array<string | null | undefined>): string {
  const clean = values
    .map(v => String(v ?? '').trim())
    .filter(Boolean);
  return Array.from(new Set(clean)).join(' / ');
}

function baseZonaConductores(datos: ReporteConductorData[], fallback?: string | null): string {
  return valoresUnicos(datos.map(d => d.conductor.base)) || String(fallback || '0');
}

function baseZonaVehiculos(datos: ReporteVehiculoData[], fallback?: string | null): string {
  return valoresUnicos(datos.map(d => d.vehiculo.cliente)) || String(fallback || '0');
}

function conductorTableFlex(index: number): number {
  if (index === 0) return 0.38;
  if (index === 1) return 2.9;
  if (index === 3) return 1.35;
  return 0.72;
}

function tieneGpsConfigurado(value: unknown): boolean {
  const normalizado = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
  return Boolean(normalizado) && !['NO', 'N/A', 'NA', 'SIN GPS', 'NINGUNO', 'NO APLICA', '0'].includes(normalizado);
}

function vehiculoTableFlex(index: number): number {
  if (index === 0) return 0.22;  // '#'
  if (index === 1) return 0.55;  // 'Placa'
  if (index === 2) return 0.58;  // 'Dispositivo GPS'
  if (index === 3) return 0.65;  // 'KM Recorridos'
  if (index === 4) return 0.65;  // 'Horas Conducción'
  if (index === 5) return 0.65;  // '# Excesos 80 Km/h'
  if (index === 6) return 0.65;  // 'Máxima Vel. 80 Km/h'
  if (index === 7) return 1.15;  // '# Exceso Velocidad Maxima (varios parametros 20,30,40,50,60,70)'
  if (index === 8) return 0.65;  // '# Frenadas bruscas'
  if (index === 9) return 0.65;  // '# Sobre Aceleraciones'
  if (index === 10) return 0.52; // '# Ralenti'
  if (index === 11) return 0.52; // 'Horas Ralenti'
  return 0.78;
}

function agruparAlertas(
  alertas: AlertaDiariaGps[],
  campo: 'infraccion_80_kmh' | 'excesos_varios_parametros' | 'excesos_50_80_kmh' | 'frenadas_bruscas',
) {
  const map = new Map<string, { placa: string; conductor: string; tipo: string; total: number }>();
  for (const a of alertas) {
    const total = Number(a[campo] ?? 0);
    if (total <= 0) continue;
    const key = `${a.placa}|${mayuscula(a.conductor || 'No registra')}|${a.tipo_activo}`;
    const current = map.get(key) ?? {
      placa: a.placa,
      conductor: mayuscula(a.conductor || 'No registra'),
      tipo: a.tipo_activo || 'N/A',
      total: 0,
    };
    current.total += total;
    map.set(key, current);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total || a.placa.localeCompare(b.placa));
}

function ReportHeader({ title }: { title: string }) {
  return (
    <View style={{ marginBottom: 5 }} fixed>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Image src={magnexLogo} style={{ width: 48, height: 28 }} />
        </View>
        <View style={{ flex: 4, alignItems: 'center' }}>
          <Text style={{ fontSize: 6.2, fontWeight: 700, color: COLORS.azul }}>{title}</Text>
          <Text style={{ fontSize: 5.4, color: COLORS.azul, marginTop: 2 }}>Token ID Documental: COL-1207     Version: 1     Vigente desde: 6/12/2024</Text>
        </View>
        <View style={{ flex: 1 }} />
      </View>
    </View>
  );
}

function ReportHeaderDiario({ title }: { title: string }) {
  return (
    <View style={{ marginBottom: 5 }} fixed>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Image src={magnexLogo} style={{ width: 48, height: 28 }} />
        </View>
        <View style={{ flex: 4, alignItems: 'center' }}>
          <Text style={{ fontSize: 6.2, fontWeight: 700, color: COLORS.azul }}>{title}</Text>
        </View>
        <View style={{ flex: 1 }} />
      </View>
    </View>
  );
}

function ReportFooter() {
  return (
    <View fixed style={{ position: 'absolute', left: 24, right: 24, bottom: 18, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
      <Image src={orionLogo} style={{ width: 58, height: 12 }} />
      <Text style={{ fontSize: 5.5, color: COLORS.azul, fontWeight: 700, textAlign: 'right' }}>
        Documento controlado. Copia no controlada si el documento es descargado o impreso{'\n'}
        Todos los derechos reservados para MAGNEX.
      </Text>
    </View>
  );
}

function ReportFooterDiario() {
  return (
    <View fixed style={{ position: 'absolute', left: 22, right: 22, bottom: 14, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: COLORS.grisBorde, paddingTop: 4 }}>
      <Text style={{ fontSize: 5.5, color: COLORS.azulClaro, fontWeight: 700 }}>
        Informe Generado por el Centro de Control y Monitoreo Vial{'\n'}de Magnex Group
      </Text>
      <Text style={{ fontSize: 5.5, color: COLORS.azulClaro, fontWeight: 700, textAlign: 'right' }}>
        Omar Andres Botero - Lider HSEQ{'\n'}/ Representante PESV
      </Text>
    </View>
  );
}

function Band({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <View style={{ backgroundColor: dark ? COLORS.azul : '#b7e2f7', padding: 2.2, borderWidth: 0.4, borderColor: COLORS.sombra }}>
      <Text style={{ fontSize: 6.1, fontWeight: 700, color: dark ? COLORS.blanco : COLORS.negro, textAlign: 'center' }}>{children}</Text>
    </View>
  );
}

function Cell({ label, value, labelFlex = 1.5, valueFlex = 2 }: { label: string; value: string; labelFlex?: number; valueFlex?: number }) {
  return (
    <View style={{ flexDirection: 'row', minHeight: 13 }}>
      <View style={{ flex: labelFlex, backgroundColor: '#b7e2f7', justifyContent: 'center', padding: 2, borderWidth: 0.3, borderColor: COLORS.sombra }}>
        <Text style={{ fontSize: 5.3, fontWeight: 700, textAlign: 'center' }}>{label}</Text>
      </View>
      <View style={{ flex: valueFlex, justifyContent: 'center', padding: 2, borderWidth: 0.3, borderColor: COLORS.sombra }}>
        <Text style={{ fontSize: 5.7, textAlign: 'center' }}>{value}</Text>
      </View>
    </View>
  );
}

function MetricCell({
  label,
  value,
  highlight,
  bgColor,
  textColor
}: {
  label: string;
  value: string;
  highlight?: boolean;
  bgColor?: string;
  textColor?: string;
}) {
  const bg = bgColor || (highlight ? '#c6efce' : COLORS.blanco);
  const tc = textColor || COLORS.negro;
  return (
    <View style={{ flex: 1, flexDirection: 'row', minHeight: 16 }}>
      <View style={{ flex: 1.4, backgroundColor: '#b7e2f7', justifyContent: 'center', padding: 2, borderWidth: 0.3, borderColor: COLORS.sombra }}>
        <Text style={{ fontSize: 5.1, fontWeight: 700, textAlign: 'center' }}>{label}</Text>
      </View>
      <View style={{ flex: 1, backgroundColor: bg, justifyContent: 'center', padding: 2, borderWidth: 0.3, borderColor: COLORS.sombra }}>
        <Text style={{ fontSize: 5.5, fontWeight: 700, textAlign: 'center', color: tc }}>{value}</Text>
      </View>
    </View>
  );
}


function MiniBarChart({ valores }: { valores: Array<{ label: string; value: number; color: string }> }) {
  const max = Math.max(...valores.map(v => v.value), 1);
  return (
    <View style={{ flex: 1, height: 70, borderWidth: 0.4, borderColor: COLORS.sombra, padding: 5, flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
      {valores.map(v => (
        <View key={v.label} style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 5, marginBottom: 2 }}>{n(v.value)}</Text>
          <View style={{ width: 14, height: Math.max(2, (v.value / max) * 43), backgroundColor: v.color }} />
          <Text style={{ fontSize: 4.2, marginTop: 2, textAlign: 'center' }}>{v.label}</Text>
        </View>
      ))}
    </View>
  );
}

function AccionesYFirmas({
  tipoEntidad,
  metricas,
  totalVehiculosOperacion,
  vehiculosConGps,
  entidadesExceso80,
  entidadesFrenadas,
  entidadesAceleraciones,
}: {
  tipoEntidad: 'vehiculos' | 'conductores';
  metricas: ReturnType<typeof metricasConsolidado>;
  totalVehiculosOperacion: number;
  vehiculosConGps: number;
  entidadesExceso80: number;
  entidadesFrenadas: number;
  entidadesAceleraciones: number;
}) {
  const porcentajeMonitoreados = totalVehiculosOperacion > 0
    ? (vehiculosConGps / totalVehiculosOperacion) * 100
    : 0;

  return (
    <>
      <Band dark>3. ANALISIS DE LA INFORMACION</Band>
      <Band>3.1. DESCRIPCION DE LAS DESVIACIONES IDENTIFICADAS</Band>
      <View style={{ minHeight: 70, borderWidth: 0.3, borderColor: COLORS.sombra, padding: 4 }}>
        <Text style={{ fontSize: 5.4 }}>Nota: Los kilometros registrados del periodo evaluado corresponden a los capturados del sistema GPS de cada vehiculo.</Text>
        <Text style={{ fontSize: 5.4, marginTop: 6 }}>1. El informe de comportamiento vial fue generado con el {n(porcentajeMonitoreados, 0)}% de los vehiculos monitoreados ({n(vehiculosConGps)} de {n(totalVehiculosOperacion)} vehiculos en la operacion).</Text>
        <Text style={{ fontSize: 5.4, marginTop: 4 }}>2. Se identifican ( {n(entidadesExceso80)} ) {tipoEntidad} que excedieron los limites de velocidad superiores a 80 km/h con ( {n(metricas.excesos80)} ) eventos presentados en este tipo de desviacion.</Text>
        <Text style={{ fontSize: 5.4, marginTop: 4 }}>3. Se identifican ( {n(metricas.frenadas)} ) frenadas bruscas en ( {n(entidadesFrenadas)} ) {tipoEntidad}; este comportamiento puede estar asociado a habitos de conduccion o condiciones de operacion.</Text>
        <Text style={{ fontSize: 5.4, marginTop: 4 }}>4. Se registran ( {n(metricas.aceleraciones)} ) sobre aceleraciones en ( {n(entidadesAceleraciones)} ) {tipoEntidad} por fuera de los parametros de operacion.</Text>
      </View>
      <Band>3.2. ACCIONES DE MEJORA EN EL DESEMPENO VIAL</Band>
      <View style={{ flexDirection: 'row', minHeight: 18 }}>
        {['ACCIONES DE MEJORA', 'RESPONSABLE', 'FECHA DE CIERRE'].map(h => (
          <View key={h} style={{ flex: 1, borderWidth: 0.3, borderColor: COLORS.sombra, padding: 3 }}>
            <Text style={{ fontSize: 5.5, fontWeight: 700, textAlign: 'center' }}>{h}</Text>
          </View>
        ))}
      </View>
      <Band>RESPONSABLE DE LA ELABORACION</Band>
      <View style={{ flexDirection: 'row', minHeight: 18 }}>
        <View style={{ flex: 1, borderWidth: 0.3, borderColor: COLORS.sombra, padding: 3, alignItems: 'center' }}>
          <Text style={{ fontSize: 5.5, fontWeight: 700 }}>NOMBRE Y APELLIDO</Text>
          <Text style={{ fontSize: 5.5 }}>OMAR ANDRES BOTERO</Text>
        </View>
        <View style={{ flex: 1, borderWidth: 0.3, borderColor: COLORS.sombra, padding: 3, alignItems: 'center' }}>
          <Text style={{ fontSize: 5.5, fontWeight: 700 }}>CARGO</Text>
          <Text style={{ fontSize: 5.5 }}>LIDER HSEQ</Text>
        </View>
      </View>
      <Text style={{ textAlign: 'center', fontSize: 6, fontWeight: 700, marginTop: 4 }}>*** FIN DEL DOCUMENTO ***</Text>
    </>
  );
}

function ConsolidadoHeader({
  titulo,
  subtitulo,
  contrato,
  periodoInicio,
  periodoFin,
}: {
  titulo: string;
  subtitulo: string;
  contrato: ContratoOption;
  periodoInicio: string;
  periodoFin: string;
}) {
  return (
    <View style={base.header}>
      <View style={base.headerLeft}>
        <Text style={base.headerTitle}>{titulo}</Text>
        <Text style={base.headerSubtitle}>{subtitulo}</Text>
        <Text style={base.headerSubtitle}>Contrato: {contrato.nombre}</Text>
      </View>
      <View style={base.headerRight}>
        <Text style={base.headerDate}>Cliente: {contrato.cliente || '-'}</Text>
        <Text style={base.headerDate}>Periodo: {fmt(periodoInicio)} - {fmt(periodoFin)}</Text>
        <Text style={base.headerDate}>Generado: {fmt(getLocalDateISO())}</Text>
      </View>
    </View>
  );
}

function ConsolidadoConductoresContratoPDFLegacy({
  contrato,
  datos,
  periodoInicio,
  periodoFin,
}: {
  contrato: ContratoOption;
  datos: ReporteConductorData[];
  periodoInicio: string;
  periodoFin: string;
}) {
  const totalKm = datos.reduce((acc, d) => acc + d.metricas.kms, 0);
  const totalHoras = datos.reduce((acc, d) => acc + d.metricas.horas_conduccion, 0);
  const calificacion = promedioNumerico(datos.map(d => d.metricas.calificacion));
  const totalExcesos = datos.reduce((acc, d) =>
    acc + d.metricas.excesos_10_kph + d.metricas.excesos_20_kph +
    d.metricas.excesos_30_kph + d.metricas.excesos_40_kph +
    d.metricas.excesos_50_kph + d.metricas.excesos_60_kph +
    d.metricas.excesos_80_kph, 0);

  return (
    <Document title={`Conductores - ${contrato.nombre}`}>
      <Page size="LETTER" orientation="portrait" style={base.page}>
        <ConsolidadoHeader titulo="INFORME MENSUAL DE CONDUCTORES" subtitulo="Consolidado por contrato" contrato={contrato} periodoInicio={periodoInicio} periodoFin={periodoFin} />
        <View style={[base.row, { gap: 8, marginBottom: 10 }]}>
          {[
            ['Conductores', n(datos.length)],
            ['Calificacion prom.', n(calificacion, 1)],
            ['Km recorridos', n(totalKm, 1)],
            ['Horas conduccion', n(totalHoras, 1)],
            ['Eventos velocidad', n(totalExcesos)],
          ].map(([label, value], i) => (
            <View key={i} style={{ flex: 1, backgroundColor: COLORS.azulBg, padding: 6, borderRadius: 4, alignItems: 'center' }}>
              <Text style={{ fontSize: 12, fontWeight: 700, color: COLORS.azul }}>{value}</Text>
              <Text style={{ fontSize: 6, color: COLORS.gris }}>{label}</Text>
            </View>
          ))}
        </View>
        <View style={base.tableHeader}>
          {['Conductor', 'Cedula', 'Base', 'Cal.', 'Km', 'Horas', 'Exc.10', 'Exc.20', 'Exc.30', 'Exc.40', 'Exc.50', 'Exc.60', 'Exc.80', 'Acel.', 'Fren.'].map((h, i) => (
            <Text key={h} style={[base.tableHeaderCell, { flex: i === 0 ? 2.2 : i === 2 ? 1.2 : 0.75 }]}>{h}</Text>
          ))}
        </View>
        {datos.map((d, i) => (
          <View key={d.conductor.id} style={[base.tableRow, i % 2 ? base.tableRowAlt : {}]} wrap={false}>
            <Text style={[base.tableCell, { flex: 2.2 }]}>{mayuscula(d.conductor.nombres)}</Text>
            <Text style={[base.tableCell, { flex: 0.75 }]}>{d.conductor.cedula}</Text>
            <Text style={[base.tableCell, { flex: 1.2 }]}>{d.conductor.base}</Text>
            <Text style={[base.tableCell, { flex: 0.75 }]}>{n(d.metricas.calificacion, 1)}</Text>
            <Text style={[base.tableCell, { flex: 0.75 }]}>{n(d.metricas.kms, 1)}</Text>
            <Text style={[base.tableCell, { flex: 0.75 }]}>{n(d.metricas.horas_conduccion, 1)}</Text>
            <Text style={[base.tableCell, { flex: 0.75 }]}>{n(d.metricas.excesos_10_kph)}</Text>
            <Text style={[base.tableCell, { flex: 0.75 }]}>{n(d.metricas.excesos_20_kph)}</Text>
            <Text style={[base.tableCell, { flex: 0.75 }]}>{n(d.metricas.excesos_30_kph)}</Text>
            <Text style={[base.tableCell, { flex: 0.75 }]}>{n(d.metricas.excesos_40_kph)}</Text>
            <Text style={[base.tableCell, { flex: 0.75 }]}>{n(d.metricas.excesos_50_kph)}</Text>
            <Text style={[base.tableCell, { flex: 0.75 }]}>{n(d.metricas.excesos_60_kph)}</Text>
            <Text style={[base.tableCell, { flex: 0.75 }]}>{n(d.metricas.excesos_80_kph)}</Text>
            <Text style={[base.tableCell, { flex: 0.75 }]}>{n(d.metricas.aceleraciones)}</Text>
            <Text style={[base.tableCell, { flex: 0.75 }]}>{n(d.metricas.frenadas)}</Text>
          </View>
        ))}
        <View style={base.footer} fixed>
          <Text style={base.footerText}>Torre de Control - Sistema de Gestion de Flotas</Text>
          <Text style={base.footerText} render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

function ConsolidadoVehiculosContratoPDFLegacy({
  contrato,
  datos,
  periodoInicio,
  periodoFin,
}: {
  contrato: ContratoOption;
  datos: ReporteVehiculoData[];
  periodoInicio: string;
  periodoFin: string;
}) {
  const totalKm = datos.reduce((acc, d) => acc + d.metricas.kms, 0);
  const totalHoras = datos.reduce((acc, d) => acc + d.metricas.horas_conduccion, 0);
  const totalRalenti = datos.reduce((acc, d) => acc + d.ralenti.horas_motor_ralenti, 0);
  const calificacion = promedioNumerico(datos.map(d => d.metricas.calificacion));

  return (
    <Document title={`Vehiculos - ${contrato.nombre}`}>
      <Page size="LETTER" orientation="portrait" style={base.page}>
        <ConsolidadoHeader titulo="INFORME MENSUAL DE VEHICULOS" subtitulo="Consolidado por contrato" contrato={contrato} periodoInicio={periodoInicio} periodoFin={periodoFin} />
        <View style={[base.row, { gap: 8, marginBottom: 10 }]}>
          {[
            ['Vehiculos', n(datos.length)],
            ['Calificacion prom.', n(calificacion, 1)],
            ['Km recorridos', n(totalKm, 1)],
            ['Horas conduccion', n(totalHoras, 1)],
            ['Horas ralenti', n(totalRalenti, 1)],
          ].map(([label, value], i) => (
            <View key={i} style={{ flex: 1, backgroundColor: COLORS.azulBg, padding: 6, borderRadius: 4, alignItems: 'center' }}>
              <Text style={{ fontSize: 12, fontWeight: 700, color: COLORS.azul }}>{value}</Text>
              <Text style={{ fontSize: 6, color: COLORS.gris }}>{label}</Text>
            </View>
          ))}
        </View>
        <View style={base.tableHeader}>
          {['Placa', 'Marca/Linea', 'Tipo', 'Cal.', 'Km', 'Horas', 'Exc.10', 'Exc.20', 'Exc.50', 'Exc.80', 'Acel.', 'Fren.', 'Enc/Apag', 'Ralenti', 'H.Ralenti', 'Consumo'].map((h, i) => (
            <Text key={h} style={[base.tableHeaderCell, { flex: i === 1 ? 1.8 : i === 2 ? 1.1 : 0.75 }]}>{h}</Text>
          ))}
        </View>
        {datos.map((d, i) => (
          <View key={d.vehiculo.id} style={[base.tableRow, i % 2 ? base.tableRowAlt : {}]} wrap={false}>
            <Text style={[base.tableCell, { flex: 0.75 }]}>{d.vehiculo.placa}</Text>
            <Text style={[base.tableCell, { flex: 1.8 }]}>{`${d.vehiculo.marca} ${d.vehiculo.linea}`}</Text>
            <Text style={[base.tableCell, { flex: 1.1 }]}>{d.vehiculo.tipo_activo}</Text>
            <Text style={[base.tableCell, { flex: 0.75 }]}>{n(d.metricas.calificacion, 1)}</Text>
            <Text style={[base.tableCell, { flex: 0.75 }]}>{n(d.metricas.kms, 1)}</Text>
            <Text style={[base.tableCell, { flex: 0.75 }]}>{n(d.metricas.horas_conduccion, 1)}</Text>
            <Text style={[base.tableCell, { flex: 0.75 }]}>{n(d.metricas.excesos_10_kph)}</Text>
            <Text style={[base.tableCell, { flex: 0.75 }]}>{n(d.metricas.excesos_20_kph)}</Text>
            <Text style={[base.tableCell, { flex: 0.75 }]}>{n(d.metricas.excesos_50_kph)}</Text>
            <Text style={[base.tableCell, { flex: 0.75 }]}>{n(d.metricas.excesos_80_kph)}</Text>
            <Text style={[base.tableCell, { flex: 0.75 }]}>{n(d.metricas.aceleraciones)}</Text>
            <Text style={[base.tableCell, { flex: 0.75 }]}>{n(d.metricas.frenadas)}</Text>
            <Text style={[base.tableCell, { flex: 0.75 }]}>{n(d.ralenti.encendidos_apagados)}</Text>
            <Text style={[base.tableCell, { flex: 0.75 }]}>{n(d.ralenti.ralentis_excesivos)}</Text>
            <Text style={[base.tableCell, { flex: 0.75 }]}>{n(d.ralenti.horas_motor_ralenti, 1)}</Text>
            <Text style={[base.tableCell, { flex: 0.75 }]}>{n(d.ralenti.consumo_combustible, 1)}</Text>
          </View>
        ))}
        <View style={base.footer} fixed>
          <Text style={base.footerText}>Torre de Control - Sistema de Gestion de Flotas</Text>
          <Text style={base.footerText} render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export function ConsolidadoConductoresContratoPDF({
  contrato,
  datos,
  vehiculos,
  resumen,
  periodoInicio,
  periodoFin,
  datosAnteriores,
  vehiculosAnteriores,
}: {
  contrato: ContratoOption;
  datos: ReporteConductorData[];
  vehiculos: ReporteVehiculoData[];
  resumen: ConsolidadoContratoResumen;
  periodoInicio: string;
  periodoFin: string;
  datosAnteriores?: ReporteConductorData[];
  vehiculosAnteriores?: ReporteVehiculoData[];
}) {
  const m = metricasConsolidado('conductores', datos, vehiculos);
  const mAnt = metricasConsolidado('conductores', datosAnteriores || [], vehiculosAnteriores || []);
  const top = [...datos].sort((a, b) => totalIncidencias(b.metricas) - totalIncidencias(a.metricas)).slice(0, 10);
  const entidadesExceso80 = datos.filter(d => d.metricas.excesos_80_kph > 0).length;
  const entidadesFrenadas = datos.filter(d => d.metricas.frenadas > 0).length;
  const entidadesAceleraciones = datos.filter(d => d.metricas.aceleraciones > 0).length;

  const varKms = calcularVariacion(m.kms, mAnt.kms);
  const varRalenti = calcularVariacion(m.horasRalenti, mAnt.horasRalenti, true);
  const varConduccion = calcularVariacion(m.horasConduccion, mAnt.horasConduccion);

  const varExcesos80 = calcularVariacion(m.excesos80, mAnt.excesos80, true);
  const varExcesosVarios = calcularVariacion(m.excesosVarios, mAnt.excesosVarios, true);
  const varFrenadas = calcularVariacion(m.frenadas, mAnt.frenadas, true);
  const varAceleraciones = calcularVariacion(m.aceleraciones, mAnt.aceleraciones, true);

  return (
    <Document title={`Conductores - ${contrato.nombre}`}>
      <Page size="LETTER" orientation="portrait" style={[base.page, { padding: 18, paddingBottom: 54 }]}>
        <ReportHeader title="FORMATO LOCAL PARA INFORME GESTION MENSUAL COMPORTAMIENTO FLOTA VEHICULAR (GPS)" />
        <ReportFooter />
        <Band dark>1. INFORMACION GENERAL</Band>
        <Cell label="FECHA DEL REPORTE:" value={fmt(getLocalDateISO())} />
        <Cell label="PERIODO EVALUADO:" value={`${fmt(periodoInicio)} - ${fmt(periodoFin)}`} />
        <Cell label="PROYECTO / CONTRATO:" value={contrato.nombre} />
        <Cell label="BASE / ZONA:" value={baseZonaConductores(datos, contrato.proyecto)} />

        <Band dark>2. RESUMEN DEL PERIODO EVALUADO</Band>
        <Band>2.1. DATOS GENERALES - PERIODO EVALUADO</Band>
        <Cell label="TOTAL VEHICULOS EN LA OPERACION:" value={n(resumen.totalVehiculos)} />
        <Cell label="VEHICULOS MONITOREADOS (GPS):" value={n(resumen.vehiculosConGps)} />
        <Cell label="VEHICULOS SIN GPS:" value={n(resumen.vehiculosSinGps)} />
        <Cell label="NUMERO CONDUCTORES:" value={n(resumen.totalConductores)} />

        <Band>2.2. PARAMETROS DE OPERACION - PERIODO EVALUADO</Band>
        <View style={{ flexDirection: 'row' }}>
          <MetricCell label="KILOMETROS RECORRIDOS EN EL MES:" value={n(m.kms, 1)} />
          <MetricCell label="HORAS EN RALENTI - TOTAL FLOTA:" value={n(m.horasRalenti, 1)} />
          <MetricCell label="HORAS DE CONDUCCION:" value={n(m.horasConduccion, 1)} />
        </View>
        <View style={{ flexDirection: 'row' }}>
          <MetricCell label="VARIACION MES ANTERIOR (%)" value={varKms.texto} bgColor={varKms.bgColor} textColor={varKms.textColor} />
          <MetricCell label="VARIACION MES ANTERIOR (%)" value={varRalenti.texto} bgColor={varRalenti.bgColor} textColor={varRalenti.textColor} />
          <MetricCell label="VARIACION MES ANTERIOR (%)" value={varConduccion.texto} bgColor={varConduccion.bgColor} textColor={varConduccion.textColor} />
        </View>

        <Band>2.3. DESVIACIONES DE COMPORTAMIENTO VIAL</Band>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1.3 }}>
            <View style={{ flexDirection: 'row', minHeight: 11, backgroundColor: '#d9d9d9' }}>
              <View style={{ flex: 2.2, justifyContent: 'center', padding: 2, borderWidth: 0.3, borderColor: COLORS.sombra }}>
                <Text style={{ fontSize: 4.8, fontWeight: 700, textAlign: 'center' }}>DESVIACION</Text>
              </View>
              <View style={{ flex: 1, justifyContent: 'center', padding: 2, borderWidth: 0.3, borderColor: COLORS.sombra }}>
                <Text style={{ fontSize: 4.8, fontWeight: 700, textAlign: 'center' }}>CANTIDAD</Text>
              </View>
              <View style={{ flex: 1, justifyContent: 'center', padding: 2, borderWidth: 0.3, borderColor: COLORS.sombra }}>
                <Text style={{ fontSize: 4.8, fontWeight: 700, textAlign: 'center' }}>VAR. MES ANT.</Text>
              </View>
            </View>
            <CellWithVariation label="# EXCESOS DE VELOCIDAD 80 KM/H:" value={n(m.excesos80)} varResultado={varExcesos80} />
            <CellWithVariation label="# EXCESOS DE VELOCIDAD VARIOS PARAMETROS (10/20/30/40/50/60):" value={n(m.excesosVarios)} varResultado={varExcesosVarios} />
            <CellWithVariation label="# FRENADAS BRUSCAS:" value={n(m.frenadas)} varResultado={varFrenadas} />
            <CellWithVariation label="# ACELERACIONES BRUSCAS:" value={n(m.aceleraciones)} varResultado={varAceleraciones} />
          </View>
          <View style={{ flex: 1, paddingLeft: 10 }}>
            <MiniBarChart valores={[
              { label: 'Excesos 80 Km/h', value: m.excesos80, color: '#d9d9d9' },
              { label: 'Excesos varios', value: m.excesosVarios, color: '#ff3b1f' },
              { label: 'Frenadas Bruscas', value: m.frenadas, color: '#ffc000' },
              { label: 'Aceleraciones', value: m.aceleraciones, color: '#d9d9d9' },
            ]} />
          </View>
        </View>


        <Band>2.4. DESVIACIONES POR CONDUCTOR - PERIODO EVALUADO</Band>
        <View style={base.tableHeader}>
          {['#', 'Conductor', 'Cedula', 'Ibutton', 'Calificacion', 'Km recorridos', 'Horas Conduccion', '# Excesos 80 Km/h', '# Exceso Velocidad Maxima', '# Frenadas bruscas', '# Sobre Aceleraciones'].map((h, i) => (
            <Text key={h} style={[base.tableHeaderCell, { flex: conductorTableFlex(i) }]}>{h}</Text>
          ))}
        </View>
        {top.map((d, i) => (
          <View key={d.conductor.id} style={[base.tableRow, i % 2 ? base.tableRowAlt : {}]} wrap={false}>
            <Text style={[base.tableCell, { flex: conductorTableFlex(0) }]}>{i + 1}</Text>
            <Text style={[base.tableCell, { flex: conductorTableFlex(1), fontWeight: 700, textAlign: 'left' }]}>{mayuscula(d.conductor.nombres)}</Text>
            <Text style={[base.tableCell, { flex: conductorTableFlex(2) }]}>{d.conductor.cedula}</Text>
            <Text style={[base.tableCell, { flex: conductorTableFlex(3) }]}>{d.conductor.ibutton}</Text>
            <Text style={[base.tableCell, { flex: conductorTableFlex(4) }]}>{n(d.metricas.calificacion, 0)}</Text>
            <Text style={[base.tableCell, { flex: conductorTableFlex(5) }]}>{n(d.metricas.kms, 1)}</Text>
            <Text style={[base.tableCell, { flex: conductorTableFlex(6) }]}>{n(d.metricas.horas_conduccion, 1)}</Text>
            <Text style={[base.tableCell, { flex: conductorTableFlex(7) }]}>{n(d.metricas.excesos_80_kph)}</Text>
            <Text style={[base.tableCell, { flex: conductorTableFlex(8) }]}>{n(excesosVarios(d.metricas))}</Text>
            <Text style={[base.tableCell, { flex: conductorTableFlex(9) }]}>{n(d.metricas.frenadas)}</Text>
            <Text style={[base.tableCell, { flex: conductorTableFlex(10) }]}>{n(d.metricas.aceleraciones)}</Text>
          </View>
        ))}
        <Text style={{ fontSize: 5.5, fontWeight: 700, marginTop: 3 }}>NOTA: En el anterior cuadro, solo se enuncia los primeros diez (10) conductores que presentaron un alto indice de riesgo vial.</Text>
        <AccionesYFirmas
          tipoEntidad="conductores"
          metricas={m}
          totalVehiculosOperacion={resumen.totalVehiculos}
          vehiculosConGps={resumen.vehiculosConGps}
          entidadesExceso80={entidadesExceso80}
          entidadesFrenadas={entidadesFrenadas}
          entidadesAceleraciones={entidadesAceleraciones}
        />
      </Page>

      {resumen.totalConductores > 10 && datos.length > 10 && (
      <Page size="LETTER" orientation="portrait" style={[base.page, { padding: 18, paddingBottom: 54 }]}>
        <ReportHeader title="FORMATO LOCAL PARA INFORME GESTION MENSUAL COMPORTAMIENTO FLOTA VEHICULAR (GPS)" />
        <ReportFooter />
        <View style={base.tableHeader}>
          {['#', 'Conductor', 'Cedula', 'Ibutton', 'Calificacion', 'Km recorridos', 'Horas Conduccion', '# Excesos 80 Km/h', '# Exceso Velocidad Maxima', '# Frenadas bruscas', '# Sobre Aceleraciones'].map((h, i) => (
            <Text key={h} style={[base.tableHeaderCell, { flex: conductorTableFlex(i) }]}>{h}</Text>
          ))}
        </View>
        {datos.map((d, i) => (
          <View key={d.conductor.id} style={[base.tableRow, i % 2 ? base.tableRowAlt : {}]} wrap={false}>
            <Text style={[base.tableCell, { flex: conductorTableFlex(0) }]}>{i + 1}</Text>
            <Text style={[base.tableCell, { flex: conductorTableFlex(1), fontWeight: 700, textAlign: 'left' }]}>{mayuscula(d.conductor.nombres)}</Text>
            <Text style={[base.tableCell, { flex: conductorTableFlex(2) }]}>{d.conductor.cedula}</Text>
            <Text style={[base.tableCell, { flex: conductorTableFlex(3) }]}>{d.conductor.ibutton}</Text>
            <Text style={[base.tableCell, { flex: conductorTableFlex(4) }]}>{n(d.metricas.calificacion, 0)}</Text>
            <Text style={[base.tableCell, { flex: conductorTableFlex(5) }]}>{n(d.metricas.kms, 1)}</Text>
            <Text style={[base.tableCell, { flex: conductorTableFlex(6) }]}>{n(d.metricas.horas_conduccion, 1)}</Text>
            <Text style={[base.tableCell, { flex: conductorTableFlex(7) }]}>{n(d.metricas.excesos_80_kph)}</Text>
            <Text style={[base.tableCell, { flex: conductorTableFlex(8) }]}>{n(excesosVarios(d.metricas))}</Text>
            <Text style={[base.tableCell, { flex: conductorTableFlex(9) }]}>{n(d.metricas.frenadas)}</Text>
            <Text style={[base.tableCell, { flex: conductorTableFlex(10) }]}>{n(d.metricas.aceleraciones)}</Text>
          </View>
        ))}
      </Page>
      )}
    </Document>
  );
}

export function ConsolidadoVehiculosContratoPDF({
  contrato,
  datos,
  conductores,
  resumen,
  periodoInicio,
  periodoFin,
  datosAnteriores,
  conductoresAnteriores,
}: {
  contrato: ContratoOption;
  datos: ReporteVehiculoData[];
  conductores: ReporteConductorData[];
  resumen: ConsolidadoContratoResumen;
  periodoInicio: string;
  periodoFin: string;
  datosAnteriores?: ReporteVehiculoData[];
  conductoresAnteriores?: ReporteConductorData[];
}) {
  const m = metricasConsolidado('vehiculos', conductores, datos);
  const mAnt = metricasConsolidado('vehiculos', conductoresAnteriores || [], datosAnteriores || []);
  const top = [...datos].sort((a, b) => totalIncidencias(b.metricas) - totalIncidencias(a.metricas)).slice(0, 10);
  const entidadesExceso80 = datos.filter(d => d.metricas.excesos_80_kph > 0).length;
  const entidadesFrenadas = datos.filter(d => d.metricas.frenadas > 0).length;
  const entidadesAceleraciones = datos.filter(d => d.metricas.aceleraciones > 0).length;

  const varKms = calcularVariacion(m.kms, mAnt.kms);
  const varRalenti = calcularVariacion(m.horasRalenti, mAnt.horasRalenti, true);
  const varConduccion = calcularVariacion(m.horasConduccion, mAnt.horasConduccion);

  const varExcesos80 = calcularVariacion(m.excesos80, mAnt.excesos80, true);
  const varExcesosVarios = calcularVariacion(m.excesosVarios, mAnt.excesosVarios, true);
  const varFrenadas = calcularVariacion(m.frenadas, mAnt.frenadas, true);
  const varAceleraciones = calcularVariacion(m.aceleraciones, mAnt.aceleraciones, true);

  return (
    <Document title={`Vehiculos - ${contrato.nombre}`}>
      <Page size="LETTER" orientation="portrait" style={[base.page, { padding: 18, paddingBottom: 54 }]}>
        <ReportHeader title="FORMATO LOCAL PARA INFORME GESTION MENSUAL COMPORTAMIENTO FLOTA VEHICULAR (GPS)" />
        <ReportFooter />
        <Band dark>1. INFORMACION GENERAL</Band>
        <Cell label="FECHA DEL REPORTE:" value={fmt(getLocalDateISO())} />
        <Cell label="PERIODO EVALUADO:" value={`${fmt(periodoInicio)} - ${fmt(periodoFin)}`} />
        <Cell label="PROYECTO / CONTRATO:" value={contrato.nombre} />
        <Cell label="BASE / ZONA:" value={baseZonaVehiculos(datos, contrato.proyecto)} />
        <Band dark>2. RESUMEN DEL PERIODO EVALUADO</Band>
        <Band>2.1. DATOS GENERALES - PERIODO EVALUADO</Band>
        <Cell label="TOTAL VEHICULOS EN LA OPERACION:" value={n(resumen.totalVehiculos)} />
        <Cell label="VEHICULOS MONITOREADOS (GPS):" value={n(resumen.vehiculosConGps)} />
        <Cell label="VEHICULOS SIN GPS:" value={n(resumen.vehiculosSinGps)} />
        <Cell label="NUMERO CONDUCTORES:" value={n(resumen.totalConductores)} />
        <Band>2.2. PARAMETROS DE OPERACION - PERIODO EVALUADO</Band>
        <View style={{ flexDirection: 'row' }}>
          <MetricCell label="KILOMETROS RECORRIDOS EN EL MES:" value={n(m.kms, 1)} />
          <MetricCell label="HORAS EN RALENTI - TOTAL FLOTA:" value={n(m.horasRalenti, 1)} />
          <MetricCell label="HORAS DE CONDUCCION:" value={n(m.horasConduccion, 1)} />
        </View>
        <View style={{ flexDirection: 'row' }}>
          <MetricCell label="VARIACION MES ANTERIOR (%)" value={varKms.texto} bgColor={varKms.bgColor} textColor={varKms.textColor} />
          <MetricCell label="VARIACION MES ANTERIOR (%)" value={varRalenti.texto} bgColor={varRalenti.bgColor} textColor={varRalenti.textColor} />
          <MetricCell label="VARIACION MES ANTERIOR (%)" value={varConduccion.texto} bgColor={varConduccion.bgColor} textColor={varConduccion.textColor} />
        </View>
        <Band>2.3. DESVIACIONES DE COMPORTAMIENTO VIAL</Band>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1.3 }}>
            <View style={{ flexDirection: 'row', minHeight: 11, backgroundColor: '#d9d9d9' }}>
              <View style={{ flex: 2.2, justifyContent: 'center', padding: 2, borderWidth: 0.3, borderColor: COLORS.sombra }}>
                <Text style={{ fontSize: 4.8, fontWeight: 700, textAlign: 'center' }}>DESVIACION</Text>
              </View>
              <View style={{ flex: 1, justifyContent: 'center', padding: 2, borderWidth: 0.3, borderColor: COLORS.sombra }}>
                <Text style={{ fontSize: 4.8, fontWeight: 700, textAlign: 'center' }}>CANTIDAD</Text>
              </View>
              <View style={{ flex: 1, justifyContent: 'center', padding: 2, borderWidth: 0.3, borderColor: COLORS.sombra }}>
                <Text style={{ fontSize: 4.8, fontWeight: 700, textAlign: 'center' }}>VAR. MES ANT.</Text>
              </View>
            </View>
            <CellWithVariation label="# EXCESOS DE VELOCIDAD 80 KM/H:" value={n(m.excesos80)} varResultado={varExcesos80} />
            <CellWithVariation label="# EXCESOS DE VELOCIDAD VARIOS PARAMETROS (10/20/30/40/50/60):" value={n(m.excesosVarios)} varResultado={varExcesosVarios} />
            <CellWithVariation label="# FRENADAS BRUSCAS:" value={n(m.frenadas)} varResultado={varFrenadas} />
            <CellWithVariation label="# ACELERACIONES BRUSCAS:" value={n(m.aceleraciones)} varResultado={varAceleraciones} />
          </View>
          <View style={{ flex: 1, paddingLeft: 10 }}>
            <MiniBarChart valores={[
              { label: 'Excesos 80 Km/h', value: m.excesos80, color: '#d9d9d9' },
              { label: 'Excesos varios', value: m.excesosVarios, color: '#ff3b1f' },
              { label: 'Frenadas Bruscas', value: m.frenadas, color: '#ffc000' },
              { label: 'Aceleraciones', value: m.aceleraciones, color: '#d9d9d9' },
            ]} />
          </View>
        </View>

        <Band>2.4. DESVIACIONES POR VEHICULO - PERIODO EVALUADO</Band>
        <View style={base.tableHeader}>
          {[
            '#', 'Placa', 'Dispositivo GPS', 'KM Recorridos', 'Horas Conducción',
            '# Excesos 80 Km/h', 'Máxima Vel. 80 Km/h',
            '# Exceso Velocidad Maxima (varios parametros 20,30,40,50,60,70)',
            '# Frenadas bruscas', '# Sobre Aceleraciones', '# Ralenti', 'Horas Ralenti'
          ].map((h, i) => (
            <Text key={h} style={[base.tableHeaderCell, { flex: vehiculoTableFlex(i) }]}>{h}</Text>
          ))}
        </View>
        {top.map((d, i) => {
          const tieneGps = d.metricas.kms > 0 || d.metricas.horas_conduccion > 0 || tieneGpsConfigurado(d.vehiculo.gps_compañia);
          return (
            <View key={d.vehiculo.id} style={[base.tableRow, i % 2 ? base.tableRowAlt : {}]} wrap={false}>
              <Text style={[base.tableCell, { flex: vehiculoTableFlex(0) }]}>{i + 1}</Text>
              <Text style={[base.tableCell, { flex: vehiculoTableFlex(1), fontWeight: 700 }]}>{d.vehiculo.placa}</Text>
              <Text style={[base.tableCell, { flex: vehiculoTableFlex(2) }]}>{tieneGps ? 'Si' : 'No'}</Text>
              <Text style={[base.tableCell, { flex: vehiculoTableFlex(3) }]}>{n(d.metricas.kms || 0, 1)}</Text>
              <Text style={[base.tableCell, { flex: vehiculoTableFlex(4) }]}>{n(d.metricas.horas_conduccion || 0, 0)}</Text>
              <Text style={[base.tableCell, { flex: vehiculoTableFlex(5) }]}>{n(d.metricas.excesos_80_kph || 0)}</Text>
              <Text style={[base.tableCell, { flex: vehiculoTableFlex(6) }]}>{n(d.metricas.maxima_vel_80_kph || 0, 0)}</Text>
              <Text style={[base.tableCell, { flex: vehiculoTableFlex(7) }]}>{n(excesosVarios(d.metricas) || 0)}</Text>
              <Text style={[base.tableCell, { flex: vehiculoTableFlex(8) }]}>{n(d.metricas.frenadas || 0)}</Text>
              <Text style={[base.tableCell, { flex: vehiculoTableFlex(9) }]}>{n(d.metricas.aceleraciones || 0)}</Text>
              <Text style={[base.tableCell, { flex: vehiculoTableFlex(10) }]}>{n(d.ralenti.ralentis_excesivos || 0)}</Text>
              <Text style={[base.tableCell, { flex: vehiculoTableFlex(11) }]}>{n(d.ralenti.horas_motor_ralenti || 0, 0)}</Text>
            </View>
          );
        })}

        <AccionesYFirmas
          tipoEntidad="vehiculos"
          metricas={m}
          totalVehiculosOperacion={resumen.totalVehiculos}
          vehiculosConGps={resumen.vehiculosConGps}
          entidadesExceso80={entidadesExceso80}
          entidadesFrenadas={entidadesFrenadas}
          entidadesAceleraciones={entidadesAceleraciones}
        />
      </Page>
      {resumen.totalVehiculos > 10 && datos.length > 10 && (
      <Page size="LETTER" orientation="portrait" style={[base.page, { padding: 18, paddingBottom: 54 }]}>
        <ReportHeader title="FORMATO LOCAL PARA INFORME GESTION MENSUAL COMPORTAMIENTO FLOTA VEHICULAR (GPS)" />
        <ReportFooter />
        <View style={base.tableHeader}>
          {[
            '#', 'Placa', 'Dispositivo GPS', 'KM Recorridos', 'Horas Conducción',
            '# Excesos 80 Km/h', 'Máxima Vel. 80 Km/h',
            '# Exceso Velocidad Maxima (varios parametros 20,30,40,50,60,70)',
            '# Frenadas bruscas', '# Sobre Aceleraciones', '# Ralenti', 'Horas Ralenti'
          ].map((h, i) => (
            <Text key={h} style={[base.tableHeaderCell, { flex: vehiculoTableFlex(i) }]}>{h}</Text>
          ))}
        </View>
        {datos.map((d, i) => {
          const tieneGps = d.metricas.kms > 0 || d.metricas.horas_conduccion > 0 || tieneGpsConfigurado(d.vehiculo.gps_compañia);
          return (
            <View key={d.vehiculo.id} style={[base.tableRow, i % 2 ? base.tableRowAlt : {}]} wrap={false}>
              <Text style={[base.tableCell, { flex: vehiculoTableFlex(0) }]}>{i + 1}</Text>
              <Text style={[base.tableCell, { flex: vehiculoTableFlex(1), fontWeight: 700 }]}>{d.vehiculo.placa}</Text>
              <Text style={[base.tableCell, { flex: vehiculoTableFlex(2) }]}>{tieneGps ? 'Si' : 'No'}</Text>
              <Text style={[base.tableCell, { flex: vehiculoTableFlex(3) }]}>{n(d.metricas.kms || 0, 1)}</Text>
              <Text style={[base.tableCell, { flex: vehiculoTableFlex(4) }]}>{n(d.metricas.horas_conduccion || 0, 0)}</Text>
              <Text style={[base.tableCell, { flex: vehiculoTableFlex(5) }]}>{n(d.metricas.excesos_80_kph || 0)}</Text>
              <Text style={[base.tableCell, { flex: vehiculoTableFlex(6) }]}>{n(d.metricas.maxima_vel_80_kph || 0, 0)}</Text>
              <Text style={[base.tableCell, { flex: vehiculoTableFlex(7) }]}>{n(excesosVarios(d.metricas) || 0)}</Text>
              <Text style={[base.tableCell, { flex: vehiculoTableFlex(8) }]}>{n(d.metricas.frenadas || 0)}</Text>
              <Text style={[base.tableCell, { flex: vehiculoTableFlex(9) }]}>{n(d.metricas.aceleraciones || 0)}</Text>
              <Text style={[base.tableCell, { flex: vehiculoTableFlex(10) }]}>{n(d.ralenti.ralentis_excesivos || 0)}</Text>
              <Text style={[base.tableCell, { flex: vehiculoTableFlex(11) }]}>{n(d.ralenti.horas_motor_ralenti || 0, 0)}</Text>
            </View>
          );
        })}
      </Page>
      )}
    </Document>
  );
}

function AlertSummaryCard({ label, value, accent = COLORS.azul }: { label: string; value: string; accent?: string }) {
  return (
    <View style={{ flex: 1, borderWidth: 0.4, borderColor: COLORS.sombra, padding: 5, borderLeftWidth: 3, borderLeftColor: accent }}>
      <Text style={{ fontSize: 12, fontWeight: 700, color: accent, textAlign: 'center' }}>{value}</Text>
      <Text style={{ fontSize: 5.5, color: COLORS.gris, textAlign: 'center', marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function ExecutiveMetricRow({ label, value, detail, accent = COLORS.negro, alt = false }: { label: string; value: string; detail?: string; accent?: string; alt?: boolean }) {
  return (
    <View style={[base.tableRow, alt ? base.tableRowAlt : {}, { paddingVertical: 3 }]} wrap={false}>
      <Text style={[base.tableCell, { flex: 1.8, textAlign: 'left', fontWeight: 700 }]}>{label}</Text>
      <Text style={[base.tableCell, { flex: 0.55, color: accent, fontWeight: 700, fontSize: 7 }]}>{value}</Text>
      <Text style={[base.tableCell, { flex: 2.25, textAlign: 'left', color: COLORS.gris }]}>{detail || ''}</Text>
    </View>
  );
}

function TiposVehiculoAlertasTable({ rows }: { rows: ReporteAlertasDiariasData['resumen']['tiposVehiculo'] }) {
  const visibles = rows.filter(r => r.totalVehiculos > 0 || r.totalAlertas > 0);
  return (
    <View style={{ marginBottom: 5 }}>
      <Band>Vehiculos activos y alertas por tipo de vehiculo</Band>
      <View style={base.tableHeader}>
        {[
          ['TIPO', 1.55],
          ['ACTIVOS BD', 0.62],
          ['VEH. ALERTA', 0.62],
          ['%', 0.45],
          ['>80', 0.42],
          ['50-80', 0.46],
          ['10-40', 0.46],
          ['FREN.', 0.46],
        ].map(([h, flex]) => (
          <Text key={String(h)} style={[base.tableHeaderCell, { flex: Number(flex) }]}>{h}</Text>
        ))}
      </View>
      {visibles.length === 0 ? (
        <View style={base.tableRow}>
          <Text style={[base.tableCell, { flex: 5, textAlign: 'center' }]}>No hay informacion de tipos de vehiculo para el periodo</Text>
        </View>
      ) : visibles.slice(0, 16).map((r, i) => (
        <View key={`${r.tipo}-${i}`} style={[base.tableRow, i % 2 ? base.tableRowAlt : {}]} wrap={false}>
          <Text style={[base.tableCell, { flex: 1.55, textAlign: 'left', fontWeight: 700 }]}>{mayuscula(r.tipo)}</Text>
          <Text style={[base.tableCell, { flex: 0.62 }]}>{n(r.totalVehiculos)}</Text>
          <Text style={[base.tableCell, { flex: 0.62, color: r.vehiculosConAlertas > 0 ? COLORS.rojo : COLORS.verde, fontWeight: 700 }]}>{n(r.vehiculosConAlertas)}</Text>
          <Text style={[base.tableCell, { flex: 0.45 }]}>{n(r.porcentajeConAlertas, 1)}%</Text>
          <Text style={[base.tableCell, { flex: 0.42, color: r.infracciones80 > 0 ? COLORS.rojo : COLORS.negro }]}>{n(r.infracciones80)}</Text>
          <Text style={[base.tableCell, { flex: 0.46 }]}>{n(r.excesos50a80)}</Text>
          <Text style={[base.tableCell, { flex: 0.46 }]}>{n(r.excesosVarios)}</Text>
          <Text style={[base.tableCell, { flex: 0.46 }]}>{n(r.frenadas)}</Text>
        </View>
      ))}
    </View>
  );
}

function AlertasTable({
  title,
  rows,
  countLabel,
}: {
  title: string;
  rows: ReturnType<typeof agruparAlertas>;
  countLabel: string;
}) {
  return (
    <View style={{ marginTop: 5 }}>
      <Band>{title}</Band>
      <View style={base.tableHeader}>
        {['PLACA', 'CONDUCTOR', countLabel, 'TIPO DE VEHICULO'].map((h, i) => (
          <Text key={h} style={[base.tableHeaderCell, { flex: i === 1 ? 2.3 : i === 2 ? 0.8 : 1 }]}>{h}</Text>
        ))}
      </View>
      {rows.length === 0 ? (
        <View style={base.tableRow}>
          <Text style={[base.tableCell, { flex: 5.1, textAlign: 'center' }]}>No se registran alertas para esta categoria</Text>
        </View>
      ) : rows.slice(0, 12).map((r, i) => (
        <View key={`${title}-${r.placa}-${i}`} style={[base.tableRow, i % 2 ? base.tableRowAlt : {}]} wrap={false}>
          <Text style={[base.tableCell, { flex: 1, fontWeight: 700 }]}>{r.placa}</Text>
          <Text style={[base.tableCell, { flex: 2.3, textAlign: 'left' }]}>{r.conductor}</Text>
          <Text style={[base.tableCell, { flex: 0.8, color: r.total > 0 ? COLORS.rojo : COLORS.negro, fontWeight: 700 }]}>{n(r.total)}</Text>
          <Text style={[base.tableCell, { flex: 1 }]}>{r.tipo}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Análisis narrativo automático ────────────────────────────────────────────

function generarAnalisis(data: ReporteAlertasDiariasData, rows80: ReturnType<typeof agruparAlertas>, rows50a80: ReturnType<typeof agruparAlertas>, rowsFrenadas: ReturnType<typeof agruparAlertas>) {
  const { alertas, resumen, contrato, periodoInicio, periodoFin, fechaReporte } = data;
  const contratoNombre = contrato?.nombre || alertas[0]?.contrato_nombre || 'el contrato';
  const mismaFecha = periodoInicio === periodoFin;
  const periodo = mismaFecha ? `el ${fmt(periodoInicio)}` : `el periodo del ${fmt(periodoInicio)} al ${fmt(periodoFin)}`;

  // Construir ranking global por impacto (80km/h pesa x3, frenadas x2)
  const ranking = new Map<string, { placa: string; conductor: string; tipo: string; t80: number; t50: number; tVar: number; tFren: number }>();
  for (const a of alertas) {
    const key = `${a.placa}|${(a.conductor || 'NO REGISTRA').toUpperCase()}`;
    const cur = ranking.get(key) ?? { placa: a.placa, conductor: (a.conductor || 'NO REGISTRA').toUpperCase(), tipo: a.tipo_activo || '', t80: 0, t50: 0, tVar: 0, tFren: 0 };
    cur.t80 += a.infraccion_80_kmh || 0;
    cur.t50 += a.excesos_50_80_kmh || 0;
    cur.tVar += a.excesos_varios_parametros || 0;
    cur.tFren += a.frenadas_bruscas || 0;
    ranking.set(key, cur);
  }
  const top = Array.from(ranking.values())
    .sort((a, b) => (b.t80 * 3 + b.t50 + b.tVar * 0.5 + b.tFren * 2) - (a.t80 * 3 + a.t50 + a.tVar * 0.5 + a.tFren * 2))
    .slice(0, 5)
    .filter(r => r.t80 + r.t50 + r.tVar + r.tFren > 0);

  // Texto de resumen
  const totalAlertas = resumen.infracciones80 + resumen.excesos50a80 + resumen.excesosVarios + resumen.frenadas;
  const partesFecha = mismaFecha
    ? `con fecha de reporte ${fmt(fechaReporte)}`
    : `con fecha de reporte ${fmt(fechaReporte)}`;
  const resumenTexto = `Se ha realizado el analisis de comportamiento vial correspondiente a ${periodo} para el contrato ${contratoNombre}, ${partesFecha}. La base activa registra ${n(resumen.vehiculosActivosBase)} vehiculos y ${n(resumen.personasAutorizadas)} conductores autorizados. En el periodo se identificaron ${n(totalAlertas)} alertas en ${n(resumen.vehiculosConAlertas)} vehiculos.`;

  // Positivos destacables
  const positivos: string[] = [];
  if (resumen.infracciones80 === 0) positivos.push('No se presentaron infracciones superiores a 80 km/h.');
  if (resumen.frenadas === 0) positivos.push('No se registraron frenadas bruscas en el periodo.');

  // Casos de mayor incidencia (texto por vehículo)
  const incidencias = top.map(r => {
    const eventos: string[] = [];
    if (r.t80 > 0) eventos.push(`${n(r.t80)} infraccion(es) >= 80 km/h`);
    if (r.t50 > 0) eventos.push(`${n(r.t50)} exceso(s) entre 50 y 80 km/h`);
    if (r.tVar > 0) eventos.push(`${n(r.tVar)} exceso(s) varios parametros`);
    if (r.tFren > 0) eventos.push(`${n(r.tFren)} frenada(s) brusca(s)`);
    const esCritico = r.t80 > 0 || r.tFren > 2;
    return { texto: `${r.placa} — ${r.conductor}: ${eventos.join(', ')}.`, critico: esCritico };
  });

  // Trazabilidad iButton
  const sinIdTexto = resumen.personasSinIdentificar > 0
    ? `Se registran ${n(resumen.alertasSinConductorIdentificado)} alerta(s) sin conductor plenamente identificado, equivalentes a ${n(resumen.personasSinIdentificar)} situacion(es) operativas vehiculo-dia; se recomienda reforzar el uso obligatorio del iButton.`
    : `El nivel de trazabilidad de conductores es adecuado; todos los eventos registran identificacion.`;
  const trazabilidadTexto = `De las ${n(resumen.personasAutorizadas)} personas autorizadas, se identificaron alertas en ${n(resumen.personasIdentificadas)} conductores mediante llave iButton. ${sinIdTexto}`;

  // Recomendaciones
  const recomendaciones: string[] = [];
  if (resumen.infracciones80 > 0 && rows80[0]) {
    recomendaciones.push(`Gestionar prioritariamente el vehiculo ${rows80[0].placa} (${rows80[0].conductor}) por infracciones superiores a 80 km/h; aplicar protocolo de retroalimentacion individual.`);
  }
  if (resumen.excesos50a80 > 0 && rows50a80[0]) {
    const top50 = rows50a80[0];
    recomendaciones.push(`Realizar seguimiento preventivo al vehiculo ${top50.placa} (${top50.conductor}) por recurrencia en excesos de velocidad entre 50 y 80 km/h.`);
  }
  if (resumen.frenadas > 0 && rowsFrenadas[0]) {
    recomendaciones.push(`Analizar las frenadas bruscas del vehiculo ${rowsFrenadas[0].placa} para identificar patrones de conduccion reactiva.`);
  }
  if (resumen.personasSinIdentificar > 0) {
    recomendaciones.push(`Reforzar el uso obligatorio de la llave iButton en los vehiculos con eventos sin identificacion de conductor.`);
  }
  if (recomendaciones.length === 0) {
    recomendaciones.push('Mantener las practicas actuales de conduccion segura. El periodo no registra alertas de alta severidad.');
  }

  return { resumenTexto, positivos, incidencias, trazabilidadTexto, recomendaciones };
}

export function InformeAlertasDiariasPDF({ data }: { data: ReporteAlertasDiariasData }) {
  const { alertas, resumen, contrato, periodoInicio, periodoFin, fechaReporte } = data;
  const rows80 = agruparAlertas(alertas, 'infraccion_80_kmh');
  const rowsVarios = agruparAlertas(alertas, 'excesos_varios_parametros');
  const rows50a80 = agruparAlertas(alertas, 'excesos_50_80_kmh');
  const rowsFrenadas = agruparAlertas(alertas, 'frenadas_bruscas');
  const analisis = generarAnalisis(data, rows80, rows50a80, rowsFrenadas);
  const vehiculosSinAlertas = Math.max(0, resumen.vehiculosActivosBase - resumen.vehiculosConAlertas);
  const porcentajeVehiculosConAlertas = resumen.vehiculosActivosBase > 0
    ? (resumen.vehiculosConAlertas / resumen.vehiculosActivosBase) * 100
    : 0;
  const porcentajeConductoresIdentificados = resumen.personasAutorizadas > 0
    ? (resumen.personasIdentificadas / resumen.personasAutorizadas) * 100
    : 0;

  return (
    <Document title={`Informe diario alertas GPS - ${periodoInicio}`}>
      {/* Una sola Page — react-pdf crea hojas adicionales automáticamente si el contenido desborda */}
      <Page size="LETTER" orientation="portrait" style={[base.page, { padding: 22, paddingBottom: 52 }]}>
        <ReportHeaderDiario title="Informe Diario de Comportamiento Vial — Torre de Control" />
        <ReportFooterDiario />

        {/* Info general */}
        <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: COLORS.azul, paddingTop: 4, marginBottom: 5 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 6, fontWeight: 700 }}>Fecha de Reporte: {fmt(fechaReporte)}</Text>
            <Text style={{ fontSize: 6, fontWeight: 700 }}>Periodo: {fmt(periodoInicio)} - {fmt(periodoFin)}</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 6, fontWeight: 700 }}>Contrato: {contrato?.nombre || alertas[0]?.contrato_nombre || 'Todos'}</Text>
          </View>
        </View>

        {/* Resumen ejecutivo inicial */}
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 5 }}>
          <View style={{ flex: 1 }}>
            <Band>Resumen ejecutivo - flota activa</Band>
            <ExecutiveMetricRow
              label="Vehiculos activos en BD"
              value={n(resumen.vehiculosActivosBase)}
              detail="Base maestra sincronizada desde Google Sheets"
            />
            <ExecutiveMetricRow
              label="Vehiculos con alertas"
              value={n(resumen.vehiculosConAlertas)}
              detail={`${n(porcentajeVehiculosConAlertas, 1)}% de la flota activa`}
              accent={resumen.vehiculosConAlertas > 0 ? COLORS.rojo : COLORS.verde}
              alt
            />
            <ExecutiveMetricRow
              label="Vehiculos sin alertas"
              value={n(vehiculosSinAlertas)}
              detail="Activos sin eventos reportables en el periodo"
              accent={COLORS.verde}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Band>Trazabilidad de conductores</Band>
            <ExecutiveMetricRow
              label="Conductores activos BD"
              value={n(resumen.personasAutorizadas)}
              detail="Personas autorizadas en base maestra"
            />
            <ExecutiveMetricRow
              label="Con alertas identificadas"
              value={n(resumen.personasIdentificadas)}
              detail={`${n(porcentajeConductoresIdentificados, 1)}% de conductores activos`}
              accent={COLORS.verde}
              alt
            />
            <ExecutiveMetricRow
              label="Alertas sin identificar"
              value={n(resumen.alertasSinConductorIdentificado)}
              detail={`${n(resumen.personasSinIdentificar)} situacion(es) vehiculo-dia sin iButton`}
              accent={resumen.alertasSinConductorIdentificado > 0 ? COLORS.amarillo : COLORS.verde}
            />
          </View>
        </View>

        {/* Tarjetas de alertas en orden de prioridad */}
        <View style={{ flexDirection: 'row', gap: 5, marginBottom: 5 }}>
          <AlertSummaryCard label="Infraccion >= 80 km/h" value={n(resumen.infracciones80)} accent={COLORS.rojo} />
          <AlertSummaryCard label="Excesos 50-80 km/h" value={n(resumen.excesos50a80)} accent={COLORS.amarillo} />
          <AlertSummaryCard label="Excesos 10/20/30/40 km/h" value={n(resumen.excesosVarios)} accent="#ef4444" />
          <AlertSummaryCard label="Frenadas bruscas" value={n(resumen.frenadas)} accent="#f97316" />
        </View>

        <TiposVehiculoAlertasTable rows={resumen.tiposVehiculo} />

        {/* Resumen de tipos + gráfico */}
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 5 }}>
          <View style={{ flex: 1 }}>
            <Band>Distribucion de Alertas por Tipo</Band>
            {[
              ['Infraccion >= 80 km/h', resumen.infracciones80],
              ['Excesos 50-80 km/h', resumen.excesos50a80],
              ['Excesos varios (10/20/30/40 km/h)', resumen.excesosVarios],
              ['Frenadas Bruscas', resumen.frenadas],
            ].map(([label, value], i) => (
              <View key={String(label)} style={[base.tableRow, i % 2 ? base.tableRowAlt : {}]}>
                <Text style={[base.tableCell, { flex: 2.5, textAlign: 'left' }]}>{label}</Text>
                <Text style={[base.tableCell, { flex: 0.5, fontWeight: 700, color: Number(value) > 0 ? COLORS.rojo : COLORS.verde }]}>{n(Number(value))}</Text>
              </View>
            ))}
          </View>
          <MiniBarChart valores={[
            { label: '>= 80', value: resumen.infracciones80, color: '#d9d9d9' },
            { label: '50-80', value: resumen.excesos50a80, color: '#ffc000' },
            { label: '10-40', value: resumen.excesosVarios, color: '#ff3b1f' },
            { label: 'Frenadas', value: resumen.frenadas, color: '#ff7f00' },
          ]} />
        </View>

        {/* Tablas de detalle por categoría */}
        <AlertasTable title="Infracciones >= 80 km/h" rows={rows80} countLabel="N. EVENTOS" />
        <AlertasTable title="Excesos de velocidad 50 km/h hasta 80 km/h" rows={rows50a80} countLabel="N. EXCESOS" />
        <AlertasTable title="Excesos varios parametros (10, 20, 30, 40 km/h)" rows={rowsVarios} countLabel="N. EXCESOS" />
        <AlertasTable title="Frenadas Bruscas" rows={rowsFrenadas} countLabel="N. FRENADAS" />

        {/* ── ANÁLISIS NARRATIVO ── */}
        <View style={{ marginTop: 7, borderLeftWidth: 2.5, borderLeftColor: COLORS.azulClaro, paddingLeft: 6, paddingRight: 4, paddingVertical: 5, backgroundColor: '#f0f6ff' }} wrap={false}>
          <Text style={{ fontSize: 6.5, fontWeight: 700, color: COLORS.azul, marginBottom: 4 }}>ANALISIS DE COMPORTAMIENTO VIAL</Text>
          <Text style={{ fontSize: 5.6, lineHeight: 1.55, marginBottom: 5, color: COLORS.negro }}>{analisis.resumenTexto}</Text>

          {analisis.positivos.length > 0 && (
            <View style={{ marginBottom: 4 }}>
              {analisis.positivos.map((p, i) => (
                <Text key={i} style={{ fontSize: 5.5, color: COLORS.verde, lineHeight: 1.4 }}>+ {p}</Text>
              ))}
            </View>
          )}

          {analisis.incidencias.length > 0 && (
            <>
              <Text style={{ fontSize: 5.8, fontWeight: 700, color: COLORS.azul, marginBottom: 2 }}>Vehiculos y Conductores con Mayor Incidencia</Text>
              {analisis.incidencias.map((inc, i) => (
                <Text key={i} style={{ fontSize: 5.5, color: inc.critico ? COLORS.rojo : COLORS.negro, lineHeight: 1.4, marginBottom: 1 }}>• {inc.texto}</Text>
              ))}
            </>
          )}

          <Text style={{ fontSize: 5.8, fontWeight: 700, color: COLORS.azul, marginTop: 4, marginBottom: 2 }}>Trazabilidad de Conductores (iButton)</Text>
          <Text style={{ fontSize: 5.5, lineHeight: 1.55, marginBottom: 4, color: COLORS.negro }}>{analisis.trazabilidadTexto}</Text>

          <Text style={{ fontSize: 5.8, fontWeight: 700, color: COLORS.azul, marginBottom: 2 }}>Recomendaciones</Text>
          {analisis.recomendaciones.map((rec, i) => (
            <Text key={i} style={{ fontSize: 5.5, lineHeight: 1.4, marginBottom: 1, color: COLORS.negro }}>• {rec}</Text>
          ))}
        </View>

        {/* Definición de alertas — fluye a página 2 si no cabe */}
        <View style={{ marginTop: 6 }}>
          <Band>Definicion de Tipos de Alerta</Band>
          {[
            ['Infraccion >= 80 Km/h', 'Exceso de velocidad igual o superior a 80 km/h; clasificado como desviacion critica de seguridad vial.'],
            ['Exceso 50-80 Km/h', 'Exceso de velocidad desde 50 km/h y menor a 80 km/h segun el parametro de control vial vigente.'],
            ['Infraccion 10-40 Km/h', 'Exceso de velocidad en el rango configurado por parametro operativo (10, 20, 30 o 40 km/h sobre el limite de la via).'],
            ['Frenada Brusca', 'Desaceleracion repentina superior a los limites seguros; puede asociarse a maniobras de frenado fuerte o perdida de distancia de seguridad.'],
            ['Sin iButton (veh-dia)', 'Situacion operativa (vehiculo + dia) donde el conductor no fue identificado mediante llave iButton; indica ausencia de trazabilidad del conductor.'],
            ['Observaciones', 'Para el detalle completo revise la plantilla Excel cargada con los registros de GPS del periodo.'],
          ].map(([tipo, definicion], i) => (
            <View key={tipo} style={[base.tableRow, i % 2 ? base.tableRowAlt : {}]}>
              <Text style={[base.tableCell, { flex: 1.2, textAlign: 'left', fontWeight: 700 }]}>{tipo}</Text>
              <Text style={[base.tableCell, { flex: 3.2, textAlign: 'left' }]}>{definicion}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}

export async function descargarPDFConductor(data: ReporteConductorData): Promise<void> {
  const blob = await pdf(<InformeConductorPDF data={data} />).toBlob();
  downloadBlob(blob, `Informe_Conductor_${data.conductor.cedula}_${data.periodoInicio}.pdf`);
}

export async function descargarPDFVehiculo(data: ReporteVehiculoData): Promise<void> {
  const blob = await pdf(<InformeVehiculoPDF data={data} />).toBlob();
  downloadBlob(blob, `Informe_Vehiculo_${data.vehiculo.placa}_${data.periodoInicio}.pdf`);
}

// ==============================================================================
// ── DASHBOARD GERENCIAL DE ALERTAS DIARIAS ───────────────────────────────────
// ==============================================================================

function SectionTitle({ title }: { title: string }) {
  return (
    <View style={{ marginTop: 10, marginBottom: 5 }}>
      <Text style={{ fontSize: 8.5, fontWeight: 700, color: '#0d9488', letterSpacing: 0.5 }}>{title}</Text>
      <View style={{ height: 1.5, backgroundColor: '#0d9488', marginTop: 2, width: '100%' }} />
    </View>
  );
}

function DashboardKpiCard({
  value,
  label,
  accentColor,
  icon,
}: {
  value: string | number;
  label: string;
  accentColor: string;
  icon?: string;
}) {
  return (
    <View style={{
      flex: 1,
      backgroundColor: '#f8fafc',
      borderWidth: 0.4,
      borderColor: '#cbd5e1',
      borderTopWidth: 2.5,
      borderTopColor: accentColor,
      paddingVertical: 6,
      paddingHorizontal: 3,
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 13, fontWeight: 700, color: accentColor }}>{value}</Text>
        {icon ? (
          <Text style={{ fontSize: 8, fontWeight: 700, color: accentColor, marginLeft: 2 }}>{icon}</Text>
        ) : null}
      </View>
      <Text style={{ fontSize: 5.6, color: '#64748b', textAlign: 'center', marginTop: 3 }}>{label}</Text>
    </View>
  );
}

function AlertProgressBar({ val, maxVal, color }: { val: number; maxVal: number; color: string }) {
  const percentage = maxVal > 0 ? (val / maxVal) * 100 : 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 2 }}>
      <View style={{ width: 5, height: 5, backgroundColor: color, marginRight: 5, borderRadius: 1 }} />
      <View style={{ width: 130, height: 6, backgroundColor: '#e2e8f0', borderRadius: 1.5, position: 'relative' }}>
        {percentage > 0 ? (
          <View style={{ width: `${percentage}%`, height: '100%', backgroundColor: color, borderRadius: 1.5 }} />
        ) : null}
      </View>
    </View>
  );
}

function NivelPesvBadge({ nivel }: { nivel: 'CRÍTICO' | 'OBSERV.' | 'BAJO' }) {
  let bgColor = '#dc2626';
  let textColor = '#ffffff';
  let dotColor = '#fca5a5';
  if (nivel === 'OBSERV.') {
    bgColor = '#eab308';
    textColor = '#0f172a';
    dotColor = '#fef08a';
  } else if (nivel === 'BAJO') {
    bgColor = '#16a34a';
    textColor = '#ffffff';
    dotColor = '#86efac';
  }
  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: bgColor,
      borderRadius: 4,
      paddingVertical: 1.5,
      paddingHorizontal: 4,
      width: 48,
      alignSelf: 'center'
    }}>
      <View style={{ width: 3.5, height: 3.5, borderRadius: 1.8, backgroundColor: dotColor, marginRight: 3 }} />
      <Text style={{ fontSize: 5.2, fontWeight: 700, color: textColor }}>{nivel}</Text>
    </View>
  );
}

function PrioridadOrb({ color }: { color: string }) {
  return (
    <View style={{
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: color,
      alignSelf: 'center',
      borderWidth: 0.5,
      borderColor: '#cbd5e1'
    }} />
  );
}

export function InformeGerencialAlertasDiariasPDF({ data }: { data: ReporteAlertasDiariasData }) {
  const { alertas, resumen, contrato, periodoInicio, periodoFin, fechaReporte } = data;

  const totalVehiculosConAlertas = resumen.vehiculosConAlertas;
  const activeVehicles = resumen.vehiculosActivosBase;
  const porcentajeVehiculosConAlertas = activeVehicles > 0
    ? (totalVehiculosConAlertas / activeVehicles) * 100
    : 0;
  const porcentajeSinAlertas = 100 - porcentajeVehiculosConAlertas;
  const dias = (periodoInicio && periodoFin)
    ? Math.ceil((new Date(periodoFin).getTime() - new Date(periodoInicio).getTime()) / (1000 * 60 * 60 * 24)) + 1
    : 1;

  // Clasificación del nivel de riesgo general de la flota
  let riskLevel: 'CRÍTICO' | 'EN OBSERVACIÓN' | 'BUENO' = 'BUENO';
  let riskColor = '#16a34a'; // Verde
  let riskDotColor = '#86efac';
  let riskBg = '#dcfce7';

  if (resumen.infracciones80 > 0) {
    riskLevel = 'CRÍTICO';
    riskColor = '#dc2626'; // Rojo
    riskDotColor = '#fca5a5';
    riskBg = '#fee2e2';
  } else if (resumen.excesos50a80 > 0 || resumen.frenadas > 0 || resumen.alertasSinConductorIdentificado > 0) {
    riskLevel = 'EN OBSERVACIÓN';
    riskColor = '#d97706'; // Ámbar/Amarillo
    riskDotColor = '#fef08a';
    riskBg = '#fef3c7';
  }

  // Agrupación y clasificación para ranking de conductores
  const rankingMap = new Map<string, { placa: string; conductor: string; infracciones80: number; excesos50a80: number; excesosVarios: number; frenadas: number; total: number }>();
  for (const a of alertas) {
    const condName = a.conductor || 'SIN IDENTIFICAR';
    const key = `${a.placa}|${condName}`;
    const current = rankingMap.get(key) ?? {
      placa: a.placa,
      conductor: condName,
      infracciones80: 0,
      excesos50a80: 0,
      excesosVarios: 0,
      frenadas: 0,
      total: 0,
    };
    current.infracciones80 += Number(a.infraccion_80_kmh ?? 0);
    current.excesos50a80 += Number(a.excesos_50_80_kmh ?? 0);
    current.excesosVarios += Number(a.excesos_varios_parametros ?? 0);
    current.frenadas += Number(a.frenadas_bruscas ?? 0);
    current.total += Number(a.infraccion_80_kmh ?? 0) + Number(a.excesos_50_80_kmh ?? 0) + Number(a.excesos_varios_parametros ?? 0) + Number(a.frenadas_bruscas ?? 0);
    rankingMap.set(key, current);
  }

  const rankingSorted = Array.from(rankingMap.values())
    .filter(r => r.total > 0)
    .sort((a, b) => b.total - a.total || a.placa.localeCompare(b.placa));

  const topOffenders = rankingSorted.slice(0, 4);
  const groupedOffenders = rankingSorted.slice(4);

  // Recolectar datos para Plan de Acción
  const placasSinIbuttonSet = new Set<string>();
  const conductoresObservSet = new Set<string>();
  const placasBrakingSet = new Set<string>();

  for (const a of alertas) {
    const cond = a.conductor || '';
    const isSinIbutton = !a.conductor_identificado || cond.toUpperCase().includes('SIN IDENTIFICAR') || cond.toUpperCase().includes('NO REGISTRA');
    if (isSinIbutton) {
      placasSinIbuttonSet.add(a.placa);
    } else {
      if (Number(a.infraccion_80_kmh ?? 0) > 0 || Number(a.excesos_50_80_kmh ?? 0) > 0 || Number(a.frenadas_bruscas ?? 0) > 0) {
        conductoresObservSet.add(mayuscula(cond));
      }
    }
    if (Number(a.frenadas_bruscas ?? 0) > 0) {
      placasBrakingSet.add(a.placa);
    }
  }

  const placasSinIbutton = Array.from(placasSinIbuttonSet);
  const conductoresObserv = Array.from(conductoresObservSet).slice(0, 4);
  const placasBraking = Array.from(placasBrakingSet).slice(0, 4);
  const vehiculosSinAlertas = Math.max(0, activeVehicles - totalVehiculosConAlertas);

  // Generar correctivos dinámicos
  const correctivos = [];
  if (rankingSorted.length === 0) {
    correctivos.push({
      accion: `Felicitar formalmente a los ${activeVehicles} vehículos y conductores activos por operar con 100% de cumplimiento y CERO alertas viales en el periodo.`,
      responsable: "Gerencia / HSEQ",
      plazo: "15 días",
      plazoColor: "#16a34a",
      refPesv: "Paso 24",
      priorColor: "#16a34a",
    });
  } else {
    if (placasSinIbutton.length > 0) {
      correctivos.push({
        accion: `Bloquear circulación de vehículos con iButton inactivo: ${placasSinIbutton.slice(0, 4).join(', ')}${placasSinIbutton.length > 4 ? '...' : ''}. Descargo formal al conductor.`,
        responsable: "Coord. HSEQ / Operaciones",
        plazo: "48 h",
        plazoColor: "#dc2626",
        refPesv: "Paso 10 / 15",
        priorColor: "#dc2626",
      });
      correctivos.push({
        accion: "Aplicar política 'Cero circulación sin iButton': ningún vehículo sale a ruta sin registro activo en Torre de Control.",
        responsable: "Gerencia Operaciones",
        plazo: "48 h",
        plazoColor: "#dc2626",
        refPesv: "Paso 8 / 15",
        priorColor: "#dc2626",
      });
    }

    const speeders80 = rankingSorted.filter(r => r.infracciones80 > 0);
    if (speeders80.length > 0) {
      const placas80 = speeders80.map(s => s.placa);
      correctivos.push({
        accion: `Bloquear circulación de vehículos con infracciones >= 80 km/h: ${placas80.slice(0, 3).join(', ')}. Citación formal a comité extraordinario.`,
        responsable: "Coord. HSEQ / Operaciones",
        plazo: "48 h",
        plazoColor: "#dc2626",
        refPesv: "Paso 15 / 16",
        priorColor: "#dc2626",
      });
    }

    if (conductoresObserv.length > 0) {
      correctivos.push({
        accion: `Retroalimentación individual y firma de actas de compromiso vial con conductores: ${conductoresObserv.join(', ')}.`,
        responsable: "Líder PESV / HSEQ",
        plazo: "7 días",
        plazoColor: "#d97706",
        refPesv: "Paso 10",
        priorColor: "#d97706",
      });
    }

    if (placasBraking.length > 0) {
      correctivos.push({
        accion: `Inspección preventiva y revisión de sistema de frenos y amortiguación en vehículos con maniobras bruscas: ${placasBraking.join(', ')}.`,
        responsable: "Jefe Mantenimiento",
        plazo: "10 días",
        plazoColor: "#d97706",
        refPesv: "Paso 17",
        priorColor: "#d97706",
      });
    }

    correctivos.push({
      accion: `Reconocimiento formal a los ${vehiculosSinAlertas} vehículos sin alertas. Activar incentivo económico/operativo de conducción segura.`,
      responsable: "Gerencia / RRHH",
      plazo: "15 días",
      plazoColor: "#16a34a",
      refPesv: "Paso 24",
      priorColor: "#16a34a",
    });
  }

  const maxVal = Math.max(resumen.infracciones80, resumen.excesos50a80, resumen.excesosVarios, resumen.frenadas, resumen.alertasSinConductorIdentificado, 1);

  return (
    <Document title={`Dashboard de Comportamiento Vial - ${periodoInicio}`}>
      {/* PÁGINA 1: Diagnóstico de Comportamiento Vial */}
      <Page size="LETTER" orientation="portrait" style={[base.page, { padding: 22, paddingBottom: 42 }]}>
        <ReportHeaderDiario title="DASHBOARD DE COMPORTAMIENTO VIAL" />
        <ReportFooterDiario />

        {/* Fila de Metadatos */}
        <View style={{ flexDirection: 'row', borderTopWidth: 1.5, borderTopColor: '#0d9488', paddingTop: 4, marginBottom: 6 }}>
          <View style={{ flex: 1.2 }}>
            <Text style={{ fontSize: 6.8, fontWeight: 700 }}>Contrato: {contrato?.nombre || 'Todos los contratos'}</Text>
            <Text style={{ fontSize: 5.8, color: '#64748b', marginTop: 1 }}>Token ID: COL-0038 v2   |   Clasificación: Confidencial</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 6.8, fontWeight: 700 }}>Periodo: {fmt(periodoInicio)} - {fmt(periodoFin)}</Text>
            <Text style={{ fontSize: 5.8, color: '#64748b', marginTop: 1 }}>Fecha Generación: {fmt(fechaReporte)}</Text>
          </View>
        </View>

        {/* ESTADO GENERAL DE LA FLOTA */}
        <SectionTitle title="ESTADO GENERAL DE LA FLOTA" />
        <View style={{
          flexDirection: 'row',
          borderWidth: 1.2,
          borderColor: riskColor,
          borderRadius: 4,
          backgroundColor: riskBg,
          minHeight: 46,
          marginBottom: 4
        }}>
          {/* Lado Izquierdo: Orbe */}
          <View style={{
            width: '25%',
            alignItems: 'center',
            justifyContent: 'center',
            borderRightWidth: 0.5,
            borderRightColor: '#cbd5e1',
            padding: 6
          }}>
            <View style={{
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: riskColor,
              borderWidth: 1.2,
              borderColor: riskDotColor,
              marginBottom: 3
            }} />
            <Text style={{ fontSize: 6.5, fontWeight: 700, color: riskColor, textAlign: 'center' }}>
              {riskLevel}
            </Text>
          </View>

          {/* Lado Derecho: Narrativo */}
          <View style={{
            width: '75%',
            padding: '6 8',
            justifyContent: 'center'
          }}>
            <Text style={{ fontSize: 7.2, fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>
              {resumen.totalAlertas} alertas en {resumen.vehiculosConAlertas} vehículos ({n(porcentajeVehiculosConAlertas, 1)}% flota) — período {dias} días.
            </Text>
            
            {resumen.infracciones80 > 0 ? (
              <Text style={{ fontSize: 6.2, lineHeight: 1.35, color: '#334155', marginBottom: 2 }}>
                <Text style={{ fontWeight: 700, color: '#dc2626' }}>Riesgo crítico: </Text>
                Excesos de velocidad mayores o iguales a 80 km/h detectados. Incumplimiento grave de la política de velocidad y el Paso 15 del PESV.
              </Text>
            ) : resumen.alertasSinConductorIdentificado > 0 ? (
              <Text style={{ fontSize: 6.2, lineHeight: 1.35, color: '#334155', marginBottom: 2 }}>
                <Text style={{ fontWeight: 700, color: '#dc2626' }}>Riesgo crítico: </Text>
                {resumen.alertasSinConductorIdentificado} alertas sin conductor identificado (iButton inactivo). Incumplimiento del registro PESV Paso 15.
              </Text>
            ) : resumen.frenadas > 0 ? (
              <Text style={{ fontSize: 6.2, lineHeight: 1.35, color: '#334155', marginBottom: 2 }}>
                <Text style={{ fontWeight: 700, color: '#d97706' }}>Riesgo moderado: </Text>
                {resumen.frenadas} maniobra(s) brusca(s) detectada(s). Requiere retroalimentación preventiva de hábitos de conducción.
              </Text>
            ) : (
              <Text style={{ fontSize: 6.2, lineHeight: 1.35, color: '#334155', marginBottom: 2 }}>
                <Text style={{ fontWeight: 700, color: '#16a34a' }}>Riesgo bajo: </Text>
                Flota operando bajo parámetros ideales de conducción segura. Cero desviaciones críticas reportadas.
              </Text>
            )}

            <Text style={{ fontSize: 6.2, color: '#16a34a', fontWeight: 700 }}>
              ✓ 0 infracciones &gt;= 80 km/h. {n(porcentajeSinAlertas, 1)}% de la flota opera sin alertas.
            </Text>
          </View>
        </View>

        {/* INDICADORES CLAVE — PERIODO */}
        <SectionTitle title="INDICADORES CLAVE — PERIODO" />
        <View style={{ flexDirection: 'row', gap: 4, marginBottom: 4 }}>
          <DashboardKpiCard value={resumen.vehiculosActivosBase} label="Vehículos activos" accentColor="#1e3a8a" />
          <DashboardKpiCard value={resumen.personasAutorizadas} label="Conductores autorizados" accentColor="#1e3a8a" />
          <DashboardKpiCard
            value={`${n(porcentajeVehiculosConAlertas, 1)}%`}
            label="Flota con alertas"
            accentColor={porcentajeVehiculosConAlertas > 15 ? '#d97706' : '#16a34a'}
          />
          <DashboardKpiCard
            value={resumen.totalAlertas}
            label="Total alertas"
            accentColor={resumen.totalAlertas > 20 ? '#d97706' : '#1e3a8a'}
          />
          <DashboardKpiCard
            value={resumen.alertasSinConductorIdentificado}
            label="Sin iButton"
            accentColor={resumen.alertasSinConductorIdentificado > 0 ? '#dc2626' : '#64748b'}
            icon={resumen.alertasSinConductorIdentificado > 0 ? '▲' : ''}
          />
          <DashboardKpiCard
            value={resumen.infracciones80}
            label="Infracc. >= 80 km/h"
            accentColor={resumen.infracciones80 > 0 ? '#dc2626' : '#16a34a'}
            icon={resumen.infracciones80 === 0 ? '✓' : ''}
          />
        </View>

        {/* DISTRIBUCIÓN DE ALERTAS POR TIPO */}
        <SectionTitle title="DISTRIBUCION DE ALERTAS POR TIPO" />
        <View style={{ marginBottom: 4 }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', backgroundColor: '#0f3a60', paddingVertical: 4, paddingHorizontal: 6, alignItems: 'center' }}>
            <Text style={{ fontSize: 6.8, fontWeight: 700, color: '#ffffff', flex: 2.2 }}>Tipo de alerta</Text>
            <Text style={{ fontSize: 6.8, fontWeight: 700, color: '#ffffff', flex: 2.8 }}>Distribución visual (max = {maxVal})</Text>
            <Text style={{ fontSize: 6.8, fontWeight: 700, color: '#ffffff', flex: 0.5, textAlign: 'center' }}>N°</Text>
          </View>
          {/* Rows */}
          <View style={{ borderLeftWidth: 0.4, borderRightWidth: 0.4, borderBottomWidth: 0.4, borderColor: '#cbd5e1' }}>
            <View style={{ flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 0.4, borderBottomColor: '#cbd5e1', alignItems: 'center' }}>
              <Text style={{ fontSize: 6.5, flex: 2.2, color: '#0f172a' }}>Infracciones &gt;= 80 km/h (PESV: prohibición absoluta)</Text>
              <View style={{ flex: 2.8 }}><AlertProgressBar val={resumen.infracciones80} maxVal={maxVal} color="#dc2626" /></View>
              <Text style={{ fontSize: 7, fontWeight: 700, flex: 0.5, textAlign: 'center', color: resumen.infracciones80 > 0 ? '#dc2626' : '#16a34a' }}>{resumen.infracciones80}</Text>
            </View>
            <View style={{ flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 0.4, borderBottomColor: '#cbd5e1', alignItems: 'center', backgroundColor: '#f8fafc' }}>
              <Text style={{ fontSize: 6.5, flex: 2.2, color: '#0f172a' }}>Excesos velocidad 50-80 km/h (meta: 0)</Text>
              <View style={{ flex: 2.8 }}><AlertProgressBar val={resumen.excesos50a80} maxVal={maxVal} color="#d97706" /></View>
              <Text style={{ fontSize: 7, fontWeight: 700, flex: 0.5, textAlign: 'center', color: resumen.excesos50a80 > 0 ? '#d97706' : '#16a34a' }}>{resumen.excesos50a80}</Text>
            </View>
            <View style={{ flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 0.4, borderBottomColor: '#cbd5e1', alignItems: 'center' }}>
              <Text style={{ fontSize: 6.5, flex: 2.2, color: '#0f172a' }}>Excesos velocidad 10-40 km/h (meta: 0)</Text>
              <View style={{ flex: 2.8 }}><AlertProgressBar val={resumen.excesosVarios} maxVal={maxVal} color="#dc2626" /></View>
              <Text style={{ fontSize: 7, fontWeight: 700, flex: 0.5, textAlign: 'center', color: resumen.excesosVarios > 0 ? '#dc2626' : '#16a34a' }}>{resumen.excesosVarios}</Text>
            </View>
            <View style={{ flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 0.4, borderBottomColor: '#cbd5e1', alignItems: 'center', backgroundColor: '#f8fafc' }}>
              <Text style={{ fontSize: 6.5, flex: 2.2, color: '#0f172a' }}>Frenadas bruscas (meta: &lt; 4)</Text>
              <View style={{ flex: 2.8 }}><AlertProgressBar val={resumen.frenadas} maxVal={maxVal} color="#d97706" /></View>
              <Text style={{ fontSize: 7, fontWeight: 700, flex: 0.5, textAlign: 'center', color: resumen.frenadas > 3 ? '#dc2626' : (resumen.frenadas > 0 ? '#d97706' : '#16a34a') }}>{resumen.frenadas}</Text>
            </View>
            <View style={{ flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6, alignItems: 'center' }}>
              <Text style={{ fontSize: 6.5, flex: 2.2, color: '#0f172a' }}>Eventos sin iButton (meta: 0 — PESV obligatorio)</Text>
              <View style={{ flex: 2.8 }}><AlertProgressBar val={resumen.alertasSinConductorIdentificado} maxVal={maxVal} color="#dc2626" /></View>
              <Text style={{ fontSize: 7, fontWeight: 700, flex: 0.5, textAlign: 'center', color: resumen.alertasSinConductorIdentificado > 0 ? '#dc2626' : '#16a34a' }}>{resumen.alertasSinConductorIdentificado}</Text>
            </View>
          </View>
        </View>

        {/* RANKING CONDUCTORES — NIVEL DE RIESGO PESV */}
        <SectionTitle title="RANKING CONDUCTORES — NIVEL DE RIESGO PESV" />
        <View style={{ marginBottom: 4 }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', backgroundColor: '#0f3a60', paddingVertical: 4, paddingHorizontal: 6, alignItems: 'center' }}>
            <Text style={{ fontSize: 6.8, fontWeight: 700, color: '#ffffff', flex: 0.3, textAlign: 'center' }}>#</Text>
            <Text style={{ fontSize: 6.8, fontWeight: 700, color: '#ffffff', flex: 0.8, textAlign: 'center' }}>Placa</Text>
            <Text style={{ fontSize: 6.8, fontWeight: 700, color: '#ffffff', flex: 1.8 }}>Conductor</Text>
            <Text style={{ fontSize: 6.8, fontWeight: 700, color: '#ffffff', flex: 0.6, textAlign: 'center' }}>Alertas</Text>
            <Text style={{ fontSize: 6.8, fontWeight: 700, color: '#ffffff', flex: 1.2, textAlign: 'center' }}>Nivel PESV</Text>
            <Text style={{ fontSize: 6.8, fontWeight: 700, color: '#ffffff', flex: 2.3 }}>Acción requerida</Text>
          </View>
          {/* Rows */}
          <View style={{ borderLeftWidth: 0.4, borderRightWidth: 0.4, borderBottomWidth: 0.4, borderColor: '#cbd5e1' }}>
            {topOffenders.length === 0 ? (
              <View style={{ padding: 6, alignItems: 'center' }}>
                <Text style={{ fontSize: 6.5, color: '#16a34a', fontWeight: 700 }}>✓ Excelente: Cero conductores con alertas registradas.</Text>
              </View>
            ) : (
              topOffenders.map((r, i) => {
                const isSinIdentificar = r.conductor.toUpperCase().includes('SIN IDENTIFICAR') || r.conductor.toUpperCase().includes('NO REGISTRA');
                const condLabel = isSinIdentificar ? 'SIN IDENTIFICAR (iButton)' : mayuscula(r.conductor);
                const condColor = isSinIdentificar ? '#dc2626' : '#0f172a';
                const condWeight = isSinIdentificar ? '700' : '400';

                let nivel: 'CRÍTICO' | 'OBSERV.' | 'BAJO' = 'BAJO';
                let accion = "Notificación y seguimiento preventivo. 15 días.";
                let actionColor = '#0f172a';

                if (r.infracciones80 > 0 || r.total >= 5) {
                  nivel = 'CRÍTICO';
                  accion = isSinIdentificar ? "Bloquear circulación. Identificar conductor. 48 h." : "Bloquear circulación. Comité extraordinario. 48 h.";
                  actionColor = '#dc2626';
                } else if (r.excesos50a80 > 0 || r.frenadas > 0 || r.total >= 2) {
                  nivel = 'OBSERV.';
                  accion = "Retroalimentación individual y firma de acta. 7 días.";
                  actionColor = '#d97706';
                }

                return (
                  <View key={i} style={{ flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 0.4, borderBottomColor: '#cbd5e1', alignItems: 'center', backgroundColor: i % 2 === 1 ? '#f8fafc' : '#ffffff' }}>
                    <Text style={{ fontSize: 6.5, flex: 0.3, textAlign: 'center', color: '#64748b' }}>{i + 1}</Text>
                    <Text style={{ fontSize: 6.5, flex: 0.8, textAlign: 'center', fontWeight: '700', color: condColor }}>{r.placa}</Text>
                    <Text style={{ fontSize: 6.5, flex: 1.8, fontWeight: condWeight, color: condColor }}>{condLabel}</Text>
                    <Text style={{ fontSize: 7, flex: 0.6, textAlign: 'center', fontWeight: '700' }}>{r.total}</Text>
                    <View style={{ flex: 1.2, alignItems: 'center', justifyContent: 'center' }}>
                      <NivelPesvBadge nivel={nivel} />
                    </View>
                    <Text style={{ fontSize: 6.2, flex: 2.3, color: actionColor, fontWeight: nivel === 'CRÍTICO' ? '700' : '400' }}>{accion}</Text>
                  </View>
                );
              })
            )}

            {/* Fila agrupada (Rank 5+) si existen más de 4 */}
            {groupedOffenders.length > 0 ? (
              <View style={{ flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 6, alignItems: 'center', backgroundColor: topOffenders.length % 2 === 1 ? '#f8fafc' : '#ffffff' }}>
                <Text style={{ fontSize: 6.5, flex: 0.3, textAlign: 'center', color: '#64748b' }}>5+</Text>
                <Text style={{ fontSize: 5.2, flex: 0.8, textAlign: 'center', color: '#64748b', lineHeight: 1.2 }}>
                  {groupedOffenders.map(g => g.placa).slice(0, 3).join(', ')}{groupedOffenders.length > 3 ? ', ...' : ''}
                </Text>
                <Text style={{ fontSize: 6.5, flex: 1.8, color: '#64748b' }}>
                  {groupedOffenders.length} conductores/vehículos adicionales
                </Text>
                <Text style={{ fontSize: 6.5, flex: 0.6, textAlign: 'center', color: '#64748b' }}>
                  {groupedOffenders.reduce((acc, curr) => acc + curr.total, 0)}
                </Text>
                <View style={{ flex: 1.2, alignItems: 'center', justifyContent: 'center' }}>
                  <NivelPesvBadge nivel="BAJO" />
                </View>
                <Text style={{ fontSize: 6.2, flex: 2.3, color: '#64748b' }}>Notificación y seguimiento preventivo. 15 días.</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* PLAN DE ACCIÓN — ACCIONES PENDIENTES */}
        <SectionTitle title="PLAN DE ACCION — ACCIONES PENDIENTES" />
        <View style={{ marginBottom: 8 }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', backgroundColor: '#0f3a60', paddingVertical: 4, paddingHorizontal: 6, alignItems: 'center' }}>
            <Text style={{ fontSize: 6.8, fontWeight: 700, color: '#ffffff', flex: 2.8 }}>Acción requerida (Llamado a la acción)</Text>
            <Text style={{ fontSize: 6.8, fontWeight: 700, color: '#ffffff', flex: 1.4 }}>Responsable</Text>
            <Text style={{ fontSize: 6.8, fontWeight: 700, color: '#ffffff', flex: 0.8, textAlign: 'center' }}>Plazo</Text>
            <Text style={{ fontSize: 6.8, fontWeight: 700, color: '#ffffff', flex: 1.2, textAlign: 'center' }}>Ref. PESV</Text>
            <Text style={{ fontSize: 6.8, fontWeight: 700, color: '#ffffff', flex: 0.6, textAlign: 'center' }}>Prior.</Text>
          </View>
          {/* Rows */}
          <View style={{ borderLeftWidth: 0.4, borderRightWidth: 0.4, borderBottomWidth: 0.4, borderColor: '#cbd5e1' }}>
            {correctivos.map((r, i) => (
              <View key={i} style={{ flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: i === correctivos.length - 1 ? 0 : 0.4, borderBottomColor: '#cbd5e1', alignItems: 'center', backgroundColor: i % 2 === 1 ? '#f8fafc' : '#ffffff' }}>
                <Text style={{ fontSize: 6.2, flex: 2.8, color: '#1e293b', lineHeight: 1.3 }}>{r.accion}</Text>
                <Text style={{ fontSize: 6.2, flex: 1.4, color: '#475569' }}>{r.responsable}</Text>
                <Text style={{ fontSize: 6.5, flex: 0.8, textAlign: 'center', fontWeight: '700', color: r.plazoColor }}>{r.plazo}</Text>
                <Text style={{ fontSize: 6.2, flex: 1.2, textAlign: 'center', color: '#64748b' }}>{r.refPesv}</Text>
                <View style={{ flex: 0.6, alignItems: 'center', justifyContent: 'center' }}>
                  <PrioridadOrb color={r.priorColor} />
                </View>
              </View>
            ))}
          </View>
        </View>

        <View wrap={false}>
          {/* CONTROL DE COMPROMISO Y CIERRE */}
          <SectionTitle title="CONTROL DE COMPROMISO Y CIERRE" />
          <View style={{ borderWidth: 0.4, borderColor: '#cbd5e1', padding: 5, marginBottom: 8, backgroundColor: '#f8fafc', borderRadius: 2 }}>
            <Text style={{ fontSize: 5.8, lineHeight: 1.4, color: '#334155' }}>
              Las acciones correctivas y preventivas contenidas en este plan son de cumplimiento obligatorio y forman parte integral del Plan Estratégico de Seguridad Vial (PESV). El supervisor de operaciones del contrato y el líder de seguridad vial (SST) deben registrar en la bitácora interna las citaciones de descargo, las actas firmadas de compromiso y los mantenimientos preventivos realizados, asegurando la trazabilidad del 100% de los llamados a la acción establecidos.
            </Text>
          </View>

          {/* REFERENCIA NORMATIVA */}
          <View style={{ borderLeftWidth: 2, borderLeftColor: '#0d9488', backgroundColor: '#f0fdfa', padding: 5, marginTop: 10 }}>
            <Text style={{ fontSize: 5.6, lineHeight: 1.3, color: '#0f766e' }}>
              <Text style={{ fontWeight: 700 }}>Referencia normativa: </Text>
              Manual PESV COL-0038 V2 (07/03/2025) — Res. 20223040040595/2022. Objetivo corporativo: 0 accidentes viales. Meta de conducta: &lt;50% eventos atribuidos a conductores. Ciclo PHVA activo.
            </Text>
          </View>

          <Text style={{ textAlign: 'center', fontSize: 6, fontWeight: 700, marginTop: 15, color: '#64748b' }}>*** FIN DEL INFORME GERENCIAL ***</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function descargarPDFAlertasDiarias(data: ReporteAlertasDiariasData): Promise<void> {
  const blob = await pdf(<InformeAlertasDiariasPDF data={data} />).toBlob();
  const contrato = safeFileName(data.contrato?.nombre || data.alertas[0]?.contrato_nombre || 'alertas');
  downloadBlob(blob, `Alertas_Diarias_${contrato}_${data.periodoInicio}_${data.periodoFin}.pdf`);
}

export async function descargarPDFAlertasDiariasGerencial(data: ReporteAlertasDiariasData): Promise<void> {
  const blob = await pdf(<InformeGerencialAlertasDiariasPDF data={data} />).toBlob();
  const contrato = safeFileName(data.contrato?.nombre || data.alertas[0]?.contrato_nombre || 'alertas');
  downloadBlob(blob, `Informe_Gerencial_${contrato}_${data.periodoInicio}_${data.periodoFin}.pdf`);
}

export async function descargarConsolidadoConductoresContrato(
  contrato: ContratoOption,
  datos: ReporteConductorData[],
  vehiculos: ReporteVehiculoData[],
  resumen: ConsolidadoContratoResumen,
  periodoInicio: string,
  periodoFin: string,
  datosAnteriores?: ReporteConductorData[],
  vehiculosAnteriores?: ReporteVehiculoData[],
): Promise<void> {
  const blob = await pdf(
    <ConsolidadoConductoresContratoPDF
      contrato={contrato}
      datos={datos}
      vehiculos={vehiculos}
      resumen={resumen}
      periodoInicio={periodoInicio}
      periodoFin={periodoFin}
      datosAnteriores={datosAnteriores}
      vehiculosAnteriores={vehiculosAnteriores}
    />
  ).toBlob();
  downloadBlob(blob, `Conductores_${safeFileName(contrato.nombre)}_${periodoInicio}.pdf`);
}

export async function descargarConsolidadoVehiculosContrato(
  contrato: ContratoOption,
  datos: ReporteVehiculoData[],
  conductores: ReporteConductorData[],
  resumen: ConsolidadoContratoResumen,
  periodoInicio: string,
  periodoFin: string,
  datosAnteriores?: ReporteVehiculoData[],
  conductoresAnteriores?: ReporteConductorData[],
): Promise<void> {
  const blob = await pdf(
    <ConsolidadoVehiculosContratoPDF
      contrato={contrato}
      datos={datos}
      conductores={conductores}
      resumen={resumen}
      periodoInicio={periodoInicio}
      periodoFin={periodoFin}
      datosAnteriores={datosAnteriores}
      conductoresAnteriores={conductoresAnteriores}
    />
  ).toBlob();
  downloadBlob(blob, `Vehiculos_${safeFileName(contrato.nombre)}_${periodoInicio}.pdf`);
}


export async function descargarLotePDFs(
  datos: Array<ReporteConductorData | ReporteVehiculoData>,
  tipo: 'conductor' | 'vehiculo'
): Promise<void> {
  // Descarga secuencial; para ZIP instalar jszip
  for (const d of datos) {
    if (tipo === 'conductor') {
      await descargarPDFConductor(d as ReporteConductorData);
    } else {
      await descargarPDFVehiculo(d as ReporteVehiculoData);
    }
    // pausa breve para no saturar al navegador
    await new Promise(r => setTimeout(r, 300));
  }
}

// ==============================================================================
// ── PLANTILLA PDF: ANÁLISIS GERENCIAL DE COMPORTAMIENTO POR CONTRATO ───────────
// ==============================================================================

interface InformeAnalisisContratoPDFProps {
  contratosSeleccionados: ContratoOption[];
  filtro: { fechaInicio: string; fechaFin: string };
  metricas: {
    totalConductoresActivos: number;
    totalVehiculosActivos: number;
    totalMotosActivas: number;
    totalFlotaActiva: number;
    kmVehiculos: number;
    kmMotos: number;
    totalKms: number;
    totalRalentiHoras: number;
    vehsConKm: number;
    vehsConExcess: number;
    vehsConRalenti: number;
    vehsConFrenadas: number;
    vehsConAceleraciones: number;
    totalExcesos: number;
    totalExcesos80: number;
    totalExcesosBajo80: number;
    totalFrenadas: number;
    totalAceleraciones: number;
    pctVehConKm: number;
    pctVehConExcess: number;
    pctVehConRalenti: number;
    condConKm: number;
    condConExcess: number;
    condConFrenadas: number;
    condConAceleraciones: number;
  };
  vehiculosDetalle: any[];
}

// Componente vectorial para representar medidores circulares de efectividad en el PDF
function CircularGauge({ percent, color, label, subLabel }: { percent: number; color: string; label: string; subLabel: string }) {
  const radius = 22;
  const strokeWidth = 4;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(percent, 100) / 100) * circumference;

  return (
    <View style={{ alignItems: 'center', width: 95 }}>
      <View style={{ width: 56, height: 56, position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={56} height={56} viewBox="0 0 56 56">
          {/* Círculo de fondo */}
          <Circle
            cx="28"
            cy="28"
            r="22"
            fill="none"
            stroke="#cbd5e1"
            strokeWidth="4"
          />
          {/* Círculo de progreso */}
          <Circle
            cx="28"
            cy="28"
            r="22"
            fill="none"
            stroke={color}
            strokeWidth="4"
            {...({
              strokeDasharray: String(circumference),
              strokeDashoffset: String(strokeDashoffset),
              strokeLinecap: "round",
            } as any)}
            transform="rotate(-90 28 28)"
          />
        </Svg>
        <View style={{ position: 'absolute', top: 21, left: 0, right: 0, alignItems: 'center' }}>
          <Text style={{ fontSize: 9, fontWeight: 700, color: COLORS.negro }}>{Math.round(percent)}%</Text>
        </View>
      </View>
      <Text style={{ fontSize: 5.6, fontWeight: 700, color: COLORS.negro, marginTop: 4, textAlign: 'center' }}>{label}</Text>
      <Text style={{ fontSize: 4.8, color: COLORS.gris, textAlign: 'center', marginTop: 1 }}>{subLabel}</Text>
    </View>
  );
}

// Componente vectorial para representar barras de progreso horizontales en el PDF
function PDFProgressBar({ percent, color, label, valueLabel }: { percent: number; color: string; label: string; valueLabel: string }) {
  return (
    <View style={{ marginBottom: 5 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
        <Text style={{ fontSize: 5.3, fontWeight: 700, color: COLORS.negro }}>{label}</Text>
        <Text style={{ fontSize: 5.3, fontWeight: 700, color: COLORS.gris }}>
          {valueLabel} <Text style={{ color: COLORS.negro }}>({Math.round(percent)}%)</Text>
        </Text>
      </View>
      <View style={{ width: '100%', height: 4, backgroundColor: '#cbd5e1', borderRadius: 2, overflow: 'hidden' }}>
        {percent > 0 ? (
          <View style={{ width: `${Math.min(percent, 100)}%`, height: 4, backgroundColor: color, borderRadius: 2 }} />
        ) : null}
      </View>
    </View>
  );
}

export function InformeAnalisisContratoPDF({
  contratosSeleccionados,
  filtro,
  metricas,
  vehiculosDetalle,
}: InformeAnalisisContratoPDFProps) {
  const cLabel = contratosSeleccionados.map(c => c.nombre).join(' / ') || 'Ningún contrato seleccionado';

  return (
    <Document title="Informe Gerencial de Análisis por Contrato">
      <Page size="LETTER" orientation="portrait" style={[base.page, { padding: 18, paddingBottom: 54 }]}>
        <ReportHeader title="FORMATO LOCAL PARA INFORME GESTION MENSUAL COMPORTAMIENTO FLOTA VEHICULAR (GPS)" />
        <ReportFooter />

        <Band dark>1. INFORMACION GENERAL DEL ANALISIS</Band>
        <Cell label="FECHA DEL REPORTE:" value={fmt(getLocalDateISO())} />
        <Cell label="PERIODO EVALUADO:" value={`${fmt(filtro.fechaInicio)} - ${fmt(filtro.fechaFin)}`} />
        <Cell label="CONTRATOS EVALUADOS:" value={cLabel} />
        <Cell label="TIPO DE ANÁLISIS:" value="Análisis Gerencial por Contrato (Multiselección)" />

        {/* Fila principal: Reporte PRM a la izquierda y Efectividad Operativa a la derecha */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 6, marginBottom: 8 }}>
          
          {/* Tarjeta PRM con fondo oscuro */}
          <View style={{ flex: 1.1, backgroundColor: '#0f172a', padding: 10, borderRadius: 6, justifyContent: 'space-between' }}>
            <View>
              <Text style={{ fontSize: 9, fontWeight: 700, color: COLORS.blanco, borderBottomWidth: 0.5, borderBottomColor: '#334155', paddingBottom: 4, marginBottom: 6 }}>
                Reporte Oficial PRM
              </Text>
              <View style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 0.3, borderBottomColor: '#1e293b', paddingVertical: 2 }}>
                  <Text style={{ fontSize: 6.2, color: '#94a3b8' }}>N° Conductores:</Text>
                  <Text style={{ fontSize: 6.8, fontWeight: 700, color: COLORS.blanco }}>{metricas.totalConductoresActivos}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 0.3, borderBottomColor: '#1e293b', paddingVertical: 2 }}>
                  <Text style={{ fontSize: 6.2, color: '#94a3b8' }}>N° Vehículos:</Text>
                  <Text style={{ fontSize: 6.8, fontWeight: 700, color: COLORS.blanco }}>{metricas.totalVehiculosActivos}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 0.3, borderBottomColor: '#1e293b', paddingVertical: 2 }}>
                  <Text style={{ fontSize: 6.2, color: '#94a3b8' }}>N° Motocicletas:</Text>
                  <Text style={{ fontSize: 6.8, fontWeight: 700, color: COLORS.blanco }}>{metricas.totalMotosActivas}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 0.3, borderBottomColor: '#1e293b', paddingVertical: 2 }}>
                  <Text style={{ fontSize: 6.2, color: '#94a3b8' }}>Km recorridos Vehículos:</Text>
                  <Text style={{ fontSize: 6.8, fontWeight: 700, color: COLORS.blanco }}>{n(metricas.kmVehiculos, 1)} km</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 0.3, borderBottomColor: '#1e293b', paddingVertical: 2 }}>
                  <Text style={{ fontSize: 6.2, color: '#94a3b8' }}>Km recorridos Motocicletas:</Text>
                  <Text style={{ fontSize: 6.8, fontWeight: 700, color: COLORS.blanco }}>{n(metricas.kmMotos, 1)} km</Text>
                </View>
              </View>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#1e293b', padding: 5, borderRadius: 4, marginTop: 8 }}>
              <Text style={{ fontSize: 5.8, color: '#94a3b8', fontWeight: 700 }}>TOTAL KM CONSOLIDADO</Text>
              <Text style={{ fontSize: 7.2, fontWeight: 700, color: '#10b981' }}>{n(metricas.totalKms, 1)} km</Text>
            </View>
          </View>

          {/* Efectividad Operativa de Flota (Contrato) con Gauges Circulares y Tarjetas */}
          <View style={{ flex: 1.3, borderWidth: 0.4, borderColor: COLORS.sombra, padding: 8, borderRadius: 6, justifyContent: 'space-between' }}>
            <View>
              <Text style={{ fontSize: 9, fontWeight: 700, color: COLORS.azul, borderBottomWidth: 0.5, borderBottomColor: COLORS.sombra, paddingBottom: 4, marginBottom: 8 }}>
                Efectividad Operativa de Flota
              </Text>
              
              {/* Tres Medidores Circulares */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-around', gap: 4 }}>
                <CircularGauge
                  percent={metricas.pctVehConKm}
                  color="#16a34a"
                  label="Flota Activa con Km"
                  subLabel={`${metricas.vehsConKm} de ${metricas.totalFlotaActiva} rodaron`}
                />
                <CircularGauge
                  percent={metricas.pctVehConRalenti}
                  color="#d97706"
                  label="Flota con Ralentí"
                  subLabel={`${metricas.vehsConRalenti} de ${metricas.totalFlotaActiva} con motor`}
                />
                <CircularGauge
                  percent={metricas.pctVehConExcess}
                  color="#dc2626"
                  label="Flota con Excesos"
                  subLabel={`${metricas.vehsConExcess} de ${metricas.totalFlotaActiva} con alerta`}
                />
              </View>
            </View>

            {/* Tres Tarjetas de Desviaciones */}
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
              <View style={{ flex: 1, backgroundColor: '#fee2e2', borderLeftWidth: 2, borderLeftColor: '#dc2626', padding: 3, borderRadius: 2, alignItems: 'center' }}>
                <Text style={{ fontSize: 4.8, fontWeight: 700, color: '#991b1b' }}>EXCESOS VELOCIDAD</Text>
                <Text style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', marginTop: 1 }}>{n(metricas.totalExcesos)}</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: '#fef3c7', borderLeftWidth: 2, borderLeftColor: '#d97706', padding: 3, borderRadius: 2, alignItems: 'center' }}>
                <Text style={{ fontSize: 4.8, fontWeight: 700, color: '#92400e' }}>FRENADAS BRUSCAS</Text>
                <Text style={{ fontSize: 10, fontWeight: 700, color: '#d97706', marginTop: 1 }}>{n(metricas.totalFrenadas)}</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: '#dbeafe', borderLeftWidth: 2, borderLeftColor: '#1e40af', padding: 3, borderRadius: 2, alignItems: 'center' }}>
                <Text style={{ fontSize: 4.8, fontWeight: 700, color: '#1e3a8a' }}>SOBREACELERACIONES</Text>
                <Text style={{ fontSize: 10, fontWeight: 700, color: '#1e40af', marginTop: 1 }}>{n(metricas.totalAceleraciones)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Participación en Conducción y Desviaciones con Barras de Progreso horizontales */}
        <Band dark>2. PARTICIPACIÓN EN CONDUCCIÓN Y DESVIACIONES ({contratosSeleccionados.length === 1 ? 'CONTRATO' : 'CONSOLIDADO'})</Band>
        <View style={{ flexDirection: 'row', gap: 12, padding: 8, borderWidth: 0.4, borderColor: COLORS.sombra, borderRadius: 6, marginBottom: 8 }}>
          
          {/* Conductores */}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 7, fontWeight: 700, color: COLORS.gris, borderBottomWidth: 0.5, borderBottomColor: COLORS.sombra, paddingBottom: 3, marginBottom: 5 }}>
              ANÁLISIS DE CONDUCTORES (Total Roster: {metricas.totalConductoresActivos})
            </Text>
            <View style={{ gap: 4 }}>
              <PDFProgressBar
                percent={metricas.totalConductoresActivos > 0 ? (metricas.condConKm / metricas.totalConductoresActivos) * 100 : 0}
                color="#10b981"
                label="Generaron Recorridos (KMs > 0)"
                valueLabel={`${metricas.condConKm} / ${metricas.totalConductoresActivos}`}
              />
              <PDFProgressBar
                percent={metricas.totalConductoresActivos > 0 ? (metricas.condConExcess / metricas.totalConductoresActivos) * 100 : 0}
                color="#ef4444"
                label="Presentaron Excesos de Velocidad"
                valueLabel={`${metricas.condConExcess} / ${metricas.totalConductoresActivos}`}
              />
              <PDFProgressBar
                percent={metricas.totalConductoresActivos > 0 ? (metricas.condConFrenadas / metricas.totalConductoresActivos) * 100 : 0}
                color="#f97316"
                label="Presentaron Frenadas Bruscas"
                valueLabel={`${metricas.condConFrenadas} / ${metricas.totalConductoresActivos}`}
              />
              <PDFProgressBar
                percent={metricas.totalConductoresActivos > 0 ? (metricas.condConAceleraciones / metricas.totalConductoresActivos) * 100 : 0}
                color="#3b82f6"
                label="Presentaron Sobreaceleraciones"
                valueLabel={`${metricas.condConAceleraciones} / ${metricas.totalConductoresActivos}`}
              />
            </View>
          </View>

          {/* Vehículos */}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 7, fontWeight: 700, color: COLORS.gris, borderBottomWidth: 0.5, borderBottomColor: COLORS.sombra, paddingBottom: 3, marginBottom: 5 }}>
              ANÁLISIS DE VEHÍCULOS (Flota Roster: {metricas.totalFlotaActiva})
            </Text>
            <View style={{ gap: 4 }}>
              <PDFProgressBar
                percent={metricas.pctVehConKm}
                color="#10b981"
                label="Generaron Recorridos (KMs > 0)"
                valueLabel={`${metricas.vehsConKm} / ${metricas.totalFlotaActiva}`}
              />
              <PDFProgressBar
                percent={metricas.pctVehConExcess}
                color="#ef4444"
                label="Presentaron Excesos de Velocidad"
                valueLabel={`${metricas.vehsConExcess} / ${metricas.totalFlotaActiva}`}
              />
              <PDFProgressBar
                percent={metricas.totalFlotaActiva > 0 ? (metricas.vehsConFrenadas / metricas.totalFlotaActiva) * 100 : 0}
                color="#f97316"
                label="Presentaron Frenadas Bruscas"
                valueLabel={`${metricas.vehsConFrenadas} / ${metricas.totalFlotaActiva}`}
              />
              <PDFProgressBar
                percent={metricas.totalFlotaActiva > 0 ? (metricas.vehsConAceleraciones / metricas.totalFlotaActiva) * 100 : 0}
                color="#3b82f6"
                label="Presentaron Sobreaceleraciones"
                valueLabel={`${metricas.vehsConAceleraciones} / ${metricas.totalFlotaActiva}`}
              />
              <PDFProgressBar
                percent={metricas.pctVehConRalenti}
                color="#eab308"
                label="Presentaron Ralentí Excesivo"
                valueLabel={`${metricas.vehsConRalenti} / ${metricas.totalFlotaActiva}`}
              />
            </View>
          </View>
        </View>

        <View wrap={false}>
          <Band>3. CONTROL HSEQ - BITÁCORA DE LLAMADO A LA ACCIÓN (PESV)</Band>
          <View style={{ borderWidth: 0.4, borderColor: '#cbd5e1', padding: 5, backgroundColor: '#f8fafc', borderRadius: 2 }}>
            <Text style={{ fontSize: 5.6, lineHeight: 1.4, color: '#334155' }}>
              Este análisis gerencial constituye una auditoría periódica de la flota asociada a los contratos descritos. En caso de evidenciarse una tasa de desviación superior al 10% en excesos de velocidad o conducción agresiva, se activará el protocolo de seguridad vial corporativo PESV, convocando a capacitaciones de manejo defensivo y sensibilización técnica a los operadores involucrados.
            </Text>
          </View>
        </View>
      </Page>

      {/* Página 2 y siguientes: Desglose Operativo Detallado */}
      <Page size="LETTER" orientation="portrait" style={[base.page, { padding: 18, paddingBottom: 54 }]}>
        <ReportHeader title="FORMATO LOCAL PARA INFORME GESTION MENSUAL COMPORTAMIENTO FLOTA VEHICULAR (GPS)" />
        <ReportFooter />

        <Band dark>4. DESGLOSE OPERATIVO DETALLADO POR VEHÍCULO</Band>
        <View style={[base.tableHeader, { marginTop: 4 }]}>
          <Text style={[base.tableHeaderCell, { flex: 0.8, textAlign: 'left' }]}>Placa</Text>
          <Text style={[base.tableHeaderCell, { flex: 1.6 }]}>Contrato</Text>
          <Text style={[base.tableHeaderCell, { flex: 1.0 }]}>Tipo Activo</Text>
          <Text style={[base.tableHeaderCell, { flex: 1.0 }]}>Kilómetros</Text>
          <Text style={[base.tableHeaderCell, { flex: 1.0 }]}>Horas Ralentí</Text>
          <Text style={[base.tableHeaderCell, { flex: 0.8 }]}>Exc &gt;= 80</Text>
          <Text style={[base.tableHeaderCell, { flex: 0.8 }]}>Exc &lt; 80</Text>
          <Text style={[base.tableHeaderCell, { flex: 0.8 }]}>Frenadas</Text>
          <Text style={[base.tableHeaderCell, { flex: 0.8 }]}>Sobreacel.</Text>
          <Text style={[base.tableHeaderCell, { flex: 0.8 }]}>Cal.</Text>
        </View>
        {vehiculosDetalle.map((rv, idx) => {
          const placa = rv.vehiculos?.placa ?? rv.placa;
          const tipo = rv.vehiculos?.tipo_activo ?? rv.tipo_activo ?? '—';
          const cNom = rv.contratos?.nombre ?? contratosSeleccionados.find(c => c.id === (rv.contrato_id || rv.vehiculos?.contrato_id))?.nombre ?? '—';
          
          const exc80 = Number(rv.excesos_80_kph ?? 0);
          const excBajo80 = Number(rv.excesos_10_kph ?? 0) +
            Number(rv.excesos_20_kph ?? 0) +
            Number(rv.excesos_30_kph ?? 0) +
            Number(rv.excesos_40_kph ?? 0) +
            Number(rv.excesos_50_kph ?? 0) +
            Number(rv.excesos_60_kph ?? 0);
          
          const score = Number(rv.calificacion ?? 100);
          const scoreColor = score >= 90 ? COLORS.verde : score >= 70 ? COLORS.amarillo : COLORS.rojo;
          const frenadas = Number(rv.frenadas_bruscas ?? rv.frenadas ?? 0);
          const aceleraciones = Number(rv.aceleraciones_bruscas ?? rv.aceleraciones ?? 0);

          return (
            <View key={rv.id || idx} style={[base.tableRow, idx % 2 ? base.tableRowAlt : {}]} wrap={false}>
              <Text style={[base.tableCell, { flex: 0.8, fontWeight: 700, textAlign: 'left' }]}>{placa}</Text>
              <Text style={[base.tableCell, { flex: 1.6 }]}>{cNom}</Text>
              <Text style={[base.tableCell, { flex: 1.0 }]}>{tipo}</Text>
              <Text style={[base.tableCell, { flex: 1.0 }]}>{n(rv.kms, 1)} km</Text>
              <Text style={[base.tableCell, { flex: 1.0, color: Number(rv.horas_motor_ralenti ?? 0) > 2 ? COLORS.amarillo : COLORS.negro }]}>{n(rv.horas_motor_ralenti ?? 0, 1)} h</Text>
              <Text style={[base.tableCell, { flex: 0.8, color: exc80 > 0 ? COLORS.rojo : COLORS.negro, fontWeight: exc80 > 0 ? 700 : 400 }]}>{exc80}</Text>
              <Text style={[base.tableCell, { flex: 0.8, color: excBajo80 > 0 ? COLORS.rojo : COLORS.negro }]}>{excBajo80}</Text>
              <Text style={[base.tableCell, { flex: 0.8, color: frenadas > 0 ? COLORS.amarillo : COLORS.negro }]}>{frenadas}</Text>
              <Text style={[base.tableCell, { flex: 0.8, color: aceleraciones > 0 ? COLORS.azulClaro : COLORS.negro }]}>{aceleraciones}</Text>
              <Text style={[base.tableCell, { flex: 0.8, fontWeight: 700, color: scoreColor }]}>{score}</Text>
            </View>
          );
        })}
        <Text style={{ textAlign: 'center', fontSize: 6, fontWeight: 700, marginTop: 15, color: '#64748b' }}>*** FIN DEL INFORME GERENCIAL POR CONTRATO ***</Text>
      </Page>
    </Document>
  );
}

interface InformeConsolidadoGlobalPDFProps {
  consolidadoGlobal: any[];
  metricasGlobales: any;
  ghostEntities: { conductores: any[]; vehiculos: any[] };
  filtro: { fechaInicio: string; fechaFin: string };
}

export function InformeConsolidadoGlobalPDF({
  consolidadoGlobal,
  metricasGlobales,
  ghostEntities,
  filtro,
}: InformeConsolidadoGlobalPDFProps) {
  return (
    <Document title="Informe Consolidado Global Corporativo">
      <Page size="LETTER" orientation="portrait" style={[base.page, { padding: 18, paddingBottom: 54 }]}>
        <ReportHeader title="FORMATO LOCAL PARA INFORME GESTION MENSUAL COMPORTAMIENTO FLOTA VEHICULAR (GPS)" />
        <ReportFooter />

        <Band dark>1. INFORMACION GENERAL - AUDITORÍA CORPORATIVA VIAL</Band>
        <Cell label="FECHA DEL INFORME:" value={fmt(getLocalDateISO())} />
        <Cell label="PERIODO EVALUADO:" value={`${fmt(filtro.fechaInicio)} - ${fmt(filtro.fechaFin)}`} />
        <Cell label="CONTRATOS TOTALES DETECTADOS:" value={n(consolidadoGlobal.length)} />
        <Cell label="TIPO DE ANÁLISIS:" value="Consolidado Global Corporativo (Multi-Contrato)" />

        {/* Fila principal: KPIs a la izquierda y Efectividad Operativa a la derecha */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 6, marginBottom: 8 }}>
          
          {/* Tarjeta PRM/Capacidad con fondo oscuro */}
          <View style={{ flex: 1.1, backgroundColor: '#0f172a', padding: 10, borderRadius: 6, justifyContent: 'space-between' }}>
            <View>
              <Text style={{ fontSize: 9, fontWeight: 700, color: COLORS.blanco, borderBottomWidth: 0.5, borderBottomColor: '#334155', paddingBottom: 4, marginBottom: 6 }}>
                Resumen Operativo País
              </Text>
              <View style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 0.3, borderBottomColor: '#1e293b', paddingVertical: 2 }}>
                  <Text style={{ fontSize: 6.2, color: '#94a3b8' }}>Total Conductores:</Text>
                  <Text style={{ fontSize: 6.8, fontWeight: 700, color: COLORS.blanco }}>{metricasGlobales.totalConductores}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 0.3, borderBottomColor: '#1e293b', paddingVertical: 2 }}>
                  <Text style={{ fontSize: 6.2, color: '#94a3b8' }}>Total Vehículos (Autos/Buses):</Text>
                  <Text style={{ fontSize: 6.8, fontWeight: 700, color: COLORS.blanco }}>{metricasGlobales.totalVehiculos}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 0.3, borderBottomColor: '#1e293b', paddingVertical: 2 }}>
                  <Text style={{ fontSize: 6.2, color: '#94a3b8' }}>Total Motocicletas:</Text>
                  <Text style={{ fontSize: 6.8, fontWeight: 700, color: COLORS.blanco }}>{metricasGlobales.totalMotos}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 0.3, borderBottomColor: '#1e293b', paddingVertical: 2 }}>
                  <Text style={{ fontSize: 6.2, color: '#94a3b8' }}>Calificación Promedio:</Text>
                  <Text style={{ fontSize: 6.8, fontWeight: 700, color: '#10b981' }}>{n(metricasGlobales.calificacionPromedio, 1)}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 0.3, borderBottomColor: '#1e293b', paddingVertical: 2 }}>
                  <Text style={{ fontSize: 6.2, color: '#94a3b8' }}>Total Horas Ralentí Flota:</Text>
                  <Text style={{ fontSize: 6.8, fontWeight: 700, color: COLORS.blanco }}>{n(metricasGlobales.totalRalenti, 1)} h</Text>
                </View>
              </View>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#1e293b', padding: 5, borderRadius: 4, marginTop: 8 }}>
              <Text style={{ fontSize: 5.8, color: '#94a3b8', fontWeight: 700 }}>KILÓMETROS TOTALES PAÍS</Text>
              <Text style={{ fontSize: 7.2, fontWeight: 700, color: '#10b981' }}>{n(metricasGlobales.totalKms, 1)} km</Text>
            </View>
          </View>

          {/* Efectividad Operativa de Flota (Global) con Gauges Circulares y Tarjetas */}
          <View style={{ flex: 1.3, borderWidth: 0.4, borderColor: COLORS.sombra, padding: 8, borderRadius: 6, justifyContent: 'space-between' }}>
            <View>
              <Text style={{ fontSize: 9, fontWeight: 700, color: COLORS.azul, borderBottomWidth: 0.5, borderBottomColor: COLORS.sombra, paddingBottom: 4, marginBottom: 8 }}>
                Efectividad Operativa Flota País
              </Text>
              
              {/* Tres Medidores Circulares */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-around', gap: 4 }}>
                <CircularGauge
                  percent={metricasGlobales.pctVehConKm}
                  color="#16a34a"
                  label="Flota Activa con Km"
                  subLabel={`${metricasGlobales.vehsConKm} de ${metricasGlobales.totalFlotaActiva} rodaron`}
                />
                <CircularGauge
                  percent={metricasGlobales.pctVehConRalenti}
                  color="#d97706"
                  label="Flota con Ralentí"
                  subLabel={`${metricasGlobales.vehsConRalenti} de ${metricasGlobales.totalFlotaActiva} con motor`}
                />
                <CircularGauge
                  percent={metricasGlobales.pctVehConExcess}
                  color="#dc2626"
                  label="Flota con Excesos"
                  subLabel={`${metricasGlobales.vehsConExcess} de ${metricasGlobales.totalFlotaActiva} con alerta`}
                />
              </View>
            </View>

            {/* Tres Tarjetas de Desviaciones */}
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
              <View style={{ flex: 1, backgroundColor: '#fee2e2', borderLeftWidth: 2, borderLeftColor: '#dc2626', padding: 3, borderRadius: 2, alignItems: 'center' }}>
                <Text style={{ fontSize: 4.8, fontWeight: 700, color: '#991b1b' }}>EXCESOS VELOCIDAD</Text>
                <Text style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', marginTop: 1 }}>{n(metricasGlobales.totalExcesos)}</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: '#fef3c7', borderLeftWidth: 2, borderLeftColor: '#d97706', padding: 3, borderRadius: 2, alignItems: 'center' }}>
                <Text style={{ fontSize: 4.8, fontWeight: 700, color: '#92400e' }}>FRENADAS BRUSCAS</Text>
                <Text style={{ fontSize: 10, fontWeight: 700, color: '#d97706', marginTop: 1 }}>{n(metricasGlobales.totalFrenadas)}</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: '#dbeafe', borderLeftWidth: 2, borderLeftColor: '#1e40af', padding: 3, borderRadius: 2, alignItems: 'center' }}>
                <Text style={{ fontSize: 4.8, fontWeight: 700, color: '#1e3a8a' }}>SOBREACELERACIONES</Text>
                <Text style={{ fontSize: 10, fontWeight: 700, color: '#1e40af', marginTop: 1 }}>{n(metricasGlobales.totalAceleraciones)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Participación en Conducción y Desviaciones con Barras de Progreso horizontales a nivel Global */}
        <Band dark>2. PARTICIPACIÓN EN CONDUCCIÓN Y DESVIACIONES OPERACIONALES GLOBAL (PAÍS)</Band>
        <View style={{ flexDirection: 'row', gap: 12, padding: 8, borderWidth: 0.4, borderColor: COLORS.sombra, borderRadius: 6, marginBottom: 8 }}>
          
          {/* Conductores */}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 7, fontWeight: 700, color: COLORS.gris, borderBottomWidth: 0.5, borderBottomColor: COLORS.sombra, paddingBottom: 3, marginBottom: 5 }}>
              ANÁLISIS DE CONDUCTORES GLOBAL (Total Roster: {metricasGlobales.totalConductores})
            </Text>
            <View style={{ gap: 4 }}>
              <PDFProgressBar
                percent={metricasGlobales.totalConductores > 0 ? (metricasGlobales.condConKm / metricasGlobales.totalConductores) * 100 : 0}
                color="#10b981"
                label="Generaron Recorridos (KMs > 0)"
                valueLabel={`${metricasGlobales.condConKm} / ${metricasGlobales.totalConductores}`}
              />
              <PDFProgressBar
                percent={metricasGlobales.totalConductores > 0 ? (metricasGlobales.condConExcess / metricasGlobales.totalConductores) * 100 : 0}
                color="#ef4444"
                label="Presentaron Excesos de Velocidad"
                valueLabel={`${metricasGlobales.condConExcess} / ${metricasGlobales.totalConductores}`}
              />
              <PDFProgressBar
                percent={metricasGlobales.totalConductores > 0 ? (metricasGlobales.condConFrenadas / metricasGlobales.totalConductores) * 100 : 0}
                color="#f97316"
                label="Presentaron Frenadas Bruscas"
                valueLabel={`${metricasGlobales.condConFrenadas} / ${metricasGlobales.totalConductores}`}
              />
              <PDFProgressBar
                percent={metricasGlobales.totalConductores > 0 ? (metricasGlobales.condConAceleraciones / metricasGlobales.totalConductores) * 100 : 0}
                color="#3b82f6"
                label="Presentaron Sobreaceleraciones"
                valueLabel={`${metricasGlobales.condConAceleraciones} / ${metricasGlobales.totalConductores}`}
              />
            </View>
          </View>

          {/* Vehículos */}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 7, fontWeight: 700, color: COLORS.gris, borderBottomWidth: 0.5, borderBottomColor: COLORS.sombra, paddingBottom: 3, marginBottom: 5 }}>
              ANÁLISIS DE VEHÍCULOS GLOBAL (Flota Roster: {metricasGlobales.totalFlotaActiva})
            </Text>
            <View style={{ gap: 4 }}>
              <PDFProgressBar
                percent={metricasGlobales.pctVehConKm}
                color="#10b981"
                label="Generaron Recorridos (KMs > 0)"
                valueLabel={`${metricasGlobales.vehsConKm} / ${metricasGlobales.totalFlotaActiva}`}
              />
              <PDFProgressBar
                percent={metricasGlobales.pctVehConExcess}
                color="#ef4444"
                label="Presentaron Excesos de Velocidad"
                valueLabel={`${metricasGlobales.vehsConExcess} / ${metricasGlobales.totalFlotaActiva}`}
              />
              <PDFProgressBar
                percent={metricasGlobales.totalFlotaActiva > 0 ? (metricasGlobales.vehsConFrenadas / metricasGlobales.totalFlotaActiva) * 100 : 0}
                color="#f97316"
                label="Presentaron Frenadas Bruscas"
                valueLabel={`${metricasGlobales.vehsConFrenadas} / ${metricasGlobales.totalFlotaActiva}`}
              />
              <PDFProgressBar
                percent={metricasGlobales.totalFlotaActiva > 0 ? (metricasGlobales.vehsConAceleraciones / metricasGlobales.totalFlotaActiva) * 100 : 0}
                color="#3b82f6"
                label="Presentaron Sobreaceleraciones"
                valueLabel={`${metricasGlobales.vehsConAceleraciones} / ${metricasGlobales.totalFlotaActiva}`}
              />
              <PDFProgressBar
                percent={metricasGlobales.pctVehConRalenti}
                color="#eab308"
                label="Presentaron Ralentí Excesivo"
                valueLabel={`${metricasGlobales.vehsConRalenti} / ${metricasGlobales.totalFlotaActiva}`}
              />
            </View>
          </View>
        </View>

        <Band dark>3. COMPARATIVA CORPORATIVA DE DESEMPEÑO POR CONTRATO</Band>
        <View style={[base.tableHeader, { marginTop: 4 }]}>
          <Text style={[base.tableHeaderCell, { flex: 1.6, textAlign: 'left' }]}>Contrato</Text>
          <Text style={[base.tableHeaderCell, { flex: 1.2 }]}>Cliente</Text>
          <Text style={[base.tableHeaderCell, { flex: 0.5 }]}>Cond.</Text>
          <Text style={[base.tableHeaderCell, { flex: 0.5 }]}>Veh.</Text>
          <Text style={[base.tableHeaderCell, { flex: 0.5 }]}>Motos</Text>
          <Text style={[base.tableHeaderCell, { flex: 0.9 }]}>Km Totales</Text>
          <Text style={[base.tableHeaderCell, { flex: 0.7 }]}>Exc &gt;= 80</Text>
          <Text style={[base.tableHeaderCell, { flex: 0.7 }]}>Exc &lt; 80</Text>
          <Text style={[base.tableHeaderCell, { flex: 0.7 }]}>Frenadas</Text>
          <Text style={[base.tableHeaderCell, { flex: 0.7 }]}>Ralentí</Text>
          <Text style={[base.tableHeaderCell, { flex: 0.7 }]}>Cal. Prom</Text>
        </View>
        {consolidadoGlobal.map((c, idx) => {
          return (
            <View key={c.id || idx} style={[base.tableRow, idx % 2 ? base.tableRowAlt : {}]} wrap={false}>
              <Text style={[base.tableCell, { flex: 1.6, fontWeight: 700, textAlign: 'left' }]}>{c.nombre}</Text>
              <Text style={[base.tableCell, { flex: 1.2 }]}>{c.cliente}</Text>
              <Text style={[base.tableCell, { flex: 0.5 }]}>{n(c.totalConductores)}</Text>
              <Text style={[base.tableCell, { flex: 0.5 }]}>{n(c.totalVehiculos)}</Text>
              <Text style={[base.tableCell, { flex: 0.5 }]}>{n(c.totalMotos)}</Text>
              <Text style={[base.tableCell, { flex: 0.9 }]}>{n(c.kms, 0)} km</Text>
              <Text style={[base.tableCell, { flex: 0.7, color: c.excesos80 > 0 ? COLORS.rojo : COLORS.negro, fontWeight: c.excesos80 > 0 ? 700 : 400 }]}>{n(c.excesos80)}</Text>
              <Text style={[base.tableCell, { flex: 0.7, color: c.excesosBajo80 > 0 ? COLORS.rojo : COLORS.negro }]}>{n(c.excesosBajo80)}</Text>
              <Text style={[base.tableCell, { flex: 0.7, color: c.frenadas > 0 ? COLORS.amarillo : COLORS.negro }]}>{n(c.frenadas)}</Text>
              <Text style={[base.tableCell, { flex: 0.7, color: c.ralenti > 2 ? COLORS.amarillo : COLORS.negro }]}>{n(c.ralenti, 1)} h</Text>
              <Text style={[base.tableCell, { flex: 0.7, fontWeight: 700, color: c.calificacionPromedio >= 90 ? COLORS.verde : c.calificacionPromedio >= 70 ? COLORS.amarillo : COLORS.rojo }]}>{n(c.calificacionPromedio, 1)}</Text>
            </View>
          );
        })}
      </Page>

      {/* Página 2: Ghost Tracking (Diagnóstico de Entidades No Registradas en Sheets) */}
      {(ghostEntities.conductores.length > 0 || ghostEntities.vehiculos.length > 0) && (
        <Page size="LETTER" orientation="portrait" style={[base.page, { padding: 18, paddingBottom: 54 }]}>
          <ReportHeader title="FORMATO LOCAL PARA INFORME GESTION MENSUAL COMPORTAMIENTO FLOTA VEHICULAR (GPS)" />
          <ReportFooter />

          <Band dark>4. DIAGNÓSTICO DE ENTIDADES ACTIVAS NO RELACIONADAS (GHOST TRACKING)</Band>
          <View style={{ borderWidth: 0.4, borderColor: '#dc2626', padding: 5, marginBottom: 8, backgroundColor: '#fee2e2', borderRadius: 2 }}>
            <Text style={{ fontSize: 5.6, fontWeight: 700, color: '#dc2626', marginBottom: 2 }}>ALERTA GERENCIAL DE EXCLUSIÓN:</Text>
            <Text style={{ fontSize: 5.4, lineHeight: 1.3, color: '#991b1b' }}>
              Las siguientes tablas enumeran los conductores y vehículos que registraron actividad satelital (KMs o alertas) durante el periodo de auditoría, pero no figuran en las bases de datos maestras de Google Sheets. Se solicita al área administrativa y líderes del contrato realizar de inmediato la sincronización y registro oficial de estas entidades.
            </Text>
          </View>

          {ghostEntities.conductores.length > 0 && (
            <View style={{ marginBottom: 12 }}>
              <Band>4.1. CONDUCTORES ACTIVOS PENDIENTES DE REGISTRAR EN GOOGLE SHEETS</Band>
              <View style={[base.tableHeader, { marginTop: 3 }]}>
                <Text style={[base.tableHeaderCell, { flex: 1.8, textAlign: 'left' }]}>Nombre Conductor</Text>
                <Text style={[base.tableHeaderCell, { flex: 1.0 }]}>Cédula</Text>
                <Text style={[base.tableHeaderCell, { flex: 1.0 }]}>iButton</Text>
                <Text style={[base.tableHeaderCell, { flex: 1.0 }]}>Km Recorridos</Text>
                <Text style={[base.tableHeaderCell, { flex: 0.8 }]}>Excesos</Text>
                <Text style={[base.tableHeaderCell, { flex: 0.8 }]}>Frenadas</Text>
                <Text style={[base.tableHeaderCell, { flex: 0.8 }]}>Cal.</Text>
              </View>
              {ghostEntities.conductores.map((gc, i) => (
                <View key={gc.id || i} style={[base.tableRow, i % 2 ? base.tableRowAlt : {}]} wrap={false}>
                  <Text style={[base.tableCell, { flex: 1.8, fontWeight: 700, textAlign: 'left' }]}>{mayuscula(gc.nombre)}</Text>
                  <Text style={[base.tableCell, { flex: 1.0 }]}>{gc.cedula || '—'}</Text>
                  <Text style={[base.tableCell, { flex: 1.0 }]}>{gc.ibutton || '—'}</Text>
                  <Text style={[base.tableCell, { flex: 1.0 }]}>{n(gc.kms, 1)} km</Text>
                  <Text style={[base.tableCell, { flex: 0.8, color: gc.excesos > 0 ? COLORS.rojo : COLORS.negro }]}>{gc.excesos}</Text>
                  <Text style={[base.tableCell, { flex: 0.8, color: gc.frenadas > 0 ? COLORS.amarillo : COLORS.negro }]}>{gc.frenadas}</Text>
                  <Text style={[base.tableCell, { flex: 0.8, fontWeight: 700, color: gc.calificacion >= 90 ? COLORS.verde : gc.calificacion >= 70 ? COLORS.amarillo : COLORS.rojo }]}>{gc.calificacion}</Text>
                </View>
              ))}
            </View>
          )}

          {ghostEntities.vehiculos.length > 0 && (
            <View>
              <Band>4.2. VEHÍCULOS ACTIVOS PENDIENTES DE REGISTRAR EN GOOGLE SHEETS</Band>
              <View style={[base.tableHeader, { marginTop: 3 }]}>
                <Text style={[base.tableHeaderCell, { flex: 1.2, textAlign: 'left' }]}>Placa</Text>
                <Text style={[base.tableHeaderCell, { flex: 1.2 }]}>Km Recorridos</Text>
                <Text style={[base.tableHeaderCell, { flex: 1.0 }]}>Excesos</Text>
                <Text style={[base.tableHeaderCell, { flex: 1.0 }]}>Frenadas</Text>
                <Text style={[base.tableHeaderCell, { flex: 1.0 }]}>Horas Ralentí</Text>
                <Text style={[base.tableHeaderCell, { flex: 0.8 }]}>Cal.</Text>
              </View>
              {ghostEntities.vehiculos.map((gv, i) => (
                <View key={gv.id || i} style={[base.tableRow, i % 2 ? base.tableRowAlt : {}]} wrap={false}>
                  <Text style={[base.tableCell, { flex: 1.2, fontWeight: 700, textAlign: 'left' }]}>{gv.placa}</Text>
                  <Text style={{ flex: 1.2, fontSize: 5.8, textAlign: 'center' }}>{n(gv.kms, 1)} km</Text>
                  <Text style={[base.tableCell, { flex: 1.0, color: gv.excesos > 0 ? COLORS.rojo : COLORS.negro }]}>{gv.excesos}</Text>
                  <Text style={[base.tableCell, { flex: 1.0, color: gv.frenadas > 0 ? COLORS.amarillo : COLORS.negro }]}>{gv.frenadas}</Text>
                  <Text style={[base.tableCell, { flex: 1.0, color: gv.ralenti > 2 ? COLORS.amarillo : COLORS.negro }]}>{n(gv.ralenti, 1)} h</Text>
                  <Text style={[base.tableCell, { flex: 0.8, fontWeight: 700, color: gv.calificacion >= 90 ? COLORS.verde : gv.calificacion >= 70 ? COLORS.amarillo : COLORS.rojo }]}>{gv.calificacion}</Text>
                </View>
              ))}
            </View>
          )}
          <Text style={{ textAlign: 'center', fontSize: 6, fontWeight: 700, marginTop: 15, color: '#64748b' }}>*** FIN DEL CONSOLIDADO GLOBAL CORPORATIVO ***</Text>
        </Page>
      )}
    </Document>
  );
}

// ── Helpers de Descarga ──────────────────────────────────────────────────────────

export async function descargarPDFAnalisisContrato(
  contratosSeleccionados: ContratoOption[],
  filtro: { fechaInicio: string; fechaFin: string },
  metricas: any,
  vehiculosDetalle: any[]
): Promise<void> {
  const blob = await pdf(
    <InformeAnalisisContratoPDF
      contratosSeleccionados={contratosSeleccionados}
      filtro={filtro}
      metricas={metricas}
      vehiculosDetalle={vehiculosDetalle}
    />
  ).toBlob();
  const cName = contratosSeleccionados.length === 1 
    ? safeFileName(contratosSeleccionados[0].nombre) 
    : `multicontrato_${contratosSeleccionados.length}`;
  downloadBlob(blob, `Analisis_Gerencial_Contrato_${cName}_${filtro.fechaInicio}.pdf`);
}

export async function descargarPDFConsolidadoGlobal(
  consolidadoGlobal: any[],
  metricasGlobales: any,
  ghostEntities: { conductores: any[]; vehiculos: any[] },
  filtro: { fechaInicio: string; fechaFin: string }
): Promise<void> {
  const blob = await pdf(
    <InformeConsolidadoGlobalPDF
      consolidadoGlobal={consolidadoGlobal}
      metricasGlobales={metricasGlobales}
      ghostEntities={ghostEntities}
      filtro={filtro}
    />
  ).toBlob();
  downloadBlob(blob, `Consolidado_Global_Corporativo_${filtro.fechaInicio}.pdf`);
}

export interface RalentiPDFData {
  periodoLabel: string;
  periodoInicio: string;
  periodoFin: string;
  fechaReporte: string;
  pctRalenti: number;
  totalHorasMotorEncendido: number;
  totalHorasMotorRalenti: number;
  totalGalonesConsumidos: number;
  totalRalentisExcesivos: number;
  totalVehiculosEvaluados?: number;
  totalEventos: number;
  costTotal: number;
  costAvgDaily: number;
  co2Kg: number;
  treesEquivalent: number;
  mayorEventoSegundos: number;
  mayorEventoConductor?: string;
  promedioEventoSegundos: number;
  eventosMas30Min: number;
  riskLevel: 'Bajo' | 'Medio' | 'Alto';
  fapRisk: string;
  topByTime: Array<{ name: string; totalTime: number; count: number; maxEvent: number }>;
  topByMax: Array<{ name: string; totalTime: number; count: number; maxEvent: number }>;
  providerCO2: Array<{ name: string; co2Tons: number }>;
  dailyCO2Trend: Array<{ date: string; value: number }>;
  contratoNombre?: string;
  clienteNombre?: string;
  tiposNombre?: string;
  placaCritica?: string;
  tiempoCriticaSegundos?: number;
  fapProbability?: number;
  horasRalentiMas5Min?: number;
  pctRalentiMas5MinDeRalenti?: number;
  pctRalentiMas5MinDeEncendido?: number;
}

const EMERALD = '#059669';
const EMERALD_BG = '#d1fae5';
const EMERALD_LIGHT = '#ecfdf5';

function fmtSecs(totalSecs: number): string {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = Math.floor(totalSecs % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtCOP(value: number): string {
  return `$${value.toLocaleString('es-CO', { maximumFractionDigits: 0 })} COP`;
}

function RalentiBand({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: COLORS.azul, padding: '3 8', marginBottom: 4 }}>
      <Text style={{ fontSize: 6.5, fontWeight: 700, color: COLORS.blanco }}>{children}</Text>
    </View>
  );
}

function RalentiMetricRow({ label, value, alt }: { label: string; value: string; alt: boolean }) {
  return (
    <View style={[base.tableRow, alt ? base.tableRowAlt : {}, { paddingVertical: 3 }]}>
      <Text style={[base.tableCell, { flex: 2.5, textAlign: 'left', paddingLeft: 4 }]}>{label}</Text>
      <Text style={[base.tableCell, { flex: 1.2, fontWeight: 700, textAlign: 'right', paddingRight: 4 }]}>{value}</Text>
    </View>
  );
}

// Helper: Card for KPI on Page 1
function Page1KpiCard({
  title,
  value,
  subText,
  valueColor = COLORS.negro,
  infoText,
}: {
  title: string;
  value: string;
  subText?: string;
  valueColor?: string;
  infoText?: string;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: '#ffffff', borderRadius: 4, padding: 7, borderWidth: 0.5, borderColor: '#cbd5e1', borderStyle: 'solid', minHeight: 96, justifyContent: 'space-between' }} wrap={false}>
      <View>
        <Text style={{ fontSize: 7.5, fontWeight: 'bold', color: COLORS.gris, textTransform: 'uppercase', marginBottom: 2 }}>{title}</Text>
        <Text style={{ fontSize: 15, fontWeight: 'bold', color: valueColor, marginBottom: 2 }}>{value}</Text>
        {subText ? <Text style={{ fontSize: 6.8, color: COLORS.gris, marginBottom: 3 }}>{subText}</Text> : null}
      </View>
      {infoText && (
        <Text style={{ fontSize: 6, color: COLORS.gris, borderTopWidth: 0.5, borderTopColor: '#e2e8f0', paddingTop: 3, marginTop: 2 }}>
          {infoText}
        </Text>
      )}
    </View>
  );
}

// Helper: Alert box for executive summary on Page 1
function GerencialSummaryBox({ contratoNombre, clienteNombre, tiposNombre }: { contratoNombre: string; clienteNombre: string; tiposNombre: string }) {
  return (
    <View style={{ backgroundColor: '#f8fafc', borderWidth: 0.5, borderColor: '#cbd5e1', borderStyle: 'solid', borderRadius: 4, padding: 8, marginBottom: 8 }} wrap={false}>
      <Text style={{ fontSize: 8, fontWeight: 'bold', color: COLORS.azul, marginBottom: 4, textTransform: 'uppercase' }}>
        Resumen Operativo
      </Text>
      <Text style={{ fontSize: 7, color: COLORS.gris, marginBottom: 1 }}>
        Informe generado para el cliente/grupo:
      </Text>
      <Text style={{ fontSize: 11, fontWeight: 'bold', color: COLORS.negro, marginBottom: 4 }}>
        {clienteNombre}
      </Text>
      <Text style={{ fontSize: 7, color: COLORS.negro, lineHeight: 1.5, textAlign: 'justify' }}>
        Contratos: {contratoNombre}. El análisis comprende los siguientes tipos de vehículo: {tiposNombre}.
      </Text>
    </View>
  );
}

// Helper: Page 1 Data Key Cell
function Page1DataKeyCard({ label, value, sub, sub2 }: { label: string; value: string; sub?: string; sub2?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc', borderWidth: 0.5, borderColor: '#cbd5e1', borderStyle: 'solid', borderRadius: 4, padding: 8, minHeight: 52, justifyContent: 'space-between' }} wrap={false}>
      <View>
        <Text style={{ fontSize: 6.8, fontWeight: 'bold', color: COLORS.gris, textTransform: 'uppercase', marginBottom: 3 }}>{label}</Text>
        <Text style={{ fontSize: 13, fontWeight: 'bold', color: COLORS.negro }}>{value}</Text>
      </View>
      <View style={{ marginTop: 2 }}>
        {sub && <Text style={{ fontSize: 6.5, color: COLORS.gris }}>{sub}</Text>}
        {sub2 && <Text style={{ fontSize: 6.5, color: COLORS.negro, fontWeight: 'bold' }}>{sub2}</Text>}
      </View>
    </View>
  );
}

// Helper: Page 1 Critical Vehicle Card
function CriticalVehicleCard({ placa, tiempoSegundos, totalHorasRalentiFlota }: { placa: string; tiempoSegundos: number; totalHorasRalentiFlota: number }) {
  const tiempoHoras = tiempoSegundos / 3600;
  const pctOfFlota = totalHorasRalentiFlota > 0 ? (tiempoHoras / totalHorasRalentiFlota) * 100 : 0;
  return (
    <View style={{ backgroundColor: '#fff7ed', borderWidth: 0.5, borderColor: '#fed7aa', borderStyle: 'dashed', borderRadius: 4, padding: 8, marginTop: 6 }} wrap={false}>
      <Text style={{ fontSize: 8.5, fontWeight: 'bold', color: '#c2410c', textTransform: 'uppercase', marginBottom: 4 }}>Vehículo Crítico con Mayor Ralentí</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#7c2d12' }}>Placa: {placa}</Text>
          <Text style={{ fontSize: 6.8, color: '#9a3412', marginTop: 2 }}>Concentra el {pctOfFlota.toFixed(1)}% del ralentí total de la flota</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 12.5, fontWeight: 'bold', color: '#7c2d12' }}>{tiempoHoras.toFixed(1)} Horas</Text>
          <Text style={{ fontSize: 6.8, color: '#9a3412' }}>Acumuladas en ralentí</Text>
        </View>
      </View>
    </View>
  );
}

// Helper: Page 1 Impact Panel
const DRIVER_BAR_GRADIENT = [
  '#b91c1c', // 1 - rojo intenso
  '#dc2626', // 2 - rojo
  '#ea580c', // 3 - naranja-rojo
  '#f97316', // 4 - naranja
  '#fb923c', // 5 - naranja suave
  '#f59e0b', // 6 - ámbar
  '#d97706', // 7 - ámbar oscuro
  '#ca8a04', // 8 - ámbar-amarillo
  '#eab308', // 9 - amarillo
  '#facc15', // 10 - amarillo claro
];

function Page2DriverBarChart({
  title,
  data,
  type,
}: {
  title: string;
  data: Array<{ name: string; totalTime: number; count: number; maxEvent: number }>;
  type: 'total' | 'max';
}) {
  const maxVal = Math.max(...data.map(d => type === 'total' ? d.totalTime : d.maxEvent), 1);
  return (
    <View style={{ flex: 1, backgroundColor: '#ffffff', borderWidth: 0.5, borderColor: '#cbd5e1', borderStyle: 'solid', borderRadius: 4, padding: 8 }} wrap={false}>
      <Text style={{ fontSize: 8.5, fontWeight: 'bold', color: COLORS.azul, marginBottom: 5, textTransform: 'uppercase' }}>{title}</Text>

      {data.length === 0 ? (
        <Text style={{ fontSize: 8, color: COLORS.gris, textAlign: 'center', marginVertical: 20 }}>No se registran datos en este período</Text>
      ) : (
        data.slice(0, 10).map((d, idx) => {
          const val = type === 'total' ? d.totalTime : d.maxEvent;
          const barPct = (val / maxVal) * 100;
          const barColor = DRIVER_BAR_GRADIENT[idx] ?? DRIVER_BAR_GRADIENT[9];

          return (
            <View key={idx} style={{ marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1.5, alignItems: 'flex-start' }}>
                <Text style={{ fontSize: 6.8, fontWeight: 'bold', color: COLORS.negro, flex: 1, marginRight: 5 }}>
                  {idx + 1}. {d.name}
                </Text>
                <Text style={{ fontSize: 6.8, fontWeight: 'bold', color: barColor }}>
                  {fmtSecs(val)}
                </Text>
              </View>
              <View style={{ height: 8, backgroundColor: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                <View style={{ width: `${Math.min(100, Math.max(1, barPct))}%`, height: '100%', backgroundColor: barColor }} />
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

// Helper: Page 2 Interpretation Box
function Page2InterpretationBox({ topByTime, topByMax }: { topByTime: any[]; topByMax: any[] }) {
  const driverTime = topByTime[0]?.name ?? 'N/A';
  const driverMax = topByMax[0]?.name ?? 'N/A';
  const timeStr = topByTime[0] ? fmtSecs(topByTime[0].totalTime) : '00:00:00';
  const maxStr = topByMax[0] ? fmtSecs(topByMax[0].maxEvent) : '00:00:00';

  return (
    <View style={{ backgroundColor: '#f8fafc', borderWidth: 0.5, borderColor: '#cbd5e1', borderStyle: 'solid', borderRadius: 4, padding: 6 }} wrap={false}>
      <Text style={{ fontSize: 6.8, fontWeight: 'bold', color: COLORS.azul, marginBottom: 2 }}>ANÁLISIS DE COMPORTAMIENTO DE CONDUCTORES</Text>
      <Text style={{ fontSize: 6, lineHeight: 1.3, color: COLORS.negro }}>
        El gráfico superior izquierdo clasifica a los conductores según su tiempo acumulado en ralentí, identificando a aquellos que generan el mayor desperdicio continuo de combustible. El conductor <Text style={{ fontWeight: 'bold' }}>{driverTime}</Text> lidera esta lista con un acumulado de <Text style={{ fontWeight: 'bold', color: COLORS.rojo }}>{timeStr}</Text>.
      </Text>
      <Text style={{ fontSize: 6, lineHeight: 1.3, color: COLORS.negro, marginTop: 3 }}>
        El gráfico de la derecha muestra el evento individual más prolongado registrado por conductor. El mayor evento único fue registrado por <Text style={{ fontWeight: 'bold' }}>{driverMax}</Text> con una duración continua de <Text style={{ fontWeight: 'bold', color: COLORS.rojo }}>{maxStr}</Text>.
      </Text>
    </View>
  );
}

function CO2TrendSVGChart({ trendData }: { trendData: Array<{ date: string; value: number }> }) {
  if (!trendData || trendData.length < 2) {
    return (
      <View style={{ height: 110, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc', borderWidth: 0.5, borderColor: '#cbd5e1', borderStyle: 'solid', borderRadius: 4 }} wrap={false}>
        <Text style={{ fontSize: 8.5, color: COLORS.gris }}>Sin datos de tendencia para graficar</Text>
      </View>
    );
  }

  // trendData.value is already cumulative CO2 in kg — do NOT re-accumulate
  const n = trendData.length;
  const values = trendData.map(d => d.value);

  // ── Linear regression forecast ──────────────────────────────────────────────
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((s, v) => s + v, 0) / n;
  const denom = values.reduce((s, _, i) => s + Math.pow(i - meanX, 2), 0);
  const slope = denom > 0
    ? values.reduce((s, v, i) => s + (i - meanX) * (v - meanY), 0) / denom
    : 0;
  const intercept = meanY - slope * meanX;

  const FORECAST_STEPS = 3;
  const forecastVals = Array.from({ length: FORECAST_STEPS }, (_, k) =>
    Math.max(values[n - 1], intercept + slope * (n + k))
  );

  const allVals = [...values, ...forecastVals];
  const chartMax = Math.max(...allVals, 1);
  const totalPts = n + FORECAST_STEPS;

  // ── SVG dimensions ──────────────────────────────────────────────────────────
  const SVG_W = 470;
  const SVG_H = 108;
  const PAD_L = 4;
  const PAD_R = 10;
  const PAD_T = 14;
  const PAD_B = 8;
  const YAXIS_W = 38;

  const xOf = (i: number) => PAD_L + (i / (totalPts - 1)) * (SVG_W - PAD_L - PAD_R);
  const yOf = (v: number) => PAD_T + (1 - v / chartMax) * (SVG_H - PAD_T - PAD_B);

  const pts = trendData.map((d, i) => ({ x: xOf(i), y: yOf(d.value), val: d.value, label: d.date }));
  const fPts = forecastVals.map((v, k) => ({ x: xOf(n + k), y: yOf(v), val: v }));

  // Paths
  const mainD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaD = `${mainD} L ${pts[n - 1].x.toFixed(1)} ${(SVG_H - PAD_B).toFixed(1)} L ${pts[0].x.toFixed(1)} ${(SVG_H - PAD_B).toFixed(1)} Z`;
  const forecastD = [`M ${pts[n - 1].x.toFixed(1)} ${pts[n - 1].y.toFixed(1)}`, ...fPts.map(fp => `L ${fp.x.toFixed(1)} ${fp.y.toFixed(1)}`)].join(' ');
  const regressionD = (() => {
    const rx0 = PAD_L;
    const rxN = xOf(totalPts - 1);
    const ry0 = yOf(Math.max(0, intercept + slope * 0));
    const ryN = yOf(Math.max(0, intercept + slope * (totalPts - 1)));
    return `M ${rx0.toFixed(1)} ${ry0.toFixed(1)} L ${rxN.toFixed(1)} ${ryN.toFixed(1)}`;
  })();

  // Y-axis ticks (5 levels)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(pct => ({
    val: Math.round(chartMax * pct),
    y: yOf(chartMax * pct),
  }));

  // X-axis label indices: first, every ~3rd, last historical, all forecast
  const xLabelIdxs: number[] = [0];
  const step = Math.max(1, Math.floor(n / 4));
  for (let i = step; i < n - 1; i += step) xLabelIdxs.push(i);
  xLabelIdxs.push(n - 1);

  // Stats
  const firstVal = values[0];
  const lastVal = values[n - 1];
  const dailyAvg = n > 1 ? (lastVal - firstVal) / (n - 1) : lastVal;
  const projFinal = forecastVals[FORECAST_STEPS - 1];
  const fmtKg = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k kg` : `${Math.round(v)} kg`;

  return (
    <View style={{ borderWidth: 0.5, borderColor: '#cbd5e1', borderStyle: 'solid', borderRadius: 4, padding: 8, backgroundColor: '#ffffff', marginBottom: 6 }} wrap={false}>

      {/* ── Header ── */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <View>
          <Text style={{ fontSize: 8.5, fontWeight: 'bold', color: COLORS.azul, textTransform: 'uppercase' }}>
            Tendencia de Emisión de CO2 Acumulado (kg)
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <View style={{ width: 12, height: 2, backgroundColor: COLORS.azul }} />
              <Text style={{ fontSize: 5.8, color: COLORS.gris }}>Histórico acumulado</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <View style={{ width: 12, height: 1.5, backgroundColor: '#60a5fa' }} />
              <Text style={{ fontSize: 5.8, color: COLORS.gris }}>Proyección regresión lineal</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <View style={{ width: 12, height: 0.8, backgroundColor: '#94a3b8' }} />
              <Text style={{ fontSize: 5.8, color: COLORS.gris }}>Recta de tendencia</Text>
            </View>
          </View>
        </View>
        <View style={{ backgroundColor: '#eff6ff', borderRadius: 3, padding: '3 6', borderWidth: 0.5, borderColor: '#bfdbfe', borderStyle: 'solid', alignItems: 'center' }}>
          <Text style={{ fontSize: 5.5, color: '#3b82f6', fontWeight: 'bold', textTransform: 'uppercase' }}>Proyección Al Cierre</Text>
          <Text style={{ fontSize: 9, fontWeight: 'bold', color: COLORS.azul }}>{Math.round(projFinal).toLocaleString('es-CO')} kg</Text>
          <Text style={{ fontSize: 5, color: COLORS.gris }}>+{Math.round(projFinal - lastVal).toLocaleString('es-CO')} kg vs hoy</Text>
        </View>
      </View>

      {/* ── Y-axis + SVG ── */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        {/* Y-axis label column */}
        <View style={{ width: YAXIS_W, height: SVG_H, justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 3, paddingTop: PAD_T - 5, paddingBottom: PAD_B - 2 }}>
          {yTicks.slice().reverse().map((t, i) => (
            <Text key={i} style={{ fontSize: 5.5, color: COLORS.gris, lineHeight: 1 }}>
              {t.val >= 10000 ? `${(t.val / 1000).toFixed(0)}k` : t.val >= 1000 ? `${(t.val / 1000).toFixed(1)}k` : String(t.val)}
            </Text>
          ))}
        </View>

        {/* SVG chart */}
        <Svg width={SVG_W} height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`}>
          {/* Grid lines */}
          {yTicks.slice(1, -1).map((t, i) => (
            <Line key={`g${i}`} x1={PAD_L} y1={t.y} x2={SVG_W - PAD_R} y2={t.y} stroke="#f1f5f9" strokeWidth={0.7} />
          ))}
          {/* Top grid */}
          <Line x1={PAD_L} y1={PAD_T} x2={SVG_W - PAD_R} y2={PAD_T} stroke="#f1f5f9" strokeWidth={0.7} />
          {/* Baseline */}
          <Line x1={PAD_L} y1={SVG_H - PAD_B} x2={SVG_W - PAD_R} y2={SVG_H - PAD_B} stroke="#cbd5e1" strokeWidth={1} />
          {/* Vertical separator historical/forecast */}
          <Line x1={pts[n - 1].x} y1={PAD_T} x2={pts[n - 1].x} y2={SVG_H - PAD_B} stroke="#dbeafe" strokeWidth={1} strokeDasharray="3 2" />

          {/* Regression line (full span, subtle) */}
          <Path d={regressionD} fill="none" stroke="#94a3b8" strokeWidth={0.8} strokeDasharray="3 3" />

          {/* Area fill */}
          <Path d={areaD} fill="#dbeafe" opacity={0.45} />

          {/* Forecast area */}
          <Path
            d={`M ${pts[n - 1].x.toFixed(1)} ${pts[n - 1].y.toFixed(1)} ${fPts.map(fp => `L ${fp.x.toFixed(1)} ${fp.y.toFixed(1)}`).join(' ')} L ${fPts[FORECAST_STEPS - 1].x.toFixed(1)} ${(SVG_H - PAD_B).toFixed(1)} L ${pts[n - 1].x.toFixed(1)} ${(SVG_H - PAD_B).toFixed(1)} Z`}
            fill="#dbeafe"
            opacity={0.2}
          />

          {/* Main historical line */}
          <Path d={mainD} fill="none" stroke={COLORS.azul} strokeWidth={2} />

          {/* Forecast dashed line */}
          <Path d={forecastD} fill="none" stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="4 2" />

          {/* Historical points */}
          {pts.map((p, i) => (
            <Circle key={`h${i}`} cx={p.x} cy={p.y} r={i === n - 1 ? 3.5 : 2.5} fill={COLORS.azul} stroke="#ffffff" strokeWidth={0.8} />
          ))}

          {/* Forecast points */}
          {fPts.map((fp, i) => (
            <Circle key={`f${i}`} cx={fp.x} cy={fp.y} r={2.5} fill="#60a5fa" stroke="#ffffff" strokeWidth={0.8} />
          ))}
        </Svg>
      </View>

      {/* ── X-axis labels with values (key points) ── */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginLeft: YAXIS_W + PAD_L, marginRight: PAD_R, marginTop: 3 }}>
        {xLabelIdxs.map((idx, i) => (
          <View key={i} style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 5.5, color: COLORS.gris, textAlign: 'center' }}>{trendData[idx].date}</Text>
            <Text style={{ fontSize: 6, fontWeight: 'bold', color: COLORS.azul, textAlign: 'center' }}>
              {fmtKg(values[idx])}
            </Text>
          </View>
        ))}
        {/* Forecast last point */}
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 5.5, color: '#3b82f6', textAlign: 'center' }}>+{FORECAST_STEPS}d proy.</Text>
          <Text style={{ fontSize: 6, fontWeight: 'bold', color: '#2563eb', textAlign: 'center' }}>
            {fmtKg(projFinal)}
          </Text>
        </View>
      </View>

      {/* ── Stats summary bar ── */}
      <View style={{ flexDirection: 'row', marginTop: 5, backgroundColor: '#f8fafc', borderRadius: 3, borderWidth: 0.5, borderColor: '#e2e8f0', borderStyle: 'solid' }}>
        {([
          { label: 'INICIO PERÍODO', val: fmtKg(firstVal), color: COLORS.negro },
          { label: 'TOTAL ACUMULADO', val: fmtKg(lastVal), color: COLORS.rojo },
          { label: 'PROMEDIO DIARIO', val: `${Math.round(dailyAvg).toLocaleString('es-CO')} kg/d`, color: COLORS.gris },
          { label: 'CRECIMIENTO', val: `+${fmtKg(lastVal - firstVal)}`, color: COLORS.naranja },
          { label: 'PROYECCIÓN CIERRE', val: fmtKg(projFinal), color: '#2563eb' },
        ] as Array<{ label: string; val: string; color: string }>).map((item, i, arr) => (
          <View key={i} style={{ flex: 1, alignItems: 'center', padding: '3 2', borderRightWidth: i < arr.length - 1 ? 0.5 : 0, borderRightColor: '#e2e8f0', borderStyle: 'solid' }}>
            <Text style={{ fontSize: 5, color: COLORS.gris, textTransform: 'uppercase', textAlign: 'center' }}>{item.label}</Text>
            <Text style={{ fontSize: 6.5, fontWeight: 'bold', color: item.color, textAlign: 'center', marginTop: 1 }}>{item.val}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// Helper: Page 3 Environmental Box
function Page3EnvironmentalBox({ co2Kg, treesEquivalent }: { co2Kg: number; treesEquivalent: number }) {
  const co2Tons = co2Kg / 1000;
  return (
    <View style={{ backgroundColor: '#ecfdf5', borderWidth: 0.5, borderColor: '#a7f3d0', borderStyle: 'solid', borderRadius: 4, padding: 8 }} wrap={false}>
      <Text style={{ fontSize: 8.5, fontWeight: 'bold', color: '#047857', marginBottom: 6, textTransform: 'uppercase' }}>
        Impacto Ambiental
      </Text>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <View style={{ flex: 1, backgroundColor: '#ffffff', borderRadius: 4, padding: 6, borderWidth: 0.5, borderColor: '#cbd5e1', borderStyle: 'solid', alignItems: 'center' }}>
          <Text style={{ fontSize: 13.5, fontWeight: 'bold', color: '#15803d' }}>{co2Tons.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Ton CO2</Text>
          <Text style={{ fontSize: 6.8, color: COLORS.gris, textTransform: 'uppercase', marginTop: 2 }}>Emisiones de CO2</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: '#ffffff', borderRadius: 4, padding: 6, borderWidth: 0.5, borderColor: '#cbd5e1', borderStyle: 'solid', alignItems: 'center' }}>
          <Text style={{ fontSize: 13.5, fontWeight: 'bold', color: '#16a34a' }}>{Math.ceil(treesEquivalent)} Árboles / Año</Text>
          <Text style={{ fontSize: 6.8, color: COLORS.gris, textTransform: 'uppercase', marginTop: 2 }}>Árboles necesarios para absorber este CO2</Text>
        </View>
      </View>
      <Text style={{ fontSize: 6.5, color: '#065f46', lineHeight: 1.3, marginTop: 6 }}>
        Nota ecológica: Un árbol absorbe 22 kg de CO2/año. El ralentí excesivo anula este beneficio ambiental.
      </Text>
    </View>
  );
}

function ProportionsCharts({ data }: { data: RalentiPDFData }) {
  const {
    totalHorasMotorEncendido = 0,
    totalHorasMotorRalenti = 0,
    horasRalentiMas5Min = 0,
    pctRalenti = 0,
    pctRalentiMas5MinDeRalenti = 0,
  } = data;

  // El ralentí está CONTENIDO dentro de las horas de motor encendido (no es un sumando
  // aparte). La base correcta es el tiempo de motor encendido; la porción "en movimiento"
  // es el remanente (encendido − ralentí). Así el donut coincide con el KPI (ralentí/encendido)
  // en lugar de diluirse al duplicar el ralentí en el denominador.
  const horasEnMovimiento = Math.max(totalHorasMotorEncendido - totalHorasMotorRalenti, 0);
  const pctRalentiChart = totalHorasMotorEncendido > 0 ? (totalHorasMotorRalenti / totalHorasMotorEncendido) * 100 : 0;
  const pctMovimientoChart = totalHorasMotorEncendido > 0 ? (horasEnMovimiento / totalHorasMotorEncendido) * 100 : 0;

  // Donut de dos colores dibujado con arcos SVG (Path). NOTA: react-pdf NO soporta
  // strokeDashoffset en <Circle>, por eso el arco de ralentí se traza como Path; así la
  // porción "en movimiento" (azul) queda visible como el complemento del ralentí (naranja).
  const cx = 57.5, cy = 57.5, r = 42;
  const fRalenti = Math.min(Math.max(pctRalentiChart / 100, 0), 1);
  const puntoEnCirculo = (frac: number): [number, number] => {
    const ang = (-90 + frac * 360) * (Math.PI / 180); // 0% arriba, sentido horario
    return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
  };
  const [ralIniX, ralIniY] = puntoEnCirculo(0);
  const [ralFinX, ralFinY] = puntoEnCirculo(fRalenti);
  const ralentiLargeArc = fRalenti > 0.5 ? 1 : 0;
  const ralentiArcPath = `M ${ralIniX.toFixed(2)} ${ralIniY.toFixed(2)} A ${r} ${r} 0 ${ralentiLargeArc} 1 ${ralFinX.toFixed(2)} ${ralFinY.toFixed(2)}`;
  // Casos extremos: 0% o 100% de ralentí no se pueden representar con un arco (inicio=fin).
  const ralentiEsCompleto = fRalenti >= 0.999;
  const ralentiEsNulo = fRalenti <= 0.001;

  return (
    <View style={{ marginBottom: 8, marginTop: 0 }} wrap={false}>
      <View style={{ flexDirection: 'row', gap: 10, borderWidth: 0.5, borderColor: '#cbd5e1', borderRadius: 4, padding: 8, backgroundColor: '#ffffff', minHeight: 100, alignItems: 'center' }}>

        {/* Left Column: Pie Chart (Donut) */}
        <View style={{ flex: 1.2, alignItems: 'center', justifyContent: 'center', borderRightWidth: 0.5, borderRightColor: '#e2e8f0', borderStyle: 'solid', paddingRight: 10 }}>
          <Text style={{ fontSize: 8.5, fontWeight: 'bold', color: COLORS.azul, marginBottom: 4 }}>% Tiempo Ralentí · Ralentí vs Horas Motor</Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {/* SVG Donut */}
            <View style={{ width: 92, height: 92, position: 'relative', justifyContent: 'center', alignItems: 'center' }}>
              <Svg width={92} height={92} viewBox="0 0 115 115" style={{ width: 92, height: 92 }}>
                {/* Anillo de fondo = Tiempo en Movimiento (azul). Cubre todo el círculo;
                    el arco de ralentí (naranja) se superpone solo sobre su porción. */}
                <Circle
                  cx="57.5"
                  cy="57.5"
                  r="42"
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="18"
                />
                {/* Arco de ralentí (naranja) sobre su fracción real. */}
                {!ralentiEsNulo && (
                  ralentiEsCompleto ? (
                    <Circle cx="57.5" cy="57.5" r="42" fill="none" stroke="#f97316" strokeWidth="18" />
                  ) : (
                    <Path d={ralentiArcPath} fill="none" stroke="#f97316" strokeWidth="18" />
                  )
                )}
                {/* Máscara central para formar el agujero del donut. */}
                <Circle cx="57.5" cy="57.5" r="32" fill="#ffffff" />
              </Svg>
              <View style={{ position: 'absolute', width: 92, height: 92, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ fontSize: 11.5, fontWeight: 'bold', color: COLORS.negro }}>{pctRalentiChart.toFixed(0)}%</Text>
                <Text style={{ fontSize: 5, color: COLORS.gris, textTransform: 'uppercase', fontWeight: 'bold', marginTop: 1 }}>Ralentí</Text>
              </View>
            </View>

            {/* Legends */}
            <View style={{ gap: 6 }}>
              {/* Base 100%: total de horas de motor encendido */}
              <View>
                <Text style={{ fontSize: 6, color: COLORS.gris, textTransform: 'uppercase', fontWeight: 'bold' }}>Total Horas Motor Encendido</Text>
                <Text style={{ fontSize: 9, fontWeight: 'bold', color: COLORS.azul, marginTop: 1 }}>{totalHorasMotorEncendido.toFixed(1)} h (100%)</Text>
                <Text style={{ fontSize: 5, color: COLORS.gris, marginTop: 0.5 }}>Base de cálculo · suma de las dos porciones</Text>
              </View>
              <View style={{ height: 0.5, backgroundColor: '#e2e8f0', marginVertical: 1 }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 8, height: 8, backgroundColor: '#3b82f6', borderRadius: 2 }} />
                <View>
                  <Text style={{ fontSize: 6, color: COLORS.gris, textTransform: 'uppercase', fontWeight: 'bold' }}>Tiempo en Movimiento</Text>
                  <Text style={{ fontSize: 7.5, fontWeight: 'bold', color: COLORS.negro, marginTop: 1 }}>{horasEnMovimiento.toFixed(1)} h ({pctMovimientoChart.toFixed(0)}%)</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 8, height: 8, backgroundColor: '#f97316', borderRadius: 2 }} />
                <View>
                  <Text style={{ fontSize: 6, color: COLORS.gris, textTransform: 'uppercase', fontWeight: 'bold' }}>Ralentí Tiempo Total</Text>
                  <Text style={{ fontSize: 7.5, fontWeight: 'bold', color: COLORS.negro, marginTop: 1 }}>{totalHorasMotorRalenti.toFixed(1)} h ({pctRalentiChart.toFixed(0)}%)</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Right Column: Horizontal Bar Chart */}
        <View style={{ flex: 1, justifyContent: 'center', paddingLeft: 10 }}>
          <Text style={{ fontSize: 8.5, fontWeight: 'bold', color: COLORS.azul, marginBottom: 6, textAlign: 'center' }}>Ralentí superior a 5 minutos</Text>
          
          <View style={{ gap: 8 }}>
            {/* Bar 1: Total Idle */}
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                <Text style={{ fontSize: 6.8, color: COLORS.gris, fontWeight: 'bold', textTransform: 'uppercase' }}>Ralentí Tiempo Total</Text>
                <Text style={{ fontSize: 7.5, fontWeight: 'bold', color: '#f97316' }}>{totalHorasMotorRalenti.toFixed(1)} h</Text>
              </View>
              <View style={{ height: 14, backgroundColor: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                <View style={{ width: '100%', height: '100%', backgroundColor: '#f97316' }} />
              </View>
            </View>

            {/* Bar 2: Idle > 5 min */}
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                <Text style={{ fontSize: 6.8, color: COLORS.gris, fontWeight: 'bold', textTransform: 'uppercase' }}>Total T. Ralentí &gt; 5 min</Text>
                <Text style={{ fontSize: 7.5, fontWeight: 'bold', color: '#c2410c' }}>{horasRalentiMas5Min.toFixed(1)} h ({pctRalentiMas5MinDeRalenti.toFixed(0)}%)</Text>
              </View>
              <View style={{ height: 14, backgroundColor: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                <View style={{ width: `${pctRalentiMas5MinDeRalenti}%`, height: '100%', backgroundColor: '#c2410c' }} />
              </View>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

function OperationalSummaryTable({ data }: { data: RalentiPDFData }) {
  const {
    pctRalenti = 0,
    totalGalonesConsumidos = 0,
    costAvgDaily = 0,
    riskLevel = 'Bajo',
  } = data;

  const deltaPct = pctRalenti - 10;
  const deltaGalones = totalGalonesConsumidos - 37;
  const deltaCostoDiario = costAvgDaily - 28000;

  return (
    <View style={{ marginBottom: 5 }} wrap={false}>
      <View style={{ backgroundColor: COLORS.azul, padding: '4 8', marginBottom: 4 }}>
        <Text style={{ fontSize: 7.5, fontWeight: 700, color: COLORS.blanco }}>1. RESUMEN DE DESVIACIONES</Text>
      </View>
      <View style={{ border: '0.5px solid #cbd5e1', borderRadius: 4, overflow: 'hidden' }}>
        {/* Header */}
        <View style={[base.tableRow, { backgroundColor: COLORS.azul, borderBottomWidth: 0.5, borderBottomColor: '#cbd5e1', paddingVertical: 3.5 }]}>
          <Text style={[base.tableHeaderCell, { flex: 2, textAlign: 'left', paddingLeft: 8, fontWeight: 700, fontSize: 7.5 }]}>Indicador</Text>
          <Text style={[base.tableHeaderCell, { flex: 1.2, fontWeight: 700, fontSize: 7.5 }]}>Resultado</Text>
          <Text style={[base.tableHeaderCell, { flex: 1, fontWeight: 700, fontSize: 7.5 }]}>Metas</Text>
          <Text style={[base.tableHeaderCell, { flex: 2.5, textAlign: 'right', paddingRight: 8, fontWeight: 700, fontSize: 7.5 }]}>Desviación</Text>
        </View>

        {/* Row 1 */}
        <View style={[base.tableRow, { paddingVertical: 3.5 }]}>
          <Text style={[base.tableCell, { flex: 2, textAlign: 'left', paddingLeft: 8, fontSize: 6.8, fontWeight: 700 }]}>% Tiempo en ralentí (sobre motor encendido)</Text>
          <Text style={[base.tableCell, { flex: 1.2, fontSize: 6.8, fontWeight: 700 }]}>{pctRalenti.toFixed(1)}%</Text>
          <Text style={[base.tableCell, { flex: 1, fontSize: 6.8 }]}>&lt; 10%</Text>
          <Text style={[base.tableCell, { flex: 2.5, textAlign: 'right', paddingRight: 8, fontSize: 6.8, fontWeight: 700, color: deltaPct > 0 ? COLORS.rojo : COLORS.verde }]}>
            {deltaPct > 0 ? `+${deltaPct.toFixed(1)}% sobre meta` : `${deltaPct.toFixed(1)}% bajo meta`}
          </Text>
        </View>

        {/* Row 2 */}
        <View style={[base.tableRow, base.tableRowAlt, { paddingVertical: 3.5 }]}>
          <Text style={[base.tableCell, { flex: 2, textAlign: 'left', paddingLeft: 8, fontSize: 6.8, fontWeight: 700 }]}>Galones consumidos en ralentí</Text>
          <Text style={[base.tableCell, { flex: 1.2, fontSize: 6.8, fontWeight: 700 }]}>{totalGalonesConsumidos.toFixed(1)} gal</Text>
          <Text style={[base.tableCell, { flex: 1, fontSize: 6.8 }]}>&lt; 37 gal</Text>
          <Text style={[base.tableCell, { flex: 2.5, textAlign: 'right', paddingRight: 8, fontSize: 6.8, fontWeight: 700, color: deltaGalones > 0 ? COLORS.rojo : COLORS.verde }]}>
            {deltaGalones > 0 ? `${deltaGalones.toFixed(1)} gal sobre meta` : `${Math.abs(deltaGalones).toFixed(1)} gal bajo meta`}
          </Text>
        </View>

        {/* Row 3 */}
        <View style={[base.tableRow, { paddingVertical: 3.5 }]}>
          <Text style={[base.tableCell, { flex: 2, textAlign: 'left', paddingLeft: 8, fontSize: 6.8, fontWeight: 700 }]}>Impacto económico estimado</Text>
          <Text style={[base.tableCell, { flex: 1.2, fontSize: 6.8, fontWeight: 700 }]}>${costAvgDaily.toLocaleString('es-CO', { maximumFractionDigits: 0 })}/día</Text>
          <Text style={[base.tableCell, { flex: 1, fontSize: 6.8 }]}>&lt; $28,000</Text>
          <Text style={[base.tableCell, { flex: 2.5, textAlign: 'right', paddingRight: 8, fontSize: 6.8, fontWeight: 700, color: deltaCostoDiario > 0 ? COLORS.rojo : COLORS.verde }]}>
            {deltaCostoDiario > 0 ? `$ ${deltaCostoDiario.toLocaleString('es-CO', { maximumFractionDigits: 0 })} sobre meta` : `$ ${Math.abs(deltaCostoDiario).toLocaleString('es-CO', { maximumFractionDigits: 0 })} bajo meta`}
          </Text>
        </View>

        {/* Row 4 */}
        <View style={[base.tableRow, base.tableRowAlt, { paddingVertical: 3.5 }]}>
          <Text style={[base.tableCell, { flex: 2, textAlign: 'left', paddingLeft: 8, fontSize: 6.8, fontWeight: 700 }]}>Riesgo operacional</Text>
          <Text style={[base.tableCell, { flex: 1.2, fontSize: 6.8, fontWeight: 700, textTransform: 'uppercase' }]}>{riskLevel}</Text>
          <Text style={[base.tableCell, { flex: 1, fontSize: 6.8 }]}>BAJO</Text>
          <Text style={[base.tableCell, { flex: 2.5, textAlign: 'right', paddingRight: 8, fontSize: 6.8, fontWeight: 700, color: riskLevel === 'Alto' ? COLORS.rojo : riskLevel === 'Medio' ? COLORS.naranja : COLORS.verde }]}>
            {riskLevel === 'Bajo' ? 'En meta' : 'Desviado'}
          </Text>
        </View>
      </View>
    </View>
  );
}

function KeyDataInterpretationTable({ data, daysInPeriod }: { data: RalentiPDFData; daysInPeriod: number }) {
  const {
    horasRalentiMas5Min = 0,
    mayorEventoSegundos = 0,
    eventosMas30Min = 0,
    tiempoCriticaSegundos = 0,
    placaCritica = 'NINGUNO',
  } = data;

  const totalHrs = horasRalentiMas5Min;
  const avgSecsDaily = (horasRalentiMas5Min * 3600) / daysInPeriod;

  return (
    <View style={{ marginBottom: 5 }} wrap={false}>
      <View style={{ backgroundColor: COLORS.azul, padding: '4 8', marginBottom: 4 }}>
        <Text style={{ fontSize: 7.5, fontWeight: 700, color: COLORS.blanco }}>1. DATOS CLAVE CON INTERPRETACIÓN</Text>
      </View>
      <View style={{ border: '0.5px solid #cbd5e1', borderRadius: 4, overflow: 'hidden' }}>
        {/* Header */}
        <View style={[base.tableRow, { backgroundColor: COLORS.azul, borderBottomWidth: 0.5, borderBottomColor: '#cbd5e1', paddingVertical: 3.5 }]}>
          <Text style={[base.tableHeaderCell, { flex: 1.8, textAlign: 'left', paddingLeft: 8, fontWeight: 700, fontSize: 7.5 }]}>Métrica</Text>
          <Text style={[base.tableHeaderCell, { flex: 0.8, fontWeight: 700, fontSize: 7.5 }]}>Valor</Text>
          <Text style={[base.tableHeaderCell, { flex: 2.4, textAlign: 'left', paddingLeft: 8, fontWeight: 700, fontSize: 7.5 }]}>Interpretación Operativa</Text>
        </View>

        {/* Row 1 */}
        <View style={[base.tableRow, { paddingVertical: 3.5 }]}>
          <Text style={[base.tableCell, { flex: 1.8, textAlign: 'left', paddingLeft: 8, fontSize: 6.8, fontWeight: 700 }]}>Total horas ralentí &gt; 5 min</Text>
          <Text style={[base.tableCell, { flex: 0.8, fontSize: 6.8, fontWeight: 700 }]}>{fmtSecs(totalHrs * 3600)}</Text>
          <Text style={[base.tableCell, { flex: 2.4, textAlign: 'left', paddingLeft: 8, fontSize: 6.8, color: COLORS.gris }]}>
            Equivale a {(totalHrs / 24).toFixed(1)} días continuos de motor encendido innecesario.
          </Text>
        </View>

        {/* Row 2 */}
        <View style={[base.tableRow, base.tableRowAlt, { paddingVertical: 3.5 }]}>
          <Text style={[base.tableCell, { flex: 1.8, textAlign: 'left', paddingLeft: 8, fontSize: 6.8, fontWeight: 700 }]}>Mayor evento de ralentí</Text>
          <Text style={[base.tableCell, { flex: 0.8, fontSize: 6.8, fontWeight: 700 }]}>{fmtSecs(mayorEventoSegundos)}</Text>
          <Text style={[base.tableCell, { flex: 2.4, textAlign: 'left', paddingLeft: 8, fontSize: 6.8, color: COLORS.gris }]}>
            {(mayorEventoSegundos / 3600).toFixed(1)} horas continuas sin generar valor operativo.
          </Text>
        </View>

        {/* Row 3 */}
        <View style={[base.tableRow, { paddingVertical: 3.5 }]}>
          <Text style={[base.tableCell, { flex: 1.8, textAlign: 'left', paddingLeft: 8, fontSize: 6.8, fontWeight: 700 }]}>Promedio ralentí &gt; 5 min/día</Text>
          <Text style={[base.tableCell, { flex: 0.8, fontSize: 6.8, fontWeight: 700 }]}>{fmtSecs(avgSecsDaily)}</Text>
          <Text style={[base.tableCell, { flex: 2.4, textAlign: 'left', paddingLeft: 8, fontSize: 6.8, color: COLORS.gris }]}>
            {(totalHrs / daysInPeriod).toFixed(1)} horas diarias de inactividad acumulada.
          </Text>
        </View>

        {/* Row 4 */}
        <View style={[base.tableRow, base.tableRowAlt, { paddingVertical: 3.5 }]}>
          <Text style={[base.tableCell, { flex: 1.8, textAlign: 'left', paddingLeft: 8, fontSize: 6.8, fontWeight: 700 }]}>Eventos con ralentí &gt; 30 min</Text>
          <Text style={[base.tableCell, { flex: 0.8, fontSize: 6.8, fontWeight: 700 }]}>{eventosMas30Min}</Text>
          <Text style={[base.tableCell, { flex: 2.4, textAlign: 'left', paddingLeft: 8, fontSize: 6.8, color: COLORS.gris }]}>
            Eventos de severidad crítica con alto riesgo mecánico.
          </Text>
        </View>

        {/* Row 5 */}
        <View style={[base.tableRow, { paddingVertical: 3.5 }]}>
          <Text style={[base.tableCell, { flex: 1.8, textAlign: 'left', paddingLeft: 8, fontSize: 6.8, fontWeight: 700 }]}>Mayor ralentí en un vehículo</Text>
          <Text style={[base.tableCell, { flex: 0.8, fontSize: 6.8, fontWeight: 700 }]}>{fmtSecs(tiempoCriticaSegundos)}</Text>
          <Text style={[base.tableCell, { flex: 2.4, textAlign: 'left', paddingLeft: 8, fontSize: 6.8, color: COLORS.gris }]}>
            {(tiempoCriticaSegundos / 3600).toFixed(1)} horas acumuladas (Vehículo: {placaCritica}).
          </Text>
        </View>
      </View>
    </View>
  );
}

function DetailedImpactTable({ data, daysInPeriod }: { data: RalentiPDFData; daysInPeriod: number }) {
  const {
    totalGalonesConsumidos = 0,
    costTotal = 0,
    fapRisk = 'Bajo',
    fapProbability = 15,
    costAvgDaily = 0,
    co2Kg = 0,
    treesEquivalent = 0,
  } = data;

  return (
    <View style={{ marginBottom: 4 }} wrap={false}>
      <View style={{ backgroundColor: COLORS.azul, padding: '4 8', marginBottom: 4 }}>
        <Text style={{ fontSize: 7.5, fontWeight: 700, color: COLORS.blanco }}>3. IMPACTO FINANCIERO Y AMBIENTAL DETALLADO</Text>
      </View>
      <View style={{ border: '0.5px solid #cbd5e1', borderRadius: 4, overflow: 'hidden' }}>
        {/* Header */}
        <View style={[base.tableRow, { backgroundColor: COLORS.azul, borderBottomWidth: 0.5, borderBottomColor: '#cbd5e1', paddingVertical: 3.5 }]}>
          <Text style={[base.tableHeaderCell, { flex: 1.8, textAlign: 'left', paddingLeft: 8, fontWeight: 700, fontSize: 7.5 }]}>Concepto</Text>
          <Text style={[base.tableHeaderCell, { flex: 1, fontWeight: 700, fontSize: 7.5 }]}>Valor</Text>
          <Text style={[base.tableHeaderCell, { flex: 2.2, textAlign: 'right', paddingRight: 8, fontWeight: 700, fontSize: 7.5 }]}>Valoración</Text>
        </View>

        {/* Row 1 */}
        <View style={[base.tableRow, { paddingVertical: 3.5 }]}>
          <Text style={[base.tableCell, { flex: 1.8, textAlign: 'left', paddingLeft: 8, fontSize: 6.8, fontWeight: 700 }]}>Combustible consumido en ralentí</Text>
          <Text style={[base.tableCell, { flex: 1, fontSize: 6.8, fontWeight: 700 }]}>{totalGalonesConsumidos.toFixed(1)} gal</Text>
          <Text style={[base.tableCell, { flex: 2.2, textAlign: 'right', paddingRight: 8, fontSize: 6.8, fontWeight: 700, color: COLORS.rojo }]}>
            ${costTotal.toLocaleString('es-CO', { maximumFractionDigits: 0 })} COP
          </Text>
        </View>

        {/* Row 2 */}
        <View style={[base.tableRow, base.tableRowAlt, { paddingVertical: 3.5 }]}>
          <Text style={[base.tableCell, { flex: 1.8, textAlign: 'left', paddingLeft: 8, fontSize: 6.8, fontWeight: 700 }]}>Probabilidad falla FAP/AdBlue</Text>
          <Text style={[base.tableCell, { flex: 1, fontSize: 6.8, fontWeight: 700 }]}>{fapProbability}%</Text>
          <Text style={[base.tableCell, { flex: 2.2, textAlign: 'right', paddingRight: 8, fontSize: 6.8, color: COLORS.gris }]}>
            Riesgo {fapRisk.toUpperCase()} de saturación por hollín.
          </Text>
        </View>

        {/* Row 3 */}
        <View style={[base.tableRow, { paddingVertical: 3.5 }]}>
          <Text style={[base.tableCell, { flex: 1.8, textAlign: 'left', paddingLeft: 8, fontSize: 6.8, fontWeight: 700 }]}>Impacto diario combustible</Text>
          <Text style={[base.tableCell, { flex: 1, fontSize: 6.8, color: COLORS.gris }]}>Total ÷ {daysInPeriod} días</Text>
          <Text style={[base.tableCell, { flex: 2.2, textAlign: 'right', paddingRight: 8, fontSize: 6.8, fontWeight: 700, color: COLORS.rojo }]}>
            ${costAvgDaily.toLocaleString('es-CO', { maximumFractionDigits: 0 })} COP/día
          </Text>
        </View>

        {/* Row 4 */}
        <View style={[base.tableRow, base.tableRowAlt, { paddingVertical: 3.5 }]}>
          <Text style={[base.tableCell, { flex: 1.8, textAlign: 'left', paddingLeft: 8, fontSize: 6.8, fontWeight: 700 }]}>Huella de Carbono (CO2)</Text>
          <Text style={[base.tableCell, { flex: 1, fontSize: 6.8, fontWeight: 700 }]}>{co2Kg.toFixed(0)} kg CO2</Text>
          <Text style={[base.tableCell, { flex: 2.2, textAlign: 'right', paddingRight: 8, fontSize: 6.8, color: COLORS.gris }]}>
            {(co2Kg / 1000).toFixed(2)} Ton (Compensa: {Math.ceil(treesEquivalent)} árboles)
          </Text>
        </View>
      </View>
    </View>
  );
}

function SuggestedActionPlanTable() {
  return (
    <View style={{ marginBottom: 5 }} wrap={false}>
      <View style={{ backgroundColor: COLORS.azul, padding: '4 8', marginBottom: 4 }}>
        <Text style={{ fontSize: 7.5, fontWeight: 700, color: COLORS.blanco }}>2. PLAN DE ACCIÓN SUGERIDO</Text>
      </View>
      <View style={{ border: '0.5px solid #cbd5e1', borderRadius: 4, overflow: 'hidden' }}>
        {/* Header */}
        <View style={[base.tableRow, { backgroundColor: COLORS.azul, borderBottomWidth: 0.5, borderBottomColor: '#cbd5e1', paddingVertical: 3.5 }]}>
          <Text style={[base.tableHeaderCell, { flex: 2, textAlign: 'left', paddingLeft: 8, fontWeight: 700, fontSize: 7.5 }]}>Acción</Text>
          <Text style={[base.tableHeaderCell, { flex: 1.2, fontWeight: 700, fontSize: 7.5 }]}>Responsable</Text>
          <Text style={[base.tableHeaderCell, { flex: 1, fontWeight: 700, fontSize: 7.5 }]}>Fecha</Text>
          <Text style={[base.tableHeaderCell, { flex: 1.2, fontWeight: 700, fontSize: 7.5 }]}>Indicador</Text>
          <Text style={[base.tableHeaderCell, { flex: 2, textAlign: 'right', paddingRight: 8, fontWeight: 700, fontSize: 7.5 }]}>Impacto Esperado</Text>
        </View>

        {/* Row 1 */}
        <View style={[base.tableRow, { paddingVertical: 3.5 }]}>
          <Text style={[base.tableCell, { flex: 2, textAlign: 'left', paddingLeft: 8, fontSize: 6.8, fontWeight: 700 }]}>Reentrenamiento Conductores Top 10</Text>
          <Text style={[base.tableCell, { flex: 1.2, fontSize: 6.8 }]}>Seguridad Vial</Text>
          <Text style={[base.tableCell, { flex: 1, fontSize: 6.8 }]}>30/01/2026</Text>
          <Text style={[base.tableCell, { flex: 1.2, fontSize: 6.8 }]}>100% certificado</Text>
          <Text style={[base.tableCell, { flex: 2, textAlign: 'right', paddingRight: 8, fontSize: 6.8, color: COLORS.azul, fontWeight: 700 }]}>Reducción del 30% en ralentí</Text>
        </View>

        {/* Row 2 */}
        <View style={[base.tableRow, base.tableRowAlt, { paddingVertical: 3.5 }]}>
          <Text style={[base.tableCell, { flex: 2, textAlign: 'left', paddingLeft: 8, fontSize: 6.8, fontWeight: 700 }]}>Instalar calcomanías Apague Motor</Text>
          <Text style={[base.tableCell, { flex: 1.2, fontSize: 6.8 }]}>Gerente Contrato</Text>
          <Text style={[base.tableCell, { flex: 1, fontSize: 6.8 }]}>Aprobación</Text>
          <Text style={[base.tableCell, { flex: 1.2, fontSize: 6.8 }]}>100% flota</Text>
          <Text style={[base.tableCell, { flex: 2, textAlign: 'right', paddingRight: 8, fontSize: 6.8, color: COLORS.azul, fontWeight: 700 }]}>Reducción de paradas cortas</Text>
        </View>

        {/* Row 3 */}
        <View style={[base.tableRow, { paddingVertical: 3.5 }]}>
          <Text style={[base.tableCell, { flex: 2, textAlign: 'left', paddingLeft: 8, fontSize: 6.8, fontWeight: 700 }]}>Autorización Gerencial de Ralentí</Text>
          <Text style={[base.tableCell, { flex: 1.2, fontSize: 6.8 }]}>Gerente Contrato</Text>
          <Text style={[base.tableCell, { flex: 1, fontSize: 6.8 }]}>30/01/2026</Text>
          <Text style={[base.tableCell, { flex: 1.2, fontSize: 6.8 }]}>100% justificado</Text>
          <Text style={[base.tableCell, { flex: 2, textAlign: 'right', paddingRight: 8, fontSize: 6.8, color: COLORS.azul, fontWeight: 700 }]}>Eliminación de ralentí injustificado</Text>
        </View>

        {/* Row 4 */}
        <View style={[base.tableRow, base.tableRowAlt, { paddingVertical: 3.5 }]}>
          <Text style={[base.tableCell, { flex: 2, textAlign: 'left', paddingLeft: 8, fontSize: 6.8, fontWeight: 700 }]}>Análisis Consolidado Semanal</Text>
          <Text style={[base.tableCell, { flex: 1.2, fontSize: 6.8 }]}>Coordinador de Flota Zona</Text>
          <Text style={[base.tableCell, { flex: 1, fontSize: 6.8 }]}>Quincenal</Text>
          <Text style={[base.tableCell, { flex: 1.2, fontSize: 6.8 }]}>Reporte Top 10</Text>
          <Text style={[base.tableCell, { flex: 2, textAlign: 'right', paddingRight: 8, fontSize: 6.8, color: COLORS.azul, fontWeight: 700 }]}>Focalización en unidades críticas</Text>
        </View>
      </View>
    </View>
  );
}

export function InformeRalentiPDF({ data }: { data: RalentiPDFData }) {
  const {
    periodoLabel, periodoInicio, periodoFin, fechaReporte,
    pctRalenti, totalHorasMotorEncendido, totalHorasMotorRalenti,
    totalGalonesConsumidos, totalEventos, totalVehiculosEvaluados = 0,
    costTotal, costAvgDaily, co2Kg, treesEquivalent,
    mayorEventoSegundos, mayorEventoConductor = 'No registra', promedioEventoSegundos, eventosMas30Min,
    riskLevel, fapRisk,
    topByTime, topByMax,
    providerCO2, dailyCO2Trend,
    contratoNombre = 'Todos los contratos',
    clienteNombre = 'Todos los clientes',
    tiposNombre = 'Todos los tipos',
    placaCritica = 'NINGUNO',
    tiempoCriticaSegundos = 0,
    fapProbability = 15,
  } = data;

  const start = new Date(periodoInicio);
  const end = new Date(periodoFin);
  const daysInPeriod = Math.round((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;

  const deltaPct = pctRalenti - 10;
  const deltaGalones = totalGalonesConsumidos - 37;
  const deltaCosto = costAvgDaily - 28000;

  return (
    <Document title={`Informe de Ralentí — ${periodoLabel}`}>
      {/* ── PÁGINA 1: RESUMEN OPERACIONAL, KPIs Y DATOS CLAVE DEL PERÍODO ── */}
      <Page size="LETTER" orientation="portrait" style={[base.page, { padding: 20, paddingBottom: 40 }]}>
        <ReportHeaderDiario title="Informe Ejecutivo de Ralentí de Flota — Torre de Control" />

        {/* Period Header */}
        <View style={{ flexDirection: 'row', borderTopWidth: 1.5, borderTopColor: COLORS.azul, paddingTop: 6, marginBottom: 8 }} wrap={false}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 7.5, fontWeight: 700, color: COLORS.azul }}>Resumen Gerencial de Operaciones</Text>
            <Text style={{ fontSize: 6.5, color: COLORS.gris, marginTop: 2 }}>Análisis de tiempos de ralentí excesivos e impactos financieros y mecánicos asociados</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 7, fontWeight: 700, color: COLORS.negro }}>Período: {periodoLabel}</Text>
            <Text style={{ fontSize: 6, color: COLORS.gris }}>{fmt(periodoInicio)} → {fmt(periodoFin)}</Text>
            <Text style={{ fontSize: 6, color: COLORS.gris }}>Generado: {fmt(fechaReporte)}</Text>
          </View>
        </View>

        {/* Gerencial Summary Box */}
        <GerencialSummaryBox
          contratoNombre={contratoNombre}
          clienteNombre={clienteNombre}
          tiposNombre={tiposNombre}
        />

        {/* KPIs banner */}
        <View style={{ backgroundColor: COLORS.azul, padding: '4 8', marginBottom: 4 }} wrap={false}>
          <Text style={{ fontSize: 7.5, fontWeight: 700, color: COLORS.blanco }}>INDICADORES CLAVE DE DESEMPEÑO (KPIs)</Text>
        </View>

        {/* Gráfico unificado: donut de % ralentí (vs horas motor) + barras de ralentí > 5 min */}
        <ProportionsCharts data={data} />

        {/* Tarjetas KPI restantes (el % de ralentí queda representado por el donut superior) */}
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }} wrap={false}>
          <Page1KpiCard
            title="Vehículos Evaluados"
            value={String(totalVehiculosEvaluados)}
            valueColor={COLORS.azul}
            infoText="Cantidad de vehículos con datos de ralentí incluidos en el análisis del período."
          />
          <Page1KpiCard
            title="Galones Consumidos en Ralentí"
            value={`${totalGalonesConsumidos.toFixed(1)} Gal`}
            valueColor={deltaGalones > 0 ? COLORS.rojo : COLORS.negro}
            infoText="Combustible gastado con el vehículo detenido. Es el combustible que se esta desperdiciando por Ralentí."
          />
          <Page1KpiCard
            title="Costo Total de Combustible en Ralentí"
            value={fmtCOP(costTotal)}
            valueColor={deltaCosto > 0 ? COLORS.rojo : COLORS.negro}
            infoText="Costo total del combustible quemado con el vehículo detenido durante el período. Es gasto evitable."
          />
          <Page1KpiCard
            title="Riesgo Operacional"
            value={riskLevel}
            subText={`FAP/AdBlue: Riesgo ${fapRisk}`}
            valueColor={riskLevel === 'Alto' ? COLORS.rojo : riskLevel === 'Medio' ? COLORS.naranja : COLORS.negro}
            infoText="Riesgo para el motor y el filtro de partículas por operar mucho tiempo detenido. 'Alto' significa mayor probabilidad de fallas y mantenimiento."
          />
        </View>

        {/* Impacto de Compensación Ambiental (reubicado debajo de KPIs) */}
        <View style={{ marginBottom: 8 }} wrap={false}>
          <Page3EnvironmentalBox co2Kg={co2Kg} treesEquivalent={treesEquivalent} />
        </View>

        {/* Datos Clave del Período (Full Width) */}
        <View style={{ marginBottom: 6 }} wrap={false}>
          <View style={{ backgroundColor: COLORS.azul, padding: '3 6', marginBottom: 4 }}>
            <Text style={{ fontSize: 6.8, fontWeight: 700, color: '#ffffff' }}>DATOS CLAVE DEL PERÍODO</Text>
          </View>
          <Text style={{ fontSize: 6, color: COLORS.gris, marginBottom: 4 }}>
            Los tiempos se expresan en horas. El formato h:mm:ss corresponde a horas : minutos : segundos.
          </Text>
          <View style={{ flexDirection: 'row', gap: 6 }} wrap={false}>
            <Page1DataKeyCard label="Tiempo Ralentí Flota" value={`${totalHorasMotorRalenti.toFixed(1)} h`} sub="Horas totales en ralentí" sub2={`De ${totalHorasMotorEncendido.toFixed(1)} h de motor encendido`} />
            <Page1DataKeyCard label="Mayor Evento Único (h:mm:ss)" value={fmtSecs(mayorEventoSegundos)} sub={`≈ ${(mayorEventoSegundos / 3600).toFixed(1)} horas continuas`} sub2={`Conductor: ${mayorEventoConductor}`} />
            <Page1DataKeyCard label="Promedio por Evento (h:mm:ss)" value={fmtSecs(promedioEventoSegundos)} sub={`≈ ${(promedioEventoSegundos / 3600).toFixed(1)} horas por evento`} sub2={`Total: ${totalEventos} eventos`} />
            <Page1DataKeyCard label="Eventos > 30 Minutos" value={String(eventosMas30Min)} sub="Eventos de severidad crítica" />
          </View>
          <CriticalVehicleCard placa={placaCritica} tiempoSegundos={tiempoCriticaSegundos} totalHorasRalentiFlota={totalHorasMotorRalenti} />
        </View>

        <ReportFooterDiario />
      </Page>

      {/* ── PÁGINA 2: RESUMEN OPERATIVO, DESVIACIONES Y PLAN DE ACCIÓN ── */}
      <Page size="LETTER" orientation="portrait" style={[base.page, { padding: 20, paddingBottom: 40 }]}>
        <ReportHeaderDiario title="Informe Ejecutivo de Ralentí de Flota — Torre de Control" />

        {/* Comportamiento de Conductores (Top 10) — reubicado a esta página */}
        <View style={{ backgroundColor: COLORS.azul, padding: '4 8', marginBottom: 4 }} wrap={false}>
          <Text style={{ fontSize: 7, fontWeight: 700, color: COLORS.blanco }}>COMPORTAMIENTO DE CONDUCTORES (TOP 10)</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }} wrap={false}>
          <Page2DriverBarChart
            title="Top 10 Conductores por Tiempo"
            data={topByTime}
            type="total"
          />
          <Page2DriverBarChart
            title="Top 10 Conductores por Evento Máximo"
            data={topByMax}
            type="max"
          />
        </View>
        <Page2InterpretationBox topByTime={topByTime} topByMax={topByMax} />

        {/* 1. Key Data Interpretation Table */}
        <KeyDataInterpretationTable data={data} daysInPeriod={daysInPeriod} />

        {/* 2. Suggested Action Plan Table */}
        <SuggestedActionPlanTable />

        <ReportFooterDiario />
      </Page>
    </Document>
  );
}

export async function descargarPDFRalenti(data: RalentiPDFData): Promise<void> {
  const blob = await pdf(<InformeRalentiPDF data={data} />).toBlob();
  const periodoSafe = data.periodoLabel.replace(/\s+/g, '_').replace(/[^a-z0-9_-]/gi, '');
  downloadBlob(blob, `Informe_Ralenti_${periodoSafe}_${data.periodoInicio}.pdf`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── Plantilla: Informe de Análisis General de Ralentí (comparativo multi-período) ─
// ═══════════════════════════════════════════════════════════════════════════════

export interface AnalisisGeneralPeriodoPDF {
  label: string;
  labelCorto: string;
  esBase: boolean;
  esActual: boolean;
  vehiculosActivos: number;
  vehiculosConMotor: number;
  totalHorasEncendido: number;
  horasConduccion: number;
  totalHorasRalenti: number;
  horasRalentiMenos5Min: number;
  horasRalentiMas5Min: number;
  totalEventos: number;
  eventosMas30Min: number;
  pctRalenti: number;
  totalGalones: number;
  co2Kg: number;
  costoCOP: number;
  pctVsBaselineEventos: number;
  pctVsBaselineGalones: number;
}

export interface AnalisisGeneralPDFData {
  fechaReporte: string;
  clienteNombre: string;
  contratoNombre: string;
  tiposNombre: string;
  periodos: AnalisisGeneralPeriodoPDF[];
  baselineLabel: string;
  latestLabel: string;
  mejorPeriodoLabel: string;
  peorPeriodoLabel: string;
  tendencia: 'mejora' | 'retroceso' | 'estable';
  latestVsPrevPct: number;
}

function fmtPctSigned(v: number): string {
  const s = v > 0 ? '+' : '';
  return `${s}${v.toFixed(1)}%`;
}

// Tarjeta KPI gerencial reutilizable (Análisis General)
function AgKpiCard({ title, value, sub, valueColor = COLORS.negro }: { title: string; value: string; sub?: string; valueColor?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#ffffff', borderRadius: 4, padding: 7, borderWidth: 0.5, borderColor: COLORS.grisBorde, borderStyle: 'solid', minHeight: 58, justifyContent: 'space-between' }} wrap={false}>
      <Text style={{ fontSize: 6.8, fontWeight: 700, color: COLORS.gris, textTransform: 'uppercase' }}>{title}</Text>
      <Text style={{ fontSize: 15, fontWeight: 700, color: valueColor, marginVertical: 2 }}>{value}</Text>
      {sub ? <Text style={{ fontSize: 6.2, color: COLORS.gris }}>{sub}</Text> : null}
    </View>
  );
}

// Gráfico de barras verticales basado en Views (sin SVG) para react-pdf
function AgBarChart({ title, data, color, format }: { title: string; data: { label: string; value: number; base?: boolean }[]; color: string; format: (v: number) => string }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <View style={{ flex: 1, backgroundColor: '#ffffff', borderWidth: 0.5, borderColor: COLORS.grisBorde, borderStyle: 'solid', borderRadius: 4, padding: 8 }} wrap={false}>
      <Text style={{ fontSize: 7, fontWeight: 700, color: COLORS.azul, marginBottom: 6, textTransform: 'uppercase' }}>{title}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 78, gap: 5 }}>
        {data.map((d, i) => {
          const h = Math.max(3, (d.value / max) * 64);
          return (
            <View key={i} style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 5.4, fontWeight: 700, color: COLORS.negro, marginBottom: 1 }}>{format(d.value)}</Text>
              <View style={{ width: '64%', height: h, backgroundColor: d.base ? COLORS.azul : color, borderTopLeftRadius: 2, borderTopRightRadius: 2 }} />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 5, marginTop: 3, borderTopWidth: 0.5, borderTopColor: COLORS.sombra, paddingTop: 2 }}>
        {data.map((d, i) => (
          <Text key={i} style={{ flex: 1, fontSize: 5.2, color: COLORS.gris, textAlign: 'center' }}>{d.label}</Text>
        ))}
      </View>
    </View>
  );
}

// Gráfico combinado: barras agrupadas (2 series) + línea de tendencia de % (SVG overlay)
function AgComboChart({ title, data, barLabels, barColors }: {
  title: string;
  data: { label: string; bar0: number; bar1: number; line: number }[];
  barLabels: [string, string];
  barColors: [string, string];
}) {
  const PLOT_H = 66;
  const barMax = Math.max(...data.flatMap(d => [d.bar0, d.bar1]), 1);
  const lineVals = data.map(d => d.line);
  const lmin = Math.min(...lineVals);
  const lmax = Math.max(...lineVals);
  const lrange = (lmax - lmin) || 1;
  const lo = lmin - lrange * 0.35;
  const hi = lmax + lrange * 0.35;
  const yLine = (v: number) => PLOT_H - ((v - lo) / (hi - lo)) * PLOT_H;
  const nP = data.length;
  const pts = data.map((d, i) => `${(((i + 0.5) / nP) * 100).toFixed(2)},${yLine(d.line).toFixed(2)}`).join(' ');
  return (
    <View style={{ flex: 1, backgroundColor: '#ffffff', borderWidth: 0.5, borderColor: COLORS.grisBorde, borderStyle: 'solid', borderRadius: 4, padding: 8 }} wrap={false}>
      <Text style={{ fontSize: 6.8, fontWeight: 700, color: COLORS.azul, marginBottom: 6 }}>{title}</Text>
      <View style={{ position: 'relative', height: PLOT_H }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: PLOT_H }}>
          {data.map((d, i) => (
            <View key={i} style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 2 }}>
              <View style={{ width: 6, height: Math.max(2, (d.bar0 / barMax) * PLOT_H), backgroundColor: barColors[0], borderTopLeftRadius: 1, borderTopRightRadius: 1 }} />
              <View style={{ width: 6, height: Math.max(2, (d.bar1 / barMax) * PLOT_H), backgroundColor: barColors[1], borderTopLeftRadius: 1, borderTopRightRadius: 1 }} />
            </View>
          ))}
        </View>
        <Svg style={{ position: 'absolute', top: 0, left: 0, right: 0, height: PLOT_H }} viewBox={`0 0 100 ${PLOT_H}`} preserveAspectRatio="none">
          <Polyline points={pts} fill="none" stroke={COLORS.azul} strokeWidth={0.9} />
        </Svg>
      </View>
      {/* Valores del % (línea de tendencia) */}
      <View style={{ flexDirection: 'row', marginTop: 2 }}>
        {data.map((d, i) => (
          <Text key={i} style={{ flex: 1, fontSize: 5, fontWeight: 700, color: COLORS.azul, textAlign: 'center' }}>{d.line.toFixed(1)}%</Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: COLORS.sombra, paddingTop: 2, marginTop: 1 }}>
        {data.map((d, i) => (
          <Text key={i} style={{ flex: 1, fontSize: 5.2, color: COLORS.gris, textAlign: 'center' }}>{d.label}</Text>
        ))}
      </View>
      {/* Leyenda */}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <View style={{ width: 6, height: 6, backgroundColor: barColors[0], borderRadius: 1 }} />
          <Text style={{ fontSize: 4.8, color: COLORS.gris }}>{barLabels[0]}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <View style={{ width: 6, height: 6, backgroundColor: barColors[1], borderRadius: 1 }} />
          <Text style={{ fontSize: 4.8, color: COLORS.gris }}>{barLabels[1]}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <View style={{ width: 8, height: 1.5, backgroundColor: COLORS.azul }} />
          <Text style={{ fontSize: 4.8, color: COLORS.gris }}>% Ralentí</Text>
        </View>
      </View>
    </View>
  );
}

// Columnas de la tabla comparativa
const AG_COLS: { key: keyof AnalisisGeneralPeriodoPDF | 'periodo'; label: string; flex: number; align: 'left' | 'center' | 'right' }[] = [
  { key: 'periodo', label: 'PERÍODO', flex: 2.5, align: 'left' },
  { key: 'vehiculosActivos', label: 'VEH.', flex: 1, align: 'center' },
  { key: 'totalHorasEncendido', label: 'H. MOTOR', flex: 1.2, align: 'right' },
  { key: 'horasConduccion', label: 'H. CONDUC.', flex: 1.2, align: 'right' },
  { key: 'totalHorasRalenti', label: 'RAL. TOTAL', flex: 1.2, align: 'right' },
  { key: 'horasRalentiMenos5Min', label: 'RAL. <5', flex: 1, align: 'right' },
  { key: 'horasRalentiMas5Min', label: 'RAL. >5', flex: 1, align: 'right' },
  { key: 'totalEventos', label: 'EV. >5', flex: 1.1, align: 'right' },
  { key: 'eventosMas30Min', label: 'EV. >30', flex: 1, align: 'right' },
  { key: 'pctRalenti', label: '% RAL.', flex: 1, align: 'right' },
  { key: 'pctVsBaselineEventos', label: 'Δ EV.', flex: 1, align: 'right' },
  { key: 'pctVsBaselineGalones', label: 'Δ GAL.', flex: 1, align: 'right' },
];

function AgComparativeTable({ periodos }: { periodos: AnalisisGeneralPeriodoPDF[] }) {
  return (
    <View style={{ borderWidth: 0.5, borderColor: COLORS.grisBorde, borderStyle: 'solid', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', backgroundColor: COLORS.azul, paddingVertical: 4, paddingHorizontal: 2 }} fixed>
        {AG_COLS.map(c => (
          <Text key={c.key} style={{ flex: c.flex, color: COLORS.blanco, fontWeight: 700, fontSize: 5.4, textAlign: c.align, paddingHorizontal: 2 }}>{c.label}</Text>
        ))}
      </View>
      {/* Rows */}
      {periodos.map((p, i) => {
        const bg = p.esBase ? '#eff6ff' : i % 2 === 1 ? COLORS.grisClaro : COLORS.blanco;
        return (
          <View key={i} style={{ flexDirection: 'row', backgroundColor: bg, paddingVertical: 3.5, paddingHorizontal: 2, borderBottomWidth: 0.5, borderBottomColor: COLORS.sombra }} wrap={false}>
            {/* Período */}
            <View style={{ flex: AG_COLS[0].flex, paddingHorizontal: 2, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Text style={{ fontSize: 5.6, fontWeight: 700, color: COLORS.negro }}>{p.label}</Text>
              {p.esBase ? <Text style={{ fontSize: 4.6, fontWeight: 700, color: COLORS.blanco, backgroundColor: COLORS.azul, paddingHorizontal: 2, paddingVertical: 0.5, borderRadius: 2 }}>BASE</Text> : null}
              {p.esActual && !p.esBase ? <Text style={{ fontSize: 4.6, fontWeight: 700, color: COLORS.gris, backgroundColor: COLORS.sombra, paddingHorizontal: 2, paddingVertical: 0.5, borderRadius: 2 }}>ACTUAL</Text> : null}
            </View>
            <Text style={{ flex: AG_COLS[1].flex, fontSize: 5.6, textAlign: 'center', color: COLORS.negro, paddingHorizontal: 2 }}>{p.vehiculosActivos}</Text>
            <Text style={{ flex: AG_COLS[2].flex, fontSize: 5.6, textAlign: 'right', color: COLORS.negro, paddingHorizontal: 2 }}>{n(p.totalHorasEncendido, 1)}</Text>
            <View style={{ flex: AG_COLS[3].flex, paddingHorizontal: 2 }}>
              <Text style={{ fontSize: 5.6, textAlign: 'right', color: COLORS.negro }}>{n(p.horasConduccion, 1)}</Text>
              {p.vehiculosConMotor < p.vehiculosActivos ? (
                <Text style={{ fontSize: 4.4, textAlign: 'right', color: COLORS.amarillo }}>{p.vehiculosConMotor}/{p.vehiculosActivos} c/motor</Text>
              ) : null}
            </View>
            <Text style={{ flex: AG_COLS[4].flex, fontSize: 5.6, textAlign: 'right', color: COLORS.negro, paddingHorizontal: 2 }}>{n(p.totalHorasRalenti, 1)}</Text>
            <Text style={{ flex: AG_COLS[5].flex, fontSize: 5.6, textAlign: 'right', color: COLORS.negro, paddingHorizontal: 2 }}>{n(p.horasRalentiMenos5Min, 1)}</Text>
            <Text style={{ flex: AG_COLS[6].flex, fontSize: 5.6, textAlign: 'right', color: COLORS.negro, fontWeight: 700, paddingHorizontal: 2 }}>{n(p.horasRalentiMas5Min, 1)}</Text>
            <Text style={{ flex: AG_COLS[7].flex, fontSize: 5.6, textAlign: 'right', color: COLORS.negro, fontWeight: 700, paddingHorizontal: 2 }}>{n(p.totalEventos)}</Text>
            <Text style={{ flex: AG_COLS[8].flex, fontSize: 5.6, textAlign: 'right', color: COLORS.negro, paddingHorizontal: 2 }}>{n(p.eventosMas30Min)}</Text>
            <Text style={{ flex: AG_COLS[9].flex, fontSize: 5.6, textAlign: 'right', fontWeight: 700, color: p.pctRalenti < 20 ? COLORS.verde : p.pctRalenti < 50 ? COLORS.amarillo : COLORS.rojo, paddingHorizontal: 2 }}>{n(p.pctRalenti, 1)}%</Text>
            <Text style={{ flex: AG_COLS[10].flex, fontSize: 5.6, textAlign: 'right', fontWeight: 700, color: p.esBase ? COLORS.gris : p.pctVsBaselineEventos < 0 ? COLORS.verde : COLORS.rojo, paddingHorizontal: 2 }}>{p.esBase ? '—' : fmtPctSigned(p.pctVsBaselineEventos)}</Text>
            <Text style={{ flex: AG_COLS[11].flex, fontSize: 5.6, textAlign: 'right', fontWeight: 700, color: p.esBase ? COLORS.gris : p.pctVsBaselineGalones < 0 ? COLORS.verde : COLORS.rojo, paddingHorizontal: 2 }}>{p.esBase ? '—' : fmtPctSigned(p.pctVsBaselineGalones)}</Text>
          </View>
        );
      })}
    </View>
  );
}

function AgSequentialTable({ periodos }: { periodos: AnalisisGeneralPeriodoPDF[] }) {
  const rows = periodos.slice(1).map((p, i) => {
    const prev = periodos[i];
    const dEv = prev.totalEventos > 0 ? ((p.totalEventos - prev.totalEventos) / prev.totalEventos) * 100 : 0;
    const dGal = prev.totalGalones > 0 ? ((p.totalGalones - prev.totalGalones) / prev.totalGalones) * 100 : 0;
    const dCo2 = prev.co2Kg > 0 ? ((p.co2Kg - prev.co2Kg) / prev.co2Kg) * 100 : 0;
    const tend = dEv < -2 ? 'MEJORA' : dEv > 2 ? 'RETROCESO' : 'ESTABLE';
    const tendColor = dEv < -2 ? COLORS.verde : dEv > 2 ? COLORS.rojo : COLORS.gris;
    return { label: `${prev.labelCorto} → ${p.labelCorto}`, dEv, dGal, dCo2, tend, tendColor };
  });
  const head = ['COMPARACIÓN', 'Δ EVENTOS', 'Δ GALONES', 'Δ CO₂', 'TENDENCIA'];
  const flex = [2.2, 1, 1, 1, 1.2];
  return (
    <View style={{ borderWidth: 0.5, borderColor: COLORS.grisBorde, borderStyle: 'solid', borderRadius: 3, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', backgroundColor: COLORS.azul, paddingVertical: 3.5, paddingHorizontal: 4 }}>
        {head.map((h, i) => (
          <Text key={i} style={{ flex: flex[i], color: COLORS.blanco, fontWeight: 700, fontSize: 5.6, textAlign: i === 0 ? 'left' : 'center' }}>{h}</Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', backgroundColor: i % 2 === 1 ? COLORS.grisClaro : COLORS.blanco, paddingVertical: 3.5, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: COLORS.sombra }} wrap={false}>
          <Text style={{ flex: flex[0], fontSize: 6, color: COLORS.negro, fontWeight: 700 }}>{r.label}</Text>
          <Text style={{ flex: flex[1], fontSize: 6, textAlign: 'center', fontWeight: 700, color: r.dEv < 0 ? COLORS.verde : r.dEv > 0 ? COLORS.rojo : COLORS.gris }}>{fmtPctSigned(r.dEv)}</Text>
          <Text style={{ flex: flex[2], fontSize: 6, textAlign: 'center', fontWeight: 700, color: r.dGal < 0 ? COLORS.verde : r.dGal > 0 ? COLORS.rojo : COLORS.gris }}>{fmtPctSigned(r.dGal)}</Text>
          <Text style={{ flex: flex[3], fontSize: 6, textAlign: 'center', fontWeight: 700, color: r.dCo2 < 0 ? COLORS.verde : r.dCo2 > 0 ? COLORS.rojo : COLORS.gris }}>{fmtPctSigned(r.dCo2)}</Text>
          <Text style={{ flex: flex[4], fontSize: 5.6, textAlign: 'center', fontWeight: 700, color: r.tendColor }}>{r.tend}</Text>
        </View>
      ))}
    </View>
  );
}

export function InformeAnalisisGeneralPDF({ data }: { data: AnalisisGeneralPDFData }) {
  const {
    fechaReporte, clienteNombre, contratoNombre, tiposNombre,
    periodos, baselineLabel, latestLabel, mejorPeriodoLabel, peorPeriodoLabel,
    tendencia, latestVsPrevPct,
  } = data;

  const baseline = periodos[0];
  const latest = periodos[periodos.length - 1];
  const tendLabel = tendencia === 'mejora' ? 'FAVORABLE' : tendencia === 'retroceso' ? 'DE RETROCESO' : 'ESTABLE';
  const tendColor = tendencia === 'mejora' ? COLORS.verde : tendencia === 'retroceso' ? COLORS.rojo : COLORS.amarillo;
  const recomendacion =
    tendencia === 'retroceso'
      ? `Investigar las causas del aumento en ${latest.labelCorto} y reforzar los controles operativos para recuperar los niveles óptimos alcanzados en ${mejorPeriodoLabel}.`
      : tendencia === 'mejora'
        ? `Mantener y reforzar las prácticas actuales. Documentar e institucionalizar las medidas exitosas de ${latest.labelCorto} para sostener la mejora en períodos futuros.`
        : `Continuar monitoreando la flota. Enfocar la gestión en los conductores con mayor tiempo de ralentí acumulado e implementar capacitaciones periódicas para consolidar mejoras.`;

  return (
    <Document title={`Análisis General de Ralentí — ${baselineLabel} a ${latestLabel}`}>
      {/* ── PÁGINA 1: RESUMEN GERENCIAL, KPIs Y COMPARATIVO ── */}
      <Page size="LETTER" orientation="portrait" style={[base.page, { padding: 20, paddingBottom: 40 }]}>
        <ReportHeaderDiario title="Informe de Análisis General de Ralentí — Torre de Control" />

        <View style={{ flexDirection: 'row', borderTopWidth: 1.5, borderTopColor: COLORS.azul, paddingTop: 6, marginBottom: 8 }} wrap={false}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 7.5, fontWeight: 700, color: COLORS.azul }}>Análisis Comparativo Multi-Período</Text>
            <Text style={{ fontSize: 6.5, color: COLORS.gris, marginTop: 2 }}>Evolución del ralentí, eventos, consumo y emisiones frente a la línea base operativa</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 7, fontWeight: 700, color: COLORS.negro }}>{periodos.length} períodos · {baselineLabel} → {latestLabel}</Text>
            <Text style={{ fontSize: 6, color: COLORS.gris }}>Línea base: {baselineLabel}</Text>
            <Text style={{ fontSize: 6, color: COLORS.gris }}>Generado: {fmt(fechaReporte.slice(0, 10))}</Text>
          </View>
        </View>

        <GerencialSummaryBox contratoNombre={contratoNombre} clienteNombre={clienteNombre} tiposNombre={tiposNombre} />

        <View style={{ backgroundColor: COLORS.azul, padding: '4 8', marginBottom: 4 }} wrap={false}>
          <Text style={{ fontSize: 7.5, fontWeight: 700, color: COLORS.blanco }}>INDICADORES CLAVE — PERÍODO ACTUAL ({latestLabel})</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }} wrap={false}>
          <AgKpiCard
            title="Δ Eventos vs Base"
            value={fmtPctSigned(latest.pctVsBaselineEventos)}
            sub={`${n(baseline.totalEventos)} → ${n(latest.totalEventos)} eventos`}
            valueColor={latest.pctVsBaselineEventos < 0 ? COLORS.verde : COLORS.rojo}
          />
          <AgKpiCard
            title="CO₂ Período Actual"
            value={`${(latest.co2Kg / 1000).toFixed(2)} t`}
            sub={`${fmtPctSigned(((latest.co2Kg - baseline.co2Kg) / (baseline.co2Kg || 1)) * 100)} vs línea base`}
            valueColor={COLORS.verde}
          />
          <AgKpiCard
            title="Costo Combustible"
            value={fmtCOP(latest.costoCOP)}
            sub={`${n(latest.totalGalones, 1)} gal`}
            valueColor={COLORS.negro}
          />
          <AgKpiCard
            title="% Ralentí Actual"
            value={`${n(latest.pctRalenti, 1)}%`}
            sub={`Tendencia ${tendLabel.toLowerCase()}`}
            valueColor={tendColor}
          />
        </View>

        <View style={{ backgroundColor: COLORS.azul, padding: '4 8', marginBottom: 4 }} wrap={false}>
          <Text style={{ fontSize: 7.5, fontWeight: 700, color: COLORS.blanco }}>COMPARATIVO POR PERÍODO VS LÍNEA BASE</Text>
        </View>
        <AgComparativeTable periodos={periodos} />
        <Text style={{ fontSize: 5.6, color: COLORS.gris, lineHeight: 1.4, marginBottom: 6 }}>
          Todas las cifras cubren la flota completa y cuadran entre sí (H. Motor − Ralentí Total = H. Conducción).
          El indicador "n/total c/motor" señala cuántos vehículos reportan horas de motor encendido; en períodos con
          cobertura baja, el % Ralentí del período se sobreestima. Δ Eventos y Δ Galones se miden contra la línea base ({baselineLabel}).
        </Text>

        {/* Gráficos combinados (barras + línea de % ralentí) */}
        <View style={{ flexDirection: 'row', gap: 6 }} wrap={false}>
          <AgComboChart
            title="Horas: Conducción vs Ralentí >5 min · % Ralentí"
            data={periodos.map(p => ({ label: p.labelCorto, bar0: p.horasConduccion, bar1: p.horasRalentiMas5Min, line: p.pctRalenti }))}
            barLabels={['H. Conducción', 'Ralentí >5 min']}
            barColors={[COLORS.verde, COLORS.naranja]}
          />
          <AgComboChart
            title="Eventos: >5 min vs >30 min · % Ralentí"
            data={periodos.map(p => ({ label: p.labelCorto, bar0: p.totalEventos, bar1: p.eventosMas30Min, line: p.pctRalenti }))}
            barLabels={['Eventos >5 min', 'Eventos >30 min']}
            barColors={[COLORS.azulClaro, COLORS.rojo]}
          />
        </View>

        <ReportFooterDiario />
      </Page>

      {/* ── PÁGINA 2: ANÁLISIS VISUAL, TENDENCIA Y CONCLUSIONES ── */}
      <Page size="LETTER" orientation="portrait" style={[base.page, { padding: 20, paddingBottom: 40 }]}>
        <ReportHeaderDiario title="Informe de Análisis General de Ralentí — Torre de Control" />

        <View style={{ backgroundColor: COLORS.azul, padding: '4 8', marginBottom: 6 }} wrap={false}>
          <Text style={{ fontSize: 7.5, fontWeight: 700, color: COLORS.blanco }}>ANÁLISIS VISUAL POR PERÍODO</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }} wrap={false}>
          <AgBarChart
            title="Eventos de Ralentí"
            data={periodos.map(p => ({ label: p.labelCorto, value: p.totalEventos, base: p.esBase }))}
            color={COLORS.naranja}
            format={v => n(v)}
          />
          <AgBarChart
            title="Galones Consumidos"
            data={periodos.map(p => ({ label: p.labelCorto, value: p.totalGalones, base: p.esBase }))}
            color={COLORS.amarillo}
            format={v => n(v, 0)}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }} wrap={false}>
          <AgBarChart
            title="CO₂ Emitido (kg)"
            data={periodos.map(p => ({ label: p.labelCorto, value: p.co2Kg, base: p.esBase }))}
            color={COLORS.verde}
            format={v => n(v, 0)}
          />
          <AgBarChart
            title="% Ralentí"
            data={periodos.map(p => ({ label: p.labelCorto, value: p.pctRalenti, base: p.esBase }))}
            color={COLORS.azulClaro}
            format={v => `${n(v, 1)}%`}
          />
        </View>

        <View style={{ backgroundColor: COLORS.azul, padding: '4 8', marginBottom: 4 }} wrap={false}>
          <Text style={{ fontSize: 7.5, fontWeight: 700, color: COLORS.blanco }}>TENDENCIA SECUENCIAL (PERÍODO A PERÍODO)</Text>
        </View>
        <View style={{ marginBottom: 8 }}>
          <AgSequentialTable periodos={periodos} />
        </View>

        <View style={{ backgroundColor: COLORS.azul, padding: '4 8', marginBottom: 4 }} wrap={false}>
          <Text style={{ fontSize: 7.5, fontWeight: 700, color: COLORS.blanco }}>CONCLUSIONES Y RECOMENDACIÓN GERENCIAL</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }} wrap={false}>
          <View style={{ flex: 1, backgroundColor: COLORS.verdeBg, borderWidth: 0.5, borderColor: COLORS.verde, borderStyle: 'solid', borderRadius: 4, padding: 7 }}>
            <Text style={{ fontSize: 6.5, fontWeight: 700, color: COLORS.verde, textTransform: 'uppercase', marginBottom: 2 }}>Mejor Período</Text>
            <Text style={{ fontSize: 9, fontWeight: 700, color: COLORS.negro }}>{mejorPeriodoLabel}</Text>
            <Text style={{ fontSize: 6.2, color: COLORS.gris, marginTop: 1 }}>Menor % de ralentí del comparativo</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: COLORS.rojoBg, borderWidth: 0.5, borderColor: COLORS.rojo, borderStyle: 'solid', borderRadius: 4, padding: 7 }}>
            <Text style={{ fontSize: 6.5, fontWeight: 700, color: COLORS.rojo, textTransform: 'uppercase', marginBottom: 2 }}>Mayor Desviación</Text>
            <Text style={{ fontSize: 9, fontWeight: 700, color: COLORS.negro }}>{peorPeriodoLabel}</Text>
            <Text style={{ fontSize: 6.2, color: COLORS.gris, marginTop: 1 }}>Mayor % de ralentí del comparativo</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: COLORS.grisClaro, borderWidth: 0.5, borderColor: tendColor, borderStyle: 'solid', borderRadius: 4, padding: 7 }}>
            <Text style={{ fontSize: 6.5, fontWeight: 700, color: tendColor, textTransform: 'uppercase', marginBottom: 2 }}>Tendencia Reciente</Text>
            <Text style={{ fontSize: 9, fontWeight: 700, color: COLORS.negro }}>{tendLabel}</Text>
            <Text style={{ fontSize: 6.2, color: COLORS.gris, marginTop: 1 }}>{fmtPctSigned(latestVsPrevPct)} en eventos vs período anterior</Text>
          </View>
        </View>
        <View style={{ backgroundColor: '#eff6ff', borderWidth: 0.5, borderColor: COLORS.azul, borderStyle: 'solid', borderRadius: 4, padding: 8 }} wrap={false}>
          <Text style={{ fontSize: 6.8, fontWeight: 700, color: COLORS.azul, textTransform: 'uppercase', marginBottom: 3 }}>Recomendación Principal</Text>
          <Text style={{ fontSize: 7, color: COLORS.negro, lineHeight: 1.5, textAlign: 'justify' }}>
            El período actual ({latest.label}) presenta una variación de {fmtPctSigned(latest.pctVsBaselineEventos)} en eventos
            de ralentí y {fmtPctSigned(latest.pctVsBaselineGalones)} en consumo de combustible frente a la línea base ({baselineLabel}).
            {' '}{recomendacion}
          </Text>
        </View>

        <ReportFooterDiario />
      </Page>
    </Document>
  );
}

export async function descargarPDFAnalisisGeneral(data: AnalisisGeneralPDFData): Promise<void> {
  const blob = await pdf(<InformeAnalisisGeneralPDF data={data} />).toBlob();
  const safe = `${data.baselineLabel}_a_${data.latestLabel}`.replace(/\s+/g, '_').replace(/[^a-z0-9_-]/gi, '');
  downloadBlob(blob, `Analisis_General_Ralenti_${safe}.pdf`);
}


