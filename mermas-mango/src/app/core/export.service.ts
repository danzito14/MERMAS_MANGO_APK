import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { ApiService } from './api.service';
import { InformeDia, LocalRegistro, ReporteLote, Unidad } from './models';
import { numKg, formatFecha, tipoLabel, aUnidad } from './util';

/** Genera y descarga/comparte el informe de un dia como CSV. */
@Injectable({ providedIn: 'root' })
export class ExportService {
  private api = inject(ApiService);

  async informeDiaCsv(r: InformeDia, unidad: Unidad = 'kg', idProducto?: number | null): Promise<void> {
    const registros = await this.api.detalleRango(r.fecha, r.fecha, idProducto);
    const csv = this.buildCsv(r, registros, r.unidad || unidad);
    await this.saveCsv(`informe-${r.fecha}.csv`, csv);
  }

  /** Informe del rango completo: un resumen por dia, el total y el detalle de todo. */
  async informeRangoCsv(items: InformeDia[], desde: string, hasta: string, unidad: Unidad = 'kg', idProducto?: number | null): Promise<void> {
    const u = items[0]?.unidad || unidad;
    const registros = await this.api.detalleRango(desde || undefined, hasta || undefined, idProducto);
    const csv = this.buildRangoCsv(items, desde, hasta, registros, u);
    const rango = (desde || 'inicio') + '_a_' + (hasta || 'hoy');
    await this.saveCsv(`informe-${u}-${rango}.csv`, csv);
  }

  /** Reporte por lote (estilo Excel) del rango completo. */
  async reporteLoteCsv(r: ReporteLote): Promise<void> {
    const nl = '\r\n';
    const L: string[] = [];
    const u = r.unidad || 'kg';
    L.push('Reporte de merma por lote y linea');
    L.push(['Rango', this.cell((r.desde || 'inicio') + ' a ' + (r.hasta || 'hoy'))].join(','));
    L.push(['Generado', this.cell(formatFecha(new Date().toISOString()))].join(','));
    L.push('');
    L.push(['Producto', 'Lote', 'Linea', 'Variedades', 'Caracteristicas', 'Desglose por tipo', `Rezaga aprovechable (${u})`, `Rezaga no aprovechable (${u})`, `Total rezaga (${u})`, 'Registros'].join(','));
    r.lotes.forEach((f) => L.push([
      this.cell(f.producto || ''), this.cell(f.lote), this.cell(f.linea_prod || ''),
      this.cell((f.variedades || []).join(' / ')), this.cell((f.caracteristicas || []).join(' / ')),
      this.cell((f.por_tipo || []).map((t) => t.tipo_merma + ': ' + numKg(t.cant)).join(' / ')),
      this.cell(numKg(f.rezaga_aprovechable)), this.cell(numKg(f.rezaga_no_aprovechable)),
      this.cell(numKg(f.total_rezaga)), this.cell(f.num_registros),
    ].join(',')));
    L.push(['TOTAL', '', '', '', '', '', this.cell(numKg(r.total_aprovechable)), this.cell(numKg(r.total_no_aprovechable)), this.cell(numKg(r.total_rezaga)), this.cell(r.num_registros)].join(','));
    const rango = (r.desde || 'inicio') + '_a_' + (r.hasta || 'hoy');
    await this.saveCsv(`reporte-lotes-${u}-${rango}.csv`, '﻿' + L.join(nl));
  }

  private cell(v: any): string {
    const s = String(v ?? '');
    return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  private buildCsv(r: InformeDia, registros: LocalRegistro[], u: Unidad = 'kg'): string {
    const nl = '\r\n';
    const L: string[] = [];
    L.push('Informe de merma por dia');
    L.push(['Fecha', this.cell(r.fecha)].join(','));
    L.push(['Generado', this.cell(formatFecha(new Date().toISOString()))].join(','));
    L.push('');
    L.push('Resumen');
    L.push(['Tipo', `Total (${u})`, 'Registros'].join(','));
    L.push(['Aprovechable', this.cell(numKg(r.total_aprovechable)), ''].join(','));
    L.push(['No aprovechable', this.cell(numKg(r.total_no_aprovechable)), ''].join(','));
    L.push(['Total general', this.cell(numKg(r.total_general)), this.cell(r.num_registros)].join(','));
    if ((r.por_tipo || []).length > 1) {
      L.push('');
      L.push('Desglose por tipo');
      L.push(['Tipo', 'Aprovechable', `Total (${u})`].join(','));
      (r.por_tipo || []).forEach((t) => L.push([this.cell(t.tipo_merma), t.aprovechable ? 'si' : 'no', this.cell(numKg(t.cant))].join(',')));
    }
    this.pushDetalle(L, registros, u, false);
    return '﻿' + L.join(nl); // BOM para Excel
  }

  private buildRangoCsv(items: InformeDia[], desde: string, hasta: string, registros: LocalRegistro[], u: Unidad): string {
    const nl = '\r\n';
    const L: string[] = [];
    const dias = items.slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
    const num = (v: any) => Number(v) || 0;
    const tA = dias.reduce((s, d) => s + num(d.total_aprovechable), 0);
    const tN = dias.reduce((s, d) => s + num(d.total_no_aprovechable), 0);
    const tR = dias.reduce((s, d) => s + d.num_registros, 0);

    L.push('Informe de merma por rango de fechas');
    L.push(['Rango', this.cell((desde || 'inicio') + ' a ' + (hasta || 'hoy'))].join(','));
    L.push(['Dias con registros', this.cell(dias.length)].join(','));
    L.push(['Generado', this.cell(formatFecha(new Date().toISOString()))].join(','));
    L.push('');
    L.push('Resumen por dia');
    L.push(['Fecha', `Aprovechable (${u})`, `No aprovechable (${u})`, `Total general (${u})`, 'Registros'].join(','));
    dias.forEach((d) => L.push([
      this.cell(d.fecha), this.cell(numKg(d.total_aprovechable)),
      this.cell(numKg(d.total_no_aprovechable)), this.cell(numKg(d.total_general)), this.cell(d.num_registros),
    ].join(',')));
    L.push(['TOTAL', this.cell(numKg(tA)), this.cell(numKg(tN)), this.cell(numKg(tA + tN)), this.cell(tR)].join(','));

    const tipos = this.tiposDelRango(dias);
    if (tipos.length > 1) {
      L.push('');
      L.push('Desglose por tipo (todo el rango)');
      L.push(['Tipo', 'Aprovechable', `Total (${u})`].join(','));
      tipos.forEach((t) => L.push([this.cell(t.tipo_merma), t.aprovechable ? 'si' : 'no', this.cell(numKg(t.cant))].join(',')));
    }

    this.pushDetalle(L, registros, u, true);
    return '﻿' + L.join(nl);
  }

  /** Suma los `por_tipo` de cada dia en un solo desglose del rango. */
  private tiposDelRango(dias: InformeDia[]): { tipo_merma: string; aprovechable: boolean; cant: number }[] {
    const acc: Record<string, { tipo_merma: string; aprovechable: boolean; cant: number }> = {};
    dias.forEach((d) => (d.por_tipo || []).forEach((t) => {
      const clave = String(t.id_tipo_merma ?? t.tipo_merma);
      const g = acc[clave] || (acc[clave] = { tipo_merma: t.tipo_merma, aprovechable: t.aprovechable, cant: 0 });
      g.cant += Number(t.cant) || 0;
    }));
    return Object.values(acc).sort((a, b) => (a.aprovechable === b.aprovechable ? a.tipo_merma.localeCompare(b.tipo_merma) : a.aprovechable ? -1 : 1));
  }

  /** Detalle registro por registro; con columna de fecha cuando abarca varios dias. */
  private pushDetalle(L: string[], registros: LocalRegistro[], u: Unidad, conFecha: boolean): void {
    L.push('');
    L.push('Detalle');
    L.push([...(conFecha ? ['Fecha'] : []), 'Hora', 'Producto', 'Lote', 'Linea', 'Variedad', 'Caracteristica', 'Tipo', `Cantidad (${u})`, 'Registro'].join(','));
    registros
      .slice()
      .sort((a, b) => (a.fecha_hora || '').localeCompare(b.fecha_hora || ''))
      .forEach((x) => L.push([
        ...(conFecha ? [this.cell((x.fecha_hora || '').slice(0, 10))] : []),
        this.cell((x.fecha_hora || '').slice(11, 16)),
        this.cell(x.producto || ''), this.cell(x.lote), this.cell(x.linea_prod),
        this.cell(x.variedad || ''), this.cell(x.caracteristica || ''),
        this.cell(tipoLabel(x.tipo_merma, x.aprovechable)),
        this.cell(numKg(aUnidad(Number(x.cant_kg) || 0, u))), this.cell(x.registrado_por || ''),
      ].join(',')));
  }

  private async saveCsv(filename: string, csv: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      const res = await Filesystem.writeFile({ path: filename, data: csv, directory: Directory.Cache, encoding: Encoding.UTF8 });
      await Share.share({ title: filename, text: 'Informe de merma', url: res.uri });
    } else {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}
