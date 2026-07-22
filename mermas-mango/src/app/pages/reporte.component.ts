import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { ExportService } from '../core/export.service';
import { ToastService } from '../core/toast.service';
import { ReporteLote } from '../core/models';
import { fmtKg, semanaActual } from '../core/util';

@Component({
  selector: 'app-reporte',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page-head">
      <div>
        <h2 class="page-title">Reporte por lote</h2>
        <p class="page-sub">Rezaga por lote en un rango de fechas.</p>
      </div>
      <button class="btn btn--ghost" type="button" (click)="cargar()"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Actualizar</button>
    </div>

    <form class="filters card" (ngSubmit)="cargar()">
      <div class="field"><label for="r_desde">DESDE</label><input id="r_desde" type="date" name="desde" [(ngModel)]="desde" /></div>
      <div class="field"><label for="r_hasta">HASTA</label><input id="r_hasta" type="date" name="hasta" [(ngModel)]="hasta" /></div>
      <div class="filters__actions">
        <button class="btn btn--primary" type="submit"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i> Ver</button>
        <button class="btn btn--ghost" type="button" (click)="limpiar()"><i class="fa-solid fa-eraser" aria-hidden="true"></i> Limpiar</button>
        @if (data()?.lotes?.length) {
          <button class="btn btn--ghost" type="button" (click)="descargar()" [disabled]="descargando()">
            <i class="fa-solid fa-download" aria-hidden="true"></i> {{ descargando() ? 'Generando...' : 'Descargar' }}
          </button>
        }
      </div>
    </form>

    @if (loading()) {
      <div class="list"><div class="skeleton"></div><div class="skeleton"></div></div>
    } @else if (data(); as d) {
      @if (d.lotes.length === 0) {
        <div class="empty"><i class="fa-solid fa-table" aria-hidden="true"></i><strong>Sin datos</strong><span>No hay registros en el rango seleccionado.</span></div>
      } @else {
        <div class="card table-wrap">
          <table class="rep">
            <thead>
              <tr>
                <th>Lote</th>
                <th>Lineas</th>
                <th class="num">Aprovechable (kg)</th>
                <th class="num">No aprovechable (kg)</th>
                <th class="num">Total rezaga (kg)</th>
                <th class="num">Reg.</th>
              </tr>
            </thead>
            <tbody>
              @for (f of d.lotes; track f.lote) {
                <tr>
                  <td>{{ f.lote }}</td>
                  <td>{{ (f.lineas || []).join(', ') || '-' }}</td>
                  <td class="num">{{ kg(f.rezaga_aprovechable) }}</td>
                  <td class="num">{{ kg(f.rezaga_no_aprovechable) }}</td>
                  <td class="num strong">{{ kg(f.total_rezaga) }}</td>
                  <td class="num">{{ f.num_registros }}</td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <td>TOTAL</td>
                <td></td>
                <td class="num">{{ kg(d.total_aprovechable) }}</td>
                <td class="num">{{ kg(d.total_no_aprovechable) }}</td>
                <td class="num strong">{{ kg(d.total_rezaga) }}</td>
                <td class="num">{{ d.num_registros }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      }
    } @else {
      <div class="empty"><i class="fa-solid fa-table" aria-hidden="true"></i><strong>Sin datos</strong><span>No hay registros para mostrar.</span></div>
    }
  `,
})
export class ReporteComponent implements OnInit {
  private api = inject(ApiService);
  private exporter = inject(ExportService);
  private toast = inject(ToastService);

  kg = fmtKg;
  desde = '';
  hasta = '';
  data = signal<ReporteLote | null>(null);
  loading = signal(true);
  descargando = signal(false);

  ngOnInit() {
    // Abre con la semana actual (lunes a domingo).
    const s = semanaActual();
    this.desde = s.desde;
    this.hasta = s.hasta;
    this.cargar();
  }

  async cargar() {
    this.loading.set(true);
    try {
      const res = await this.api.reporte(this.desde || undefined, this.hasta || undefined);
      this.data.set(res.data);
    } catch {
      this.data.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  limpiar() { this.desde = ''; this.hasta = ''; this.cargar(); }

  async descargar() {
    const d = this.data();
    if (!d) return;
    this.descargando.set(true);
    try {
      await this.exporter.reporteLoteCsv(d);
    } catch (e: any) {
      const m = String(e?.message || e || '');
      if (!/cancel/i.test(m)) this.toast.show('No se pudo descargar el reporte', 'error');
    } finally {
      this.descargando.set(false);
    }
  }
}
