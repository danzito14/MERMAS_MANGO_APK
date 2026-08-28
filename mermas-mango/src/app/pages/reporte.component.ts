import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { CatalogoService } from '../core/catalogo.service';
import { ProductoSelectorComponent } from '../shared/producto-selector.component';
import { ExportService } from '../core/export.service';
import { ToastService } from '../core/toast.service';
import { ReporteLote, ReporteLoteFila, Unidad } from '../core/models';
import { fmtKg, hoyDT, semanaActualDT } from '../core/util';

@Component({
  selector: 'app-reporte',
  standalone: true,
  imports: [FormsModule, ProductoSelectorComponent],
  template: `
    <div class="page-head">
      <div>
        <h2 class="page-title">Reporte por lote y linea</h2>
        <p class="page-sub">Rezaga de cada lote en cada linea, en un rango de fechas.</p>
      </div>
      <button class="btn btn--ghost" type="button" (click)="cargar()"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Actualizar</button>
    </div>

    <form class="filters card" (ngSubmit)="cargar()">
      <app-producto-selector />
      <div class="field"><label for="r_desde">DESDE (fecha y hora)</label><input id="r_desde" type="datetime-local" step="1" name="desde" [(ngModel)]="desde" /></div>
      <div class="field"><label for="r_hasta">HASTA (fecha y hora)</label><input id="r_hasta" type="datetime-local" step="1" name="hasta" [(ngModel)]="hasta" /></div>
      <div class="field">
        <label>UNIDAD</label>
        <div class="segmented segmented--mini" role="group" aria-label="Unidad">
          <button type="button" class="seg seg--mini" [class.is-active]="unidad() === 'kg'" (click)="cambiarUnidad('kg')">Kilogramos</button>
          <button type="button" class="seg seg--mini" [class.is-active]="unidad() === 'lb'" (click)="cambiarUnidad('lb')">Libras</button>
        </div>
      </div>
      <div class="filters__actions">
        <button class="btn btn--primary" type="submit"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i> Ver</button>
        <button class="btn btn--ghost" type="button" (click)="hoy()"><i class="fa-solid fa-calendar-day" aria-hidden="true"></i> Hoy</button>
        <button class="btn btn--ghost" type="button" (click)="estaSemana()"><i class="fa-solid fa-calendar-week" aria-hidden="true"></i> Esta semana</button>
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
                @if (conProducto()) { <th>Producto</th> }
                <th>Lote</th>
                <th>Linea</th>
                <th>Variedades</th>
                <th>Caracteristicas</th>
                @if (conDesglose()) { <th>Desglose por tipo</th> }
                <th class="num">Aprovechable ({{ u() }})</th>
                <th class="num">No aprovechable ({{ u() }})</th>
                <th class="num">Total rezaga ({{ u() }})</th>
                <th class="num">Reg.</th>
              </tr>
            </thead>
            <tbody>
              @for (f of d.lotes; track (f.id_producto || '') + '|' + f.lote + '|' + f.linea_prod) {
                <tr>
                  @if (conProducto()) { <td>{{ f.producto || '-' }}</td> }
                  <td>{{ f.lote }}</td>
                  <td>{{ f.linea_prod || '-' }}</td>
                  <td>{{ (f.variedades || []).join(', ') || '-' }}</td>
                  <td>{{ (f.caracteristicas || []).join(', ') || '-' }}</td>
                  @if (conDesglose()) { <td>{{ desglose(f) }}</td> }
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
                @if (conProducto()) { <td></td> }
                <td></td>
                <td></td>
                <td></td>
                @if (conDesglose()) { <td></td> }
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
  private cat = inject(CatalogoService);

  constructor() {
    effect(() => { this.cat.productoActivo(); if (this.iniciado) this.cargar(); });
  }
  private iniciado = false;
  private exporter = inject(ExportService);
  private toast = inject(ToastService);

  kg = fmtKg;
  desde = '';
  hasta = '';
  unidad = signal<Unidad>('kg');
  data = signal<ReporteLote | null>(null);
  loading = signal(true);
  descargando = signal(false);

  /** Etiqueta: la unidad que confirmo el backend, no la que se pidio. */
  u(): string { return this.data()?.unidad || this.unidad(); }

  /** La columna de producto solo aparece si el backend la manda (el anterior no la tiene). */
  conProducto(): boolean { return (this.data()?.lotes || []).some((f) => !!f.producto); }

  /** Igual con el desglose por tipo: solo si hay mas de un tipo capturado. */
  conDesglose(): boolean { return (this.data()?.lotes || []).some((f) => (f.por_tipo || []).length > 1); }

  desglose(f: ReporteLoteFila): string {
    return (f.por_tipo || []).map((t) => t.tipo_merma + ': ' + fmtKg(t.cant)).join(' / ') || '-';
  }

  ngOnInit() {
    // Abre con la semana actual (lunes 00:00 a domingo 23:59).
    const s = semanaActualDT();
    this.desde = s.desde;
    this.hasta = s.hasta;
    this.iniciado = true;
    this.cargar();
  }

  cambiarUnidad(u: Unidad) {
    if (this.unidad() === u) return;
    this.unidad.set(u);
    this.cargar();
  }

  async cargar() {
    this.loading.set(true);
    try {
      const res = await this.api.reporte(this.desde || undefined, this.hasta || undefined, this.unidad(), this.cat.productoActivo() ?? undefined);
      this.data.set(res.data);
    } catch {
      this.data.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  /** Usa el endpoint dedicado del backend para el reporte de hoy. */
  async hoy() {
    const h = hoyDT();
    this.desde = h.desde;
    this.hasta = h.hasta;
    this.loading.set(true);
    try {
      const res = await this.api.reporteHoy(this.unidad(), this.cat.productoActivo() ?? undefined);
      this.data.set(res.data);
    } catch {
      this.data.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  estaSemana() { const s = semanaActualDT(); this.desde = s.desde; this.hasta = s.hasta; this.cargar(); }
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
