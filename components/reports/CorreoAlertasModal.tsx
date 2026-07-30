import React from 'react';
import type { CorreoAlertas } from '../../services/dailyEmailTemplates';
import { CorreoModal } from './CorreoModal';

interface CorreoAlertasModalProps {
  correo: CorreoAlertas;
  contratoNombre: string;
  onClose: () => void;
}

export const CorreoAlertasModal: React.FC<CorreoAlertasModalProps> = ({ correo, contratoNombre, onClose }) => {
  const esCritico = correo.tipo === 'critico';

  return (
    <CorreoModal
      titulo={`Correo de alertas — ${contratoNombre}`}
      subtitulo={esCritico
        ? 'Plantilla crítica (excesos ≥ 80 km/h)'
        : 'Plantilla preventiva (sin excesos ≥ 80 km/h)'}
      tono={esCritico ? 'rojo' : 'verde'}
      asunto={correo.asunto}
      cuerpo={correo.cuerpo}
      onClose={onClose}
    />
  );
};
