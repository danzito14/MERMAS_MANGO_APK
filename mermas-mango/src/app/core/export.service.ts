import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { ApiService } from './api.service';
import { InformeLote, LocalRegistro } from './models';
import { formatFecha, tipoLabel } from './util';

/** Genera y descarga/comparte el informe de un lote como CSV. */
@Injectable({ providedIn: 'root' })
export class ExportService {
  private api = inject(ApiService);

  async informeLoteCsv(r: InformeLote): Promise<void> {
    const registros = (await this.api.query({ lote: r.lote, skip: 0, limit: 1000000 })).items;
    const csv = this.buildCsv(r, registros);
    await this.saveCsv(`informe-lote-${r.lote}.csv`, csv);
  }

  private cell(v: any): string {
    const s = String(v ?? '');
    return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  private buildCsv(r: InformeLote, registros: LocalRegistro[]): string {
    const nl = '\r\n';
    const L: string[] = [];
    L.push('Informe de merma por lote');
    L.push(['Lote', this.cell(r.lote)].join(','));
    L.push(['Generado', this.cell(formatFecha(new Date().toISOString()))].join(','));
    L.push('');
    L.push('Resumen');
    L.push(['Tipo', 'Total (kg)', 'Registros'].join(','));
    L.push(['Aprovechable', this.cell(r.total_aprovechable), ''].join(','));
    L.push(['Cascara / Hueso', this.cell(r.total_cascara_hueso), ''].join(','));
    L.push(['Total general', this.cell(r.total_general), this.cell(r.num_registros)].join(','));
    L.push('');
    L.push('Detalle');
    L.push(['Fecha', 'Linea', 'Tipo', 'Cantidad (kg)', 'Registro'].join(','));
    registros
      .slice()
      .sort((a, b) => (a.fecha_hora || '').localeCompare(b.fecha_hora || ''))
      .forEach((x) => L.push([this.cell(formatFecha(x.fecha_hora)), this.cell(x.linea_prod), this.cell(tipoLabel(x.tipo_merma)), this.cell(x.cant_kg), this.cell(x.registrado_por || '')].join(',')));
    return '﻿' + L.join(nl); // BOM para que Excel lea bien los acentos
  }

  private async saveCsv(filename: string, csv: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      // En el APK: guarda el archivo y abre el menu compartir (guardar en Drive, enviar, etc.).
      const res = await Filesystem.writeFile({ path: filename, data: csv, directory: Directory.Cache, encoding: Encoding.UTF8 });
      await Share.share({ title: filename, text: 'Informe de merma', url: res.uri });
    } else {
      // En el navegador: descarga directa.
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
