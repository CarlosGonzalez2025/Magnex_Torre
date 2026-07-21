import { supabase } from './supabaseClient';
import * as XLSX from 'xlsx';

export interface BitacoraEntry {
  id: string;
  fecha: string;
  hora_alerta?: string;
  hora_aviso_supervisor?: string;
  tipo_novedad: string;
  placa?: string;
  contrato?: string;
  plataforma?: string;
  conductor?: string;
  gestion_realizada?: string;
  cierre_alerta?: string;
  es_alerta: boolean;
  observacion?: string;
  evidencia_url?: string;
  evidencia_nombre?: string;
  created_at?: string;
  created_by?: string;
  updated_at?: string;
}

export interface VehicleContractInfo {
  placa: string;
  contrato: string;
  cliente?: string;
  plataforma?: string;
}

export interface ParseResult {
  validRows: Omit<BitacoraEntry, 'id'>[];
  invalidRows: { row: number; data: Record<string, any>; reason: string }[];
  totalRows: number;
}

const LOCAL_STORAGE_KEY = 'tdc_bitacora_gestion_v1';
const GOOGLE_SHEETS_VEHICLES_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRgi_mZfm-IlKYs7R7B2B4023qhLuywBkYRdO52uVCXEpa-qrNQENrqzMWJ6K_ddg3SlJbFrHLt7Saq/pub?gid=0&single=true&output=csv';

// Muestras por defecto si la base de datos está vacía o en modo offline
const INITIAL_DEMO_DATA: Omit<BitacoraEntry, 'id'>[] = [
  {
    fecha: '2026-07-16',
    hora_alerta: '',
    hora_aviso_supervisor: '',
    tipo_novedad: 'Exceso de velocidad',
    placa: '',
    contrato: 'ENEL ZV',
    plataforma: '',
    conductor: '',
    gestion_realizada: 'Sin alertas durante la jornada',
    cierre_alerta: 'SI',
    es_alerta: true,
    observacion: '',
  },
  {
    fecha: '2026-07-17',
    hora_alerta: '09:00',
    hora_aviso_supervisor: '09:05',
    tipo_novedad: 'Exceso de velocidad',
    placa: 'NGK912',
    contrato: 'ENEL ZV',
    plataforma: 'FAGOR',
    conductor: 'Sin asignar',
    gestion_realizada: 'Se informa mediante whatsapp',
    cierre_alerta: 'SI',
    es_alerta: false,
    observacion: 'El supervisor dice que va en grúa',
  },
  {
    fecha: '2026-07-17',
    hora_alerta: '09:00',
    hora_aviso_supervisor: '09:05',
    tipo_novedad: 'Exceso de velocidad',
    placa: 'NPY973',
    contrato: 'ENEL ZV',
    plataforma: 'GEOTAB',
    conductor: 'Sin asignar',
    gestion_realizada: 'Se informa mediante whatsapp',
    cierre_alerta: '',
    es_alerta: true,
    observacion: 'Buenos días, se notifica por correo electrónico al coordinador de proceso, con copia a líder, coordinador y profesional HSSEQ, coordinador de flota, especialista de logística y gerente de contrato',
  },
  {
    fecha: '2026-07-17',
    hora_alerta: '09:41',
    hora_aviso_supervisor: '09:44',
    tipo_novedad: 'Exceso de velocidad',
    placa: 'LHT819',
    contrato: 'ECOPETROL VRC-LA CIRA',
    plataforma: 'COLTRACK',
    conductor: 'Sin asignar',
    gestion_realizada: 'Se informa mediante whatsapp',
    cierre_alerta: '',
    es_alerta: false,
    observacion: '',
  },
  {
    fecha: '2026-07-17',
    hora_alerta: '15:05',
    hora_aviso_supervisor: '15:12',
    tipo_novedad: 'Exceso de velocidad',
    placa: 'NPY673',
    contrato: 'ECOPETROL VRC MARES CENTRO',
    plataforma: 'FAGOR',
    conductor: 'Sin asignar',
    gestion_realizada: 'Se informa mediante whatsapp',
    cierre_alerta: '',
    es_alerta: true,
    observacion: 'Buenas tardes, se envió correo electrónico a coordinador de proceso, con copia a líder, coordinador y profesional hsseq...',
  },
];

// Lista base predeterminada de contratos de la flota
const DEFAULT_CONTRACTS = [
  'ENEL ZIII',
  'ENEL ZX',
  'ENEL ZV',
  'ECOPETROL VRC-LA CIRA',
  'ECOPETROL VRC-TIBU',
  'ECOPETROL VRC-RIO CASABE',
  'ECOPETROL VRC-MARES PROVINCIA',
  'ECOPETROL VRC-MARES CENTRO',
  'CERREJON-SOLDADURA',
  'CERREJON BOMBAS Y TALADROS',
  'CAMPO TECA',
  'SIERRACOL',
  'MANSAROVAR',
  'MASA STORK',
  'CENIT O&M ESTACIONES',
  'HOCOL O&M INTEGRAL',
  'SIN CONTRATO',
];

class BitacoraService {
  private cachedVehicleData: {
    vehicleMap: Record<string, VehicleContractInfo>;
    platesList: string[];
    contractsList: string[];
  } | null = null;

  private getLocalData(): BitacoraEntry[] {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.warn('[BitacoraService] localStorage error:', e);
    }
    const initial = INITIAL_DEMO_DATA.map((d, index) => ({
      ...d,
      id: `demo-${index + 1}-${Date.now()}`,
      created_at: new Date().toISOString(),
    }));
    this.saveLocalData(initial);
    return initial;
  }

  private saveLocalData(data: BitacoraEntry[]): void {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('[BitacoraService] Error saving to localStorage:', e);
    }
  }

  /**
   * Obtiene la relación de placas y contratos desde el Google Sheets oficial de vehículos
   */
  async getVehicleMapAndContracts(): Promise<{
    vehicleMap: Record<string, VehicleContractInfo>;
    platesList: string[];
    contractsList: string[];
  }> {
    if (this.cachedVehicleData) {
      return this.cachedVehicleData;
    }

    const vehicleMap: Record<string, VehicleContractInfo> = {};
    const contractsSet = new Set<string>(DEFAULT_CONTRACTS);
    const platesSet = new Set<string>();

    try {
      // 1. Intentar endpoint interno /api/google-sheets
      const response = await fetch('/api/google-sheets');
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.vehicleMap) {
          Object.entries(result.vehicleMap).forEach(([placa, info]: [string, any]) => {
            const plateKey = placa.trim().toUpperCase();
            const contrato = (info.contrato || info.Contrato || 'SIN CONTRATO').trim().toUpperCase();
            const plataforma = (info.gps_compañia || info.Compañía_GPS || info.plataforma || '').trim().toUpperCase();

            vehicleMap[plateKey] = {
              placa: plateKey,
              contrato,
              cliente: info.cliente || '',
              plataforma: plataforma || undefined,
            };

            platesSet.add(plateKey);
            if (contrato) contractsSet.add(contrato);
          });
        }
      }
    } catch (e) {
      console.warn('[BitacoraService] /api/google-sheets fetch failed, falling back to direct CSV:', e);
    }

    // 2. Fallback / Enriquecimiento mediante fetch directo al CSV de Google Sheets
    if (Object.keys(vehicleMap).length === 0) {
      try {
        const res = await fetch(GOOGLE_SHEETS_VEHICLES_CSV_URL);
        if (res.ok) {
          const csvText = await res.text();
          const workbook = XLSX.read(csvText, { type: 'string' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows: any[] = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

          rows.forEach((row: any) => {
            const rawPlaca = String(row.Placa || row.PLACA || row.vehiculo || '').trim().toUpperCase();
            const rawContrato = String(row.Contrato || row.CONTRATO || row.Proyecto || 'SIN CONTRATO').trim().toUpperCase();
            const rawGps = String(row['Compañía GPS'] || row.COMPANIA_GPS || row.Plataforma || '').trim().toUpperCase();

            if (rawPlaca && rawPlaca !== 'PLACA') {
              vehicleMap[rawPlaca] = {
                placa: rawPlaca,
                contrato: rawContrato,
                cliente: row.Cliente || row.CLIENTE || '',
                plataforma: rawGps || undefined,
              };
              platesSet.add(rawPlaca);
              if (rawContrato) contractsSet.add(rawContrato);
            }
          });
        }
      } catch (err) {
        console.warn('[BitacoraService] Direct Google Sheets CSV fetch error:', err);
      }
    }

    // 3. Incluir placas de las entradas locales/Supabase existentes
    const local = this.getLocalData();
    local.forEach(item => {
      if (item.placa) {
        const pl = item.placa.trim().toUpperCase();
        platesSet.add(pl);
        if (!vehicleMap[pl]) {
          vehicleMap[pl] = {
            placa: pl,
            contrato: item.contrato || 'SIN CONTRATO',
            plataforma: item.plataforma,
          };
        }
      }
      if (item.contrato) {
        contractsSet.add(item.contrato.trim().toUpperCase());
      }
    });

    const platesList = Array.from(platesSet).sort();
    const contractsList = Array.from(contractsSet).sort();

    this.cachedVehicleData = { vehicleMap, platesList, contractsList };
    return this.cachedVehicleData;
  }

  /**
   * Obtiene la lista simple de contratos
   */
  async getAvailableContracts(): Promise<string[]> {
    const data = await this.getVehicleMapAndContracts();
    return data.contractsList;
  }

  /**
   * Subir archivo de evidencia (Guarda en Supabase Storage o convierte a Data URL)
   */
  async uploadEvidenceFile(file: File): Promise<{ success: boolean; url?: string; name?: string; error?: string }> {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `evidencia_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
      const filePath = `bitacora_evidencias/${fileName}`;

      const { data, error } = await supabase.storage
        .from('evidencias')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });

      if (!error && data) {
        const { data: publicUrlData } = supabase.storage.from('evidencias').getPublicUrl(filePath);
        return {
          success: true,
          url: publicUrlData.publicUrl,
          name: file.name,
        };
      }
    } catch (e) {
      console.warn('[BitacoraService] Supabase storage upload failed, using Data URL fallback:', e);
    }

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          success: true,
          url: reader.result as string,
          name: file.name,
        });
      };
      reader.onerror = () => {
        resolve({
          success: false,
          error: 'Error al leer el archivo de evidencia.',
        });
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * Obtiene todos los registros de la bitácora
   */
  async getAll(): Promise<{ success: boolean; data: BitacoraEntry[]; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('bitacora_gestion')
        .select('*')
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('[BitacoraService] Supabase fetch error, fallback local:', error.message);
        return { success: true, data: this.getLocalData() };
      }

      if (!data || data.length === 0) {
        const local = this.getLocalData();
        return { success: true, data: local };
      }

      const formatted: BitacoraEntry[] = data.map(row => ({
        id: row.id,
        fecha: row.fecha,
        hora_alerta: row.hora_alerta || '',
        hora_aviso_supervisor: row.hora_aviso_supervisor || '',
        tipo_novedad: row.tipo_novedad || '',
        placa: row.placa || '',
        contrato: row.contrato || '',
        plataforma: row.plataforma || '',
        conductor: row.conductor || '',
        gestion_realizada: row.gestion_realizada || '',
        cierre_alerta: row.cierre_alerta || '',
        es_alerta: row.es_alerta ?? true,
        observacion: row.observacion || '',
        evidencia_url: row.evidencia_url || undefined,
        evidencia_nombre: row.evidencia_nombre || undefined,
        created_at: row.created_at,
        created_by: row.created_by,
        updated_at: row.updated_at,
      }));

      return { success: true, data: formatted };
    } catch (err: any) {
      console.warn('[BitacoraService] Exception, fallback local:', err);
      return { success: true, data: this.getLocalData() };
    }
  }

  async create(entry: Omit<BitacoraEntry, 'id'>, userId?: string): Promise<{ success: boolean; data?: BitacoraEntry; error?: string }> {
    const isValidUuid = (id?: string) => {
      if (!id) return false;
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    };

    const payload = {
      fecha: entry.fecha,
      hora_alerta: entry.hora_alerta || null,
      hora_aviso_supervisor: entry.hora_aviso_supervisor || null,
      tipo_novedad: entry.tipo_novedad,
      placa: entry.placa ? entry.placa.toUpperCase().trim() : null,
      contrato: entry.contrato || null,
      plataforma: entry.plataforma || null,
      conductor: entry.conductor || null,
      gestion_realizada: entry.gestion_realizada || null,
      cierre_alerta: entry.cierre_alerta || null,
      es_alerta: entry.es_alerta,
      observacion: entry.observacion || null,
      evidencia_url: entry.evidencia_url || null,
      evidencia_nombre: entry.evidencia_nombre || null,
      created_by: isValidUuid(userId) ? userId : null,
    };

    try {
      const { data, error } = await supabase
        .from('bitacora_gestion')
        .insert([payload])
        .select()
        .single();

      if (error) {
        console.error('[BitacoraService] Supabase insert error:', error.message);
        throw error;
      }

      if (data) {
        const newEntry: BitacoraEntry = {
          id: data.id,
          fecha: data.fecha,
          hora_alerta: data.hora_alerta || '',
          hora_aviso_supervisor: data.hora_aviso_supervisor || '',
          tipo_novedad: data.tipo_novedad,
          placa: data.placa || '',
          contrato: data.contrato || '',
          plataforma: data.plataforma || '',
          conductor: data.conductor || '',
          gestion_realizada: data.gestion_realizada || '',
          cierre_alerta: data.cierre_alerta || '',
          es_alerta: data.es_alerta ?? true,
          observacion: data.observacion || '',
          evidencia_url: data.evidencia_url || undefined,
          evidencia_nombre: data.evidencia_nombre || undefined,
          created_at: data.created_at,
        };

        const local = this.getLocalData();
        this.saveLocalData([newEntry, ...local]);
        return { success: true, data: newEntry };
      }
    } catch (e) {
      console.warn('[BitacoraService] Supabase insert failed, fallback local:', e);
    }

    const fallbackEntry: BitacoraEntry = {
      ...entry,
      id: `local-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      created_at: new Date().toISOString(),
    };
    const local = this.getLocalData();
    this.saveLocalData([fallbackEntry, ...local]);
    return { success: true, data: fallbackEntry };
  }

  /**
   * Actualizar registro
   */
  async update(id: string, updates: Partial<BitacoraEntry>): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('bitacora_gestion')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) {
        console.warn('[BitacoraService] Update error Supabase, fallback local:', error.message);
      }
    } catch (e) {
      console.warn('[BitacoraService] Update exception, updating local state:', e);
    }

    const local = this.getLocalData();
    const updatedLocal = local.map(item => (item.id === id ? { ...item, ...updates } : item));
    this.saveLocalData(updatedLocal);
    return { success: true };
  }

  /**
   * Eliminar registro
   */
  async delete(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      await supabase.from('bitacora_gestion').delete().eq('id', id);
    } catch (e) {
      console.warn('[BitacoraService] Delete exception:', e);
    }

    const local = this.getLocalData();
    const filtered = local.filter(item => item.id !== id);
    this.saveLocalData(filtered);
    return { success: true };
  }

  /**
   * Inserción Masiva
   */
  async bulkInsert(entries: Omit<BitacoraEntry, 'id'>[], userId?: string): Promise<{ success: boolean; count: number; error?: string }> {
    if (entries.length === 0) {
      return { success: true, count: 0 };
    }

    const isValidUuid = (id?: string) => {
      if (!id) return false;
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    };

    const rowsToInsert = entries.map(entry => ({
      fecha: entry.fecha,
      hora_alerta: entry.hora_alerta || null,
      hora_aviso_supervisor: entry.hora_aviso_supervisor || null,
      tipo_novedad: entry.tipo_novedad || 'Novedad sin especificar',
      placa: entry.placa ? entry.placa.toUpperCase().trim() : null,
      contrato: entry.contrato || null,
      plataforma: entry.plataforma || null,
      conductor: entry.conductor || null,
      gestion_realizada: entry.gestion_realizada || null,
      cierre_alerta: entry.cierre_alerta || null,
      es_alerta: entry.es_alerta,
      observacion: entry.observacion || null,
      evidencia_url: entry.evidencia_url || null,
      evidencia_nombre: entry.evidencia_nombre || null,
      created_by: isValidUuid(userId) ? userId : null,
    }));

    try {
      const { data, error } = await supabase
        .from('bitacora_gestion')
        .insert(rowsToInsert)
        .select();

      if (!error && data) {
        const newEntries: BitacoraEntry[] = data.map(d => ({
          id: d.id,
          fecha: d.fecha,
          hora_alerta: d.hora_alerta || '',
          hora_aviso_supervisor: d.hora_aviso_supervisor || '',
          tipo_novedad: d.tipo_novedad,
          placa: d.placa || '',
          contrato: d.contrato || '',
          plataforma: d.plataforma || '',
          conductor: d.conductor || '',
          gestion_realizada: d.gestion_realizada || '',
          cierre_alerta: d.cierre_alerta || '',
          es_alerta: d.es_alerta ?? true,
          observacion: d.observacion || '',
          evidencia_url: d.evidencia_url || undefined,
          evidencia_nombre: d.evidencia_nombre || undefined,
          created_at: d.created_at,
        }));

        const local = this.getLocalData();
        this.saveLocalData([...newEntries, ...local]);
        return { success: true, count: newEntries.length };
      }
    } catch (e) {
      console.warn('[BitacoraService] Bulk insert failed on Supabase, saving to local:', e);
    }

    const fallbackEntries: BitacoraEntry[] = entries.map((entry, idx) => ({
      ...entry,
      id: `local-bulk-${idx}-${Date.now()}`,
      created_at: new Date().toISOString(),
    }));

    const local = this.getLocalData();
    this.saveLocalData([...fallbackEntries, ...local]);
    return { success: true, count: fallbackEntries.length };
  }

  /**
   * Procesa y valida un archivo Excel (.xlsx / .csv) cargado por el usuario
   */
  async parseExcelFile(file: File): Promise<ParseResult> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array', cellDates: true });

          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];

          const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

          if (rawRows.length === 0) {
            return resolve({ validRows: [], invalidRows: [], totalRows: 0 });
          }

          let headerRowIndex = 0;
          for (let i = 0; i < Math.min(15, rawRows.length); i++) {
            const rowStr = rawRows[i].map((c: any) => String(c).toLowerCase()).join(' ');
            if (rowStr.includes('fecha') || rowStr.includes('novedad') || rowStr.includes('placa')) {
              headerRowIndex = i;
              break;
            }
          }

          const headers = rawRows[headerRowIndex].map((h: any) => String(h).trim());

          const validRows: Omit<BitacoraEntry, 'id'>[] = [];
          const invalidRows: { row: number; data: Record<string, any>; reason: string }[] = [];

          const getVal = (row: any[], possibleNames: string[]) => {
            for (const name of possibleNames) {
              const idx = headers.findIndex(h => h.toLowerCase().replace(/[^a-z0-9]/g, '').includes(name.toLowerCase().replace(/[^a-z0-9]/g, '')));
              if (idx !== -1 && row[idx] !== undefined && row[idx] !== null && String(row[idx]).trim() !== '') {
                return String(row[idx]).trim();
              }
            }
            return '';
          };

          const colSiIdx = headers.findIndex(h => h.toUpperCase() === 'SI' || h.toUpperCase() === 'SÍ');
          const colNoIdx = headers.findIndex(h => h.toUpperCase() === 'NO');

          for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
            const row = rawRows[i];

            if (!row || row.every((cell: any) => cell === undefined || cell === null || String(cell).trim() === '')) {
              continue;
            }

            const rawFecha = getVal(row, ['Fecha', 'Date']);
            const horaAlerta = getVal(row, ['Hora alerta', 'Hora_alerta', 'Hora Alerta']);
            const horaAviso = getVal(row, ['Hora aviso supervisor', 'Hora_aviso', 'Hora Aviso', 'Aviso']);
            const tipoNovedad = getVal(row, ['Tipo de novedad', 'Tipo novedad', 'Novedad', 'Evento']);
            const placa = getVal(row, ['Placa', 'Vehiculo', 'Vehículo']);
            const contrato = getVal(row, ['Contrato', 'Cliente']);
            const plataforma = getVal(row, ['Plataforma', 'GPS', 'Proveedor']);
            const conductor = getVal(row, ['Conductor', 'Driver']);
            const gestionRealizada = getVal(row, ['Gestion realizada', 'Gestión realizada', 'Gestion', 'Accion']);
            const cierreAlerta = getVal(row, ['Cierre de la alerta', 'Cierre alerta', 'Cierre']);
            const observacion = getVal(row, ['Observacion', 'Observación', 'Observaciones', 'Notas']);

            let esAlerta = true;
            if (colSiIdx !== -1 && colNoIdx !== -1) {
              const valSi = String(row[colSiIdx] || '').trim().toUpperCase();
              const valNo = String(row[colNoIdx] || '').trim().toUpperCase();
              if (valNo === 'X' || valNo === 'SI' || valNo === '1') {
                esAlerta = false;
              } else if (valSi === 'X' || valSi === 'SI' || valSi === '1') {
                esAlerta = true;
              }
            } else {
              const colEsAlerta = getVal(row, ['Si era alerta', 'Es alerta', 'Alerta real']);
              if (colEsAlerta.toUpperCase() === 'NO' || colEsAlerta.toUpperCase() === 'FALSE') {
                esAlerta = false;
              }
            }

            let formattedFecha = '';
            if (rawFecha) {
              if (rawFecha.includes('/')) {
                const parts = rawFecha.split('/');
                if (parts.length === 3) {
                  if (parts[0].length === 4) {
                    formattedFecha = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                  } else {
                    formattedFecha = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                  }
                }
              } else if (rawFecha.includes('-')) {
                formattedFecha = rawFecha.substring(0, 10);
              } else if (!isNaN(Number(rawFecha))) {
                const excelDate = new Date((Number(rawFecha) - (25567 + 2)) * 86400 * 1000);
                formattedFecha = excelDate.toISOString().substring(0, 10);
              }
            }

            if (!formattedFecha) {
              formattedFecha = new Date().toISOString().substring(0, 10);
            }

            if (!tipoNovedad && !placa && !gestionRealizada) {
              invalidRows.push({
                row: i + 1,
                data: { fecha: rawFecha, tipoNovedad, placa },
                reason: 'Fila sin información clave (requiere al menos Placa, Novedad o Gestión)',
              });
              continue;
            }

            validRows.push({
              fecha: formattedFecha,
              hora_alerta: horaAlerta,
              hora_aviso_supervisor: horaAviso,
              tipo_novedad: tipoNovedad || 'Sin especificar',
              placa: placa ? placa.toUpperCase() : '',
              contrato: contrato || 'SIN CONTRATO',
              plataforma: plataforma ? plataforma.toUpperCase() : 'VARIAS',
              conductor: conductor || 'Sin asignar',
              gestion_realizada: gestionRealizada,
              cierre_alerta: cierreAlerta,
              es_alerta: esAlerta,
              observacion,
            });
          }

          resolve({
            validRows,
            invalidRows,
            totalRows: validRows.length + invalidRows.length,
          });

        } catch (err: any) {
          reject(new Error('Error al procesar el archivo Excel: ' + err.message));
        }
      };

      reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Genera y descarga la plantilla oficial en Excel (.xlsx)
   */
  generateExcelTemplate(): void {
    const templateData = [
      {
        'Fecha': '17/07/2026',
        'Hora alerta': '09:00',
        'Hora aviso supervisor': '09:05',
        'Tipo de novedad': 'Exceso de velocidad',
        'Placa': 'NGK912',
        'Contrato': 'ENEL ZV',
        'Plataforma': 'FAGOR',
        'Conductor': 'Sin asignar',
        'Gestion realizada': 'Se informa mediante whatsapp',
        'Cierre de la alerta': 'SI',
        'Observacion': 'El supervisor informa que el vehículo va en grúa',
        'SI': '',
        'NO': 'X',
      },
      {
        'Fecha': '17/07/2026',
        'Hora alerta': '15:05',
        'Hora aviso supervisor': '15:12',
        'Tipo de novedad': 'Exceso de velocidad',
        'Placa': 'NPY673',
        'Contrato': 'ECOPETROL VRC MARES CENTRO',
        'Plataforma': 'FAGOR',
        'Conductor': 'Juan Pérez',
        'Gestion realizada': 'Se informa mediante whatsapp',
        'Cierre de la alerta': 'SI',
        'Observacion': 'Se envió notificación formal al coordinador de proceso',
        'SI': 'X',
        'NO': '',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);

    worksheet['!cols'] = [
      { wch: 12 }, // Fecha
      { wch: 12 }, // Hora alerta
      { wch: 22 }, // Hora aviso supervisor
      { wch: 22 }, // Tipo de novedad
      { wch: 10 }, // Placa
      { wch: 28 }, // Contrato
      { wch: 14 }, // Plataforma
      { wch: 20 }, // Conductor
      { wch: 30 }, // Gestion realizada
      { wch: 18 }, // Cierre de la alerta
      { wch: 45 }, // Observacion
      { wch: 6 },  // SI
      { wch: 6 },  // NO
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Bitacora_Gestion');

    XLSX.writeFile(workbook, 'Plantilla_Bitacora_Gestion_Magnex.xlsx');
  }

  /**
   * Exporta la lista filtrada de registros a Excel
   */
  exportToExcel(entries: BitacoraEntry[]): void {
    const exportData = entries.map(e => ({
      'Fecha': e.fecha,
      'Hora alerta': e.hora_alerta || '',
      'Hora aviso supervisor': e.hora_aviso_supervisor || '',
      'Tipo de novedad': e.tipo_novedad,
      'Placa': e.placa || '',
      'Contrato': e.contrato || '',
      'Plataforma': e.plataforma || '',
      'Conductor': e.conductor || '',
      'Gestion realizada': e.gestion_realizada || '',
      'Cierre de la alerta': e.cierre_alerta || '',
      'Observacion': e.observacion || '',
      'Es Alerta Real': e.es_alerta ? 'SI' : 'NO',
      'Evidencia': e.evidencia_nombre || (e.evidencia_url ? 'Adjunta' : 'Sin evidencia'),
      'Fecha de Registro': e.created_at ? new Date(e.created_at).toLocaleString() : '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Bitacora');

    const fileName = `Bitacora_Gestion_${new Date().toISOString().substring(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  }
}

export const bitacoraService = new BitacoraService();
