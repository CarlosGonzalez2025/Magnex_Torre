import React, { useCallback, useState } from 'react';
import { Upload, FileSpreadsheet, X, CheckCircle, AlertTriangle } from 'lucide-react';
import { descargarPlantilla } from '../../services/importService';

interface ExcelDropzoneProps {
  onFile: (file: File) => void;
  loading?: boolean;
  error?: string | null;
  exito?: boolean;
  plantillas?: Array<['conductor' | 'vehiculo' | 'alertas', string]>;
  nota?: React.ReactNode;
  accept?: string;
}

export const ExcelDropzone: React.FC<ExcelDropzoneProps> = ({ onFile, loading, error, exito, plantillas, nota, accept }) => {
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = useCallback((file: File) => {
    const isCsvAllowed = accept?.toLowerCase().includes('.csv');
    const regex = isCsvAllowed ? /\.(xlsx|xls|csv)$/i : /\.(xlsx|xls)$/i;
    if (!file.name.match(regex)) {
      alert(isCsvAllowed ? 'Solo se admiten archivos Excel (.xlsx / .xls) o CSV (.csv)' : 'Solo se admiten archivos Excel (.xlsx / .xls)');
      return;
    }
    setFileName(file.name);
    onFile(file);
  }, [onFile, accept]);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div className="space-y-4">
      {/* Zona drag-and-drop */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer
          ${dragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' : 'border-slate-300 dark:border-slate-600 hover:border-blue-400'}
          ${exito ? 'border-green-500 bg-green-50 dark:bg-green-950/20' : ''}
          ${error ? 'border-red-400 bg-red-50 dark:bg-red-950/20' : ''}
        `}
      >
        <input
          type="file"
          accept={accept || ".xlsx,.xls"}
          onChange={onInputChange}
          className="absolute inset-0 opacity-0 cursor-pointer"
          disabled={loading}
        />

        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500 dark:text-slate-400 text-sm">Procesando archivo…</p>
          </div>
        ) : exito ? (
          <div className="flex flex-col items-center gap-2">
            <CheckCircle className="w-10 h-10 text-green-500" />
            <p className="text-green-700 dark:text-green-400 font-semibold">{fileName}</p>
            <p className="text-green-600 dark:text-green-500 text-sm">Archivo procesado correctamente</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-2">
            <AlertTriangle className="w-10 h-10 text-red-500" />
            <p className="text-red-700 dark:text-red-400 font-semibold text-sm">{error}</p>
            {fileName && <p className="text-slate-500 text-xs">{fileName}</p>}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            {fileName
              ? <FileSpreadsheet className="w-10 h-10 text-blue-500" />
              : <Upload className="w-10 h-10 text-slate-400" />
            }
            <div>
              <p className="font-medium text-slate-700 dark:text-slate-300">
                {fileName ?? (accept?.toLowerCase().includes('.csv') ? 'Arrastra tu archivo Excel o CSV aquí' : 'Arrastra tu archivo Excel aquí')}
              </p>
              <p className="text-slate-400 text-sm mt-1">o haz clic para seleccionar ({accept ? accept.split(',').join(' / ') : '.xlsx / .xls'})</p>
            </div>
          </div>
        )}
      </div>

      {/* Aclaración sobre el origen de los maestros */}
      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 px-3 py-2 text-xs text-blue-700 dark:text-blue-400">
        {nota ?? (
          <>
            <strong>Nota:</strong> Este importador solo acepta datos <strong>operacionales</strong>
            (Operación Conductores, Operación Vehículos). Los datos de ralentís se incluyen en la hoja de vehículos.
            Los maestros de conductores y vehículos se sincronizan automáticamente desde{' '}
            <strong>Google Sheets</strong> usando el panel de sincronización.
          </>
        )}
      </div>

      {/* Botones de descarga de plantillas operacionales */}
      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-slate-500 dark:text-slate-400 self-center">Descargar plantillas:</span>
        {(plantillas ?? [
          ['conductor', 'Operacion Conductores'],
          ['vehiculo', 'Operacion Vehiculos'],
        ] as Array<['conductor' | 'vehiculo' | 'alertas', string]>).map(([tipo, label]) => (
          <button
            key={tipo}
            onClick={() => descargarPlantilla(tipo)}
            className="inline-flex items-center gap-1 px-3 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors"
          >
            <FileSpreadsheet className="w-3 h-3" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
};
