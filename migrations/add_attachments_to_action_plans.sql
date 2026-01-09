-- Agregar campo para archivos adjuntos en planes de acción
-- Este campo almacenará un array de objetos JSON con información de cada archivo

ALTER TABLE action_plans
ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

-- Comentario descriptivo
COMMENT ON COLUMN action_plans.attachments IS 'Array de archivos adjuntos como evidencia del plan de acción. Formato: [{"name": "archivo.pdf", "url": "https://...", "type": "application/pdf", "size": 12345, "uploaded_at": "2026-01-09T..."}]';

-- Crear índice GIN para búsquedas eficientes en JSONB
CREATE INDEX IF NOT EXISTS idx_action_plans_attachments ON action_plans USING GIN (attachments);
