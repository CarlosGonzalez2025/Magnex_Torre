/**
 * carnetExport.ts
 *
 * Genera el Carnet Digital como imagen (PNG) y como PDF tamaño credencial,
 * para IMPRESIÓN FÍSICA (perforable). Contiene datos ESTABLES:
 *   - Identidad + foto
 *   - Licencias (categoría, vencimiento, estado)
 *   - Tira de perforación de faltas
 *   - QR fijo (resuelve el carnet en línea y el registro de novedades)
 *   - Logo Magnex al pie
 *
 * NO incluye el puntaje/semáforo: fluctúa con los resultados y en el papel
 * quedaría congelado. Ese dato vivo se muestra solo en la versión digital
 * que se abre al escanear el QR (CarnetPublico).
 */

import React from 'react';
import { Document, Page, Image as PdfImage, pdf } from '@react-pdf/renderer';

export interface CarnetLicencia {
  tipo: string;
  categoria: string | null;
  fecha_venc: string | null;
  estado: string | null;
}

export interface CarnetExportData {
  nombres: string;
  cedula: string;
  cargo?: string | null;
  proyecto?: string | null;
  fotoUrl?: string | null;
  tieneIbutton: boolean;
  tipoLicencia?: string | null;
  licencias?: CarnetLicencia[];
}

const C_ROJO = '#dc2626', C_AMBAR = '#f59e0b', C_VERDE = '#16a34a', C_SLATE = '#64748b';
const BRAND = '#0f2e52'; // azul Magnex (neutro; no depende del semáforo)

const CARD_W = 700;
const CARD_H = 1150;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function fmtFecha(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-CO');
}

function statusColor(estado: string | null): string {
  const s = (estado || '').toLowerCase();
  if (s.includes('vencid')) return C_ROJO;
  if (s.includes('vigente')) return C_VERDE;
  if (s.includes('vencer') || s.includes('proxim') || s.includes('próxim')) return C_AMBAR;
  return C_SLATE;
}

export async function renderCarnetPNG(
  data: CarnetExportData,
  qrCanvas: HTMLCanvasElement | null,
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Header (azul Magnex)
  const headerH = 240;
  ctx.fillStyle = BRAND;
  ctx.fillRect(0, 0, CARD_W, headerH);
  // Guía de perforación (superior)
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 3; ctx.setLineDash([6, 6]);
  ctx.beginPath(); ctx.arc(CARD_W / 2, 30, 14, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
  ctx.font = 'bold 34px Arial, sans-serif';
  ctx.fillText('SEGURIDAD VIAL', CARD_W / 2, 130);
  ctx.font = '20px Arial, sans-serif';
  ctx.fillText('Carnet del Conductor', CARD_W / 2, 162);

  // Foto
  const photoR = 80, pcx = CARD_W / 2, pcy = headerH;
  const img = data.fotoUrl ? await loadImage(data.fotoUrl) : null;
  ctx.save();
  ctx.beginPath(); ctx.arc(pcx, pcy, photoR, 0, Math.PI * 2); ctx.clip();
  if (img) ctx.drawImage(img, pcx - photoR, pcy - photoR, photoR * 2, photoR * 2);
  else {
    ctx.fillStyle = '#334155'; ctx.fillRect(pcx - photoR, pcy - photoR, photoR * 2, photoR * 2);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 66px Arial'; ctx.textBaseline = 'middle';
    ctx.fillText((data.nombres || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase(), pcx, pcy + 4);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(pcx, pcy, photoR, 0, Math.PI * 2); ctx.stroke();

  // Nombre + cédula
  let y = pcy + photoR + 52;
  ctx.textAlign = 'center'; ctx.fillStyle = '#0f172a';
  let fs = 36; ctx.font = `bold ${fs}px Arial`;
  const nombre = (data.nombres || '').toUpperCase();
  while (ctx.measureText(nombre).width > CARD_W - 60 && fs > 20) { fs -= 2; ctx.font = `bold ${fs}px Arial`; }
  ctx.fillText(nombre, CARD_W / 2, y);
  y += 38; ctx.fillStyle = '#475569'; ctx.font = '26px Arial';
  ctx.fillText(`CC ${data.cedula}${data.cargo ? '  ·  ' + data.cargo : ''}`, CARD_W / 2, y);
  if (data.proyecto) { y += 30; ctx.fillStyle = '#64748b'; ctx.font = '20px Arial'; ctx.fillText(data.proyecto, CARD_W / 2, y); }

  // Licencias
  y += 52;
  ctx.textAlign = 'left'; ctx.fillStyle = '#0f172a'; ctx.font = 'bold 22px Arial';
  ctx.fillText('LICENCIAS', 44, y);
  const lics = (data.licencias ?? []).filter(l => l.categoria || l.fecha_venc || l.estado);
  if (lics.length === 0) {
    y += 32; ctx.fillStyle = '#94a3b8'; ctx.font = '20px Arial';
    ctx.fillText(data.tipoLicencia ? `Tipo: ${data.tipoLicencia}` : 'Sin información de licencias', 44, y);
  } else {
    for (const l of lics) {
      y += 42;
      ctx.fillStyle = '#334155'; ctx.font = 'bold 21px Arial'; ctx.textAlign = 'left';
      ctx.fillText(`${l.tipo}${l.categoria ? ' · ' + l.categoria : ''}`, 44, y);
      ctx.fillStyle = '#64748b'; ctx.font = '18px Arial';
      ctx.fillText(`Vence: ${fmtFecha(l.fecha_venc)}`, 300, y);
      const est = l.estado || '—';
      ctx.font = 'bold 17px Arial';
      const cw = ctx.measureText(est).width + 26, cx0 = CARD_W - 44 - cw;
      ctx.fillStyle = statusColor(l.estado);
      roundRect(ctx, cx0, y - 20, cw, 28, 14); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(est, cx0 + cw / 2, y);
      ctx.textAlign = 'left';
    }
  }

  // Tira de perforación de faltas
  y += 50;
  ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(44, y - 24); ctx.lineTo(CARD_W - 44, y - 24); ctx.stroke();
  ctx.fillStyle = '#0f172a'; ctx.font = 'bold 20px Arial'; ctx.textAlign = 'left';
  ctx.fillText('CONTROL DE FALTAS EN CAMPO', 44, y);
  y += 36;
  const N = 6, gap = (CARD_W - 88) / N, cr = 22;
  for (let i = 0; i < N; i++) {
    const cxp = 44 + gap * i + gap / 2;
    ctx.beginPath(); ctx.arc(cxp, y, cr, 0, Math.PI * 2);
    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#cbd5e1'; ctx.font = '16px Arial'; ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), cxp, y + 6);
  }
  y += cr + 22;
  ctx.fillStyle = '#94a3b8'; ctx.font = '15px Arial'; ctx.textAlign = 'center';
  ctx.fillText('Perforar al identificar una falta · registrar la novedad escaneando el QR', CARD_W / 2, y);

  // QR
  y += 24;
  const qrS = 190, qrX = (CARD_W - qrS) / 2;
  ctx.fillStyle = '#fff'; roundRect(ctx, qrX - 10, y, qrS + 20, qrS + 20, 12); ctx.fill();
  ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2; ctx.stroke();
  if (qrCanvas) ctx.drawImage(qrCanvas, qrX, y + 10, qrS, qrS);
  y += qrS + 44;
  ctx.fillStyle = '#334155'; ctx.font = '17px Arial'; ctx.textAlign = 'center';
  ctx.fillText('Escanea para ver el estado y reportar novedad', CARD_W / 2, y);

  // Logo Magnex al pie
  y += 16;
  const logo = await loadImage('/logo.png');
  if (logo) {
    const boxW = 240, boxH = 46, boxX = (CARD_W - boxW) / 2, boxY = y;
    const r = Math.min(boxW / logo.width, boxH / logo.height);
    ctx.drawImage(logo, boxX + (boxW - logo.width * r) / 2, boxY + (boxH - logo.height * r) / 2, logo.width * r, logo.height * r);
    y += boxH;
  }
  y += 8; ctx.fillStyle = '#94a3b8'; ctx.font = '14px Arial'; ctx.textAlign = 'center';
  ctx.fillText(data.tieneIbutton ? 'iButton ✓' : 'Sin iButton', CARD_W / 2, y);

  return canvas.toDataURL('image/png');
}

/** Envuelve el PNG en un PDF proporcional al carnet. */
export async function carnetPdfBlob(pngDataUrl: string): Promise<Blob> {
  const w = 60, h = 60 * (CARD_H / CARD_W); // mm
  const mm = 2.83465;
  const doc = React.createElement(
    Document, null,
    React.createElement(
      Page, { size: [w * mm, h * mm] as [number, number] },
      React.createElement(PdfImage, { src: pngDataUrl, style: { width: '100%', height: '100%', objectFit: 'cover' } }),
    ),
  );
  return await pdf(doc as any).toBlob();
}

export function descargar(nameBase: string, content: string | Blob, ext: string) {
  const url = typeof content === 'string' ? content : URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url; a.download = `${nameBase}.${ext}`; a.click();
  if (typeof content !== 'string') URL.revokeObjectURL(url);
}
