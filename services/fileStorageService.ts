import { supabase } from './supabaseClient';

export interface FileAttachment {
  name: string;
  url: string;
  type: string;
  size: number;
  uploaded_at: string;
}

// Configuración de archivos permitidos
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_FILE_TYPES = [
  // Imágenes
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  // Documentos
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  // Texto
  'text/plain',
  'text/csv',
  // Comprimidos
  'application/zip',
  'application/x-rar-compressed'
];

const STORAGE_BUCKET = 'action-plan-attachments';

/**
 * Verifica disponibilidad del bucket. La creacion requiere permisos admin
 * y se gestiona con migrations/alerts_module_actions_v16.sql.
 */
export async function initializeStorage(): Promise<void> {
  try {
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list('', { limit: 1 });

    if (error) {
      console.warn(
        'Bucket de adjuntos no disponible. Ejecuta migrations/alerts_module_actions_v16.sql en Supabase.',
        error.message
      );
    }
  } catch (error) {
    console.warn('No se pudo verificar el bucket de adjuntos:', error);
  }
}

/**
 * Validar archivo antes de subirlo
 */
function validateFile(file: File): { valid: boolean; error?: string } {
  // Validar tamaño
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `El archivo excede el tamaño máximo permitido de ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)} MB`
    };
  }

  // Validar tipo
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Tipo de archivo no permitido. Tipos permitidos: imágenes, PDFs, Word, Excel, PowerPoint, texto y comprimidos`
    };
  }

  return { valid: true };
}

/**
 * Generar nombre único para el archivo
 */
function generateUniqueFileName(originalName: string): string {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const extension = originalName.split('.').pop();
  const nameWithoutExt = originalName.replace(`.${extension}`, '').replace(/[^a-zA-Z0-9]/g, '_');
  return `${nameWithoutExt}_${timestamp}_${randomStr}.${extension}`;
}

/**
 * Subir archivo a Supabase Storage
 */
export async function uploadFile(
  file: File,
  actionPlanId: string
): Promise<{ success: boolean; data?: FileAttachment; error?: string }> {
  try {
    // Validar archivo
    const validation = validateFile(file);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Generar nombre único
    const uniqueFileName = generateUniqueFileName(file.name);
    const filePath = `${actionPlanId}/${uniqueFileName}`;

    // Subir archivo
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('Error subiendo archivo:', uploadError);
      return { success: false, error: uploadError.message };
    }

    // Obtener URL pública
    const { data: publicUrlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(filePath);

    if (!publicUrlData?.publicUrl) {
      return { success: false, error: 'No se pudo obtener URL pública del archivo' };
    }

    // Crear objeto de archivo adjunto
    const attachment: FileAttachment = {
      name: file.name,
      url: publicUrlData.publicUrl,
      type: file.type,
      size: file.size,
      uploaded_at: new Date().toISOString()
    };

    return { success: true, data: attachment };
  } catch (error: any) {
    console.error('Error en uploadFile:', error);
    return { success: false, error: error.message || 'Error desconocido al subir archivo' };
  }
}

/**
 * Subir múltiples archivos
 */
export async function uploadMultipleFiles(
  files: File[],
  actionPlanId: string,
  onProgress?: (current: number, total: number) => void
): Promise<{ success: boolean; data?: FileAttachment[]; errors?: string[] }> {
  const attachments: FileAttachment[] = [];
  const errors: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(i + 1, files.length);

    const result = await uploadFile(file, actionPlanId);
    if (result.success && result.data) {
      attachments.push(result.data);
    } else {
      errors.push(`${file.name}: ${result.error}`);
    }
  }

  return {
    success: errors.length === 0,
    data: attachments,
    errors: errors.length > 0 ? errors : undefined
  };
}

/**
 * Eliminar archivo de Supabase Storage
 */
export async function deleteFile(fileUrl: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Extraer el path del archivo desde la URL
    const url = new URL(fileUrl);
    const pathParts = url.pathname.split(`/${STORAGE_BUCKET}/`);
    if (pathParts.length < 2) {
      return { success: false, error: 'URL de archivo inválida' };
    }

    const filePath = pathParts[1];

    // Eliminar archivo
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([filePath]);

    if (error) {
      console.error('Error eliminando archivo:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error en deleteFile:', error);
    return { success: false, error: error.message || 'Error desconocido al eliminar archivo' };
  }
}

/**
 * Formatear tamaño de archivo para mostrar
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Obtener icono según tipo de archivo
 */
export function getFileIcon(fileType: string): string {
  if (fileType.startsWith('image/')) return '🖼️';
  if (fileType === 'application/pdf') return '📄';
  if (fileType.includes('word') || fileType.includes('document')) return '📝';
  if (fileType.includes('excel') || fileType.includes('spreadsheet')) return '📊';
  if (fileType.includes('powerpoint') || fileType.includes('presentation')) return '📽️';
  if (fileType.startsWith('text/')) return '📃';
  if (fileType.includes('zip') || fileType.includes('rar')) return '🗜️';
  return '📎';
}

// Inicializar storage al cargar el módulo
initializeStorage();
