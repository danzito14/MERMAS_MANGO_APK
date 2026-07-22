import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { ApiService } from './api.service';
import { InformeDia, LocalRegistro, ReporteLote } from './models';
import { numKg, formatFecha, tipoLabel } from './util';

/** Genera y descarga/comparte el informe de un dia como CSV. */
@Injectable({ providedIn: 'root' })
export class ExportService {
  private api = inject(ApiService);

  async informeDiaCsv(r: InformeDia): Promise<void> {
    const registros = (await this.api.query({ fecha: r.fecha, skip: 0, limit: 1000000 })).items;
    const csv = this.buildCsv(r, registros);
    await this.saveCsv(`informe-${r.fecha}.csv`, csv);
  }

  /** Reporte por lote (estilo Excel) del rango completo. */
  async reporteLoteCsv(r: ReporteLote): Promise<void> {
    const nl = '\r\n';
    const L: string[] = [];
    L.push('Reporte de merma por lote');
    L.push(['Rango', this.cell((r.desde || 'inicio') + ' a ' + (r.hasta || 'hoy'))].join(','));
    L.push(['Generado', this.cell(formatFecha(new Date().toISOString()))].join(','));
    L.push('');
    L.push(['Lote', 'Lineas', 'Rezaga aprovechable (lb)', 'Rezaga no aprovechable (lb)', 'Total rezaga (lb)', 'Registros'].join(','));
    r.lotes.forEach((f) => L.push([
      this.cell(f.lote), this.cell((f.lineas || []).join(' / ')),
      this.cell(numKg(f.rezaga_aprovechable)), this.cell(numKg(f.rezaga_no_aprovechable)),
      this.cell(numKg(f.total_rezaga)), this.cell(f.num_registros),
    ].join(',')));
    L.push(['TOTAL', '', this.cell(numKg(r.total_aprovechable)), this.cell(numKg(r.total_no_aprovechable)), this.cell(numKg(r.total_rezaga)), this.cell(r.num_registros)].join(','));
    const rango = (r.desde || 'inicio') + '_a_' + (r.hasta || 'hoy');
    await this.saveCsv(`reporte-lotes-${rango}.csv`, '﻿' + L.join(nl));
  }

  private cell(v: any): string {
    const s = String(v ?? '');
    return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  private buildCsv(r: InformeDia, registros: LocalRegistro[]): string {
    const nl = '\r\n';
    const L: string[] = [];
    L.push('Informe de merma por dia');
    L.push(['Fecha', this.cell(r.fecha)].join(','));
    L.push(['Generado', this.cell(formatFecha(new Date().toISOString()))].join(','));
    L.push('');
    L.push('Resumen');
    L.push(['Tipo', 'Total (lb)', 'Registros'].join(','));
    L.push(['Aprovechable', this.cell(numKg(r.total_aprovechable)), ''].join(','));
    L.push(['Cascara / Hueso', this.cell(numKg(r.total_cascara_hueso)), ''].join(','));
    L.push(['Total general', this.cell(numKg(r.total_general)), this.cell(r.num_registros)].join(','));
    L.push('');
    L.push('Detalle');
    L.push(['Hora', 'Lote', 'Linea', 'Tipo', 'Cantidad (lb)', 'Registro'].join(','));
    registros
      .slice()
      .sort((a, b) => (a.fecha_hora || '').localeCompare(b.fecha_hora || ''))
      .forEach((x) => L.push([
        this.cell((x.fecha_hora || '').slice(11, 16)),
        this.cell(x.lote), this.cell(x.linea_prod), this.cell(tipoLabel(x.tipo_merma)),
        this.cell(numKg(x.cant_kg)), this.cell(x.registrado_por || ''),
      ].join(',')));
    return '﻿' + L.join(nl); // BOM para Excel
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
