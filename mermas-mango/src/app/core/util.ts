import { TipoMerma } from './models';

export function formatFecha(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function tipoLabel(t: TipoMerma | string): string {
  return t === 'cascara_hueso' ? 'Cascara / Hueso' : 'Aprovechable';
}

export function tipoIcon(t: TipoMerma | string): string {
  return t === 'cascara_hueso' ? 'fa-bone' : 'fa-leaf';
}
