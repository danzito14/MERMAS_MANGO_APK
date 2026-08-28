import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { ExportService } from '../core/export.service';
import { ToastService } from '../core/toast.service';
import { InformeDia, Unidad } from '../core/models';
import { fmtKg, hoyYmd, semanaActual } from '../core/util';

@Component({
  selector: 'app-informe',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page-head">
      <div>
        <h2 class="page-title">Informe por dia</h2>
        <p class="page-sub">Totales por fecha y tipo de merma.</p>
      </div>
      <button class="btn btn--ghost" type="button" (click)="cargar()"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Actualizar</button>
    </div>

    <form class="filters card" (ngSubmit)="cargar()">
      <div class="field"><label for="i_desde">DESDE</label><input id="i_desde" type="date" name="desde" [(ngModel)]="iDesde" /></div>
      <div class="field"><label for="i_hasta">HASTA</label><input id="i_hasta" type="date" name="hasta" [(ngModel)]="iHasta" /></div>
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
      </div>
    </form>

    <div class="list">
      @if (loading()) {
        <div class="skeleton"></div><div class="skeleton"></div>
      } @else if (items().length === 0) {
        <div class="empty"><i class="fa-solid fa-chart-column" aria-hidden="true"></i><strong>Sin datos</strong><span>No hay registros para mostrar en el informe.</span></div>
      } @else {
        @for (r of items(); track r.fecha) {
          <div class="card informe-card">
            <div class="informe__head">
              <span class="informe__lote"><i class="fa-solid fa-calendar-day" aria-hidden="true"></i> {{ fmtDia(r.fecha) }}</span>
              <div class="informe__actions">
                <span class="badge badge--lote">{{ r.num_registros }} {{ r.num_registros === 1 ? 'registro' : 'registros' }}</span>
                <button class="btn btn--ghost btn--sm" type="button" (click)="descargar(r)" [disabled]="descargando() === r.fecha">
                  <i class="fa-solid fa-download" aria-hidden="true"></i> {{ descargando() === r.fecha ? 'Generando...' : 'Descargar' }}
                </button>
              </div>
            </div>
            <div class="informe__grid">
              <div class="informe__cell"><div class="k">APROVECHABLE</div><div class="v">{{ kg(r.total_aprovechable) }} {{ u(r) }}</div></div>
              <div class="informe__cell informe__cell--casc"><div class="k">NO APROVECHABLE</div><div class="v">{{ kg(r.total_no_aprovechable) }} {{ u(r) }}</div></div>
              <div class="informe__cell informe__cell--total"><div class="k">TOTAL GENERAL</div><div class="v">{{ kg(r.total_general) }} {{ u(r) }}</div></div>
            </div>
            @if (r.por_tipo && r.por_tipo.length > 1) {
              <div class="item__meta" style="padding:0 14px 12px">
                @for (t of r.por_tipo; track t.id_tipo_merma) {
                  <span class="meta-cat"><i class="fa-solid" [class.fa-leaf]="t.aprovechable" [class.fa-bone]="!t.aprovechable" aria-hidden="true"></i>{{ t.tipo_merma }}: {{ kg(t.cant) }} {{ u(r) }}</span>
                }
              </div>
            }
          </div>
        }
      }
    </div>
  `,
})
export class InformeComponent implements OnInit {
  private api = inject(ApiService);
  private exporter = inject(ExportService);
  private toast = inject(ToastService);

  kg = fmtKg;
  unidad = signal<Unidad>('kg');
  iDesde = '';
  iHasta = '';
  items = signal<InformeDia[]>([]);
  loading = signal(true);
  descargando = signal<string | null>(null);

  ngOnInit() {
    // Abre con la semana actual (lunes a domingo).
    const s = semanaActual();
    this.iDesde = s.desde;
    this.iHasta = s.hasta;
    this.cargar();
  }

  /** Etiqueta: la unidad que confirmo el backend en la fila, no la que se pidio. */
  u(r: InformeDia): string { return r.unidad || this.unidad(); }

  cambiarUnidad(u: Unidad) {
    if (this.unidad() === u) return;
    this.unidad.set(u);
    this.cargar();
  }

  fmtDia(f: string): string {
    const d = new Date(f + 'T00:00:00');
    if (isNaN(d.getTime())) return f;
    return d.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  }

  async cargar() {
    this.loading.set(true);
    try {
      const res = await this.api.informe(this.iDesde || undefined, this.iHasta || undefined, this.unidad());
      this.items.set(res.items);
    } catch {
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  hoy() { const d = hoyYmd(); this.iDesde = d; this.iHasta = d; this.cargar(); }
  estaSemana() { const s = semanaActual(); this.iDesde = s.desde; this.iHasta = s.hasta; this.cargar(); }
  limpiar() { this.iDesde = ''; this.iHasta = ''; this.cargar(); }

  async descargar(r: InformeDia) {
    this.descargando.set(r.fecha);
    try {
      await this.exporter.informeDiaCsv(r, this.unidad());
    } catch (e: any) {
      const msg = String(e?.message || e || '');
      if (!/cancel/i.test(msg)) this.toast.show('No se pudo descargar el informe', 'error');
    } finally {
      this.descargando.set(null);
    }
  }
}
