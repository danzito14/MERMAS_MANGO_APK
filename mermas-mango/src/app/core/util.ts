import { TipoMerma } from './models';

export function formatFecha(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Formatea kilos para mostrar: soporta hasta 6 decimales pero quita los ceros
 * sobrantes, dejando minimo 2. Ej: "6552.000000" -> "6552.00", "0.123456" -> "0.123456".
 */
export function fmtKg(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  let s = n.toFixed(6).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  const dot = s.indexOf('.');
  if (dot === -1) return s + '.00';
  const dec = s.length - dot - 1;
  return dec < 2 ? s + '0'.repeat(2 - dec) : s;
}

/** Rango de la semana actual (lunes a domingo) en formato YYYY-MM-DD. */
export function semanaActual(): { desde: string; hasta: string } {
  const hoy = new Date();
  const dow = (hoy.getDay() + 6) % 7;          // 0 = lunes
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() - dow);
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);
  const f = (d: Date) =>
    d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  return { desde: f(lunes), hasta: f(domingo) };
}

export function tipoLabel(t: TipoMerma | string): string {
  return t === 'cascara_hueso' ? 'Cascara / Hueso' : 'Aprovechable';
}

export function tipoIcon(t: TipoMerma | string): string {
  return t === 'cascara_hueso' ? 'fa-bone' : 'fa-leaf';
}
