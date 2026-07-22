import { TipoMerma } from './models';

export function formatFecha(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Numero limpio, SIN separador de miles (para inputs y CSV):
 * hasta 6 decimales quitando ceros sobrantes, minimo 2.
 * Ej: "6552.000000" -> "6552.00", "0.123456" -> "0.123456".
 */
export function numKg(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  let s = n.toFixed(6).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  const dot = s.indexOf('.');
  if (dot === -1) return s + '.00';
  const dec = s.length - dot - 1;
  return dec < 2 ? s + '0'.repeat(2 - dec) : s;
}

/** Igual que numKg pero CON comas de miles, para mostrar en pantalla. Ej: "157,889.80". */
export function fmtKg(v: string | number | null | undefined): string {
  const s = numKg(v);
  if (!s) return s;
  const [ent, dec] = s.split('.');
  return ent.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (dec ? '.' + dec : '');
}

/** Clase de tamano segun lo largo que sea el numero, para que no se desborde. */
export function numSize(v: string | null | undefined): string {
  const n = (v || '').length;
  if (n > 12) return 'num--xs';
  if (n > 10) return 'num--sm';
  if (n > 7) return 'num--md';
  return '';
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

/** Fecha de hoy en YYYY-MM-DD. */
export function hoyYmd(): string {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/** Semana actual como valores para inputs datetime-local (lunes 00:00 a domingo 23:59). */
export function semanaActualDT(): { desde: string; hasta: string } {
  const s = semanaActual();
  return { desde: s.desde + 'T00:00', hasta: s.hasta + 'T23:59' };
}

/** Hoy completo como valores para inputs datetime-local. */
export function hoyDT(): { desde: string; hasta: string } {
  const d = hoyYmd();
  return { desde: d + 'T00:00', hasta: d + 'T23:59' };
}

export function tipoLabel(t: TipoMerma | string): string {
  return t === 'cascara_hueso' ? 'Cascara / Hueso' : 'Aprovechable';
}

export function tipoIcon(t: TipoMerma | string): string {
  return t === 'cascara_hueso' ? 'fa-bone' : 'fa-leaf';
}
