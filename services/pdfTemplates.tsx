// PDF Templates – requiere: npm install @react-pdf/renderer
// Generación 100% client-side; no necesita servidor.

import React from 'react';
import {
  Document, Page, Text, View, StyleSheet, Font, pdf,
  Image,
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
        <Text style={base.headerDate}>Generado: {fmt(new Date().toISOString().slice(0, 10))}</Text>
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
        <Cell label="FECHA DEL REPORTE:" value={fmt(new Date().toISOString().slice(0, 10))} />
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
        <Cell label="FECHA DEL REPORTE:" value={fmt(new Date().toISOString().slice(0, 10))} />
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
