import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { InformeLote } from '../core/models';

@Component({
  selector: 'app-informe',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page-head">
      <div>
        <h2 class="page-title">Informe por lote</h2>
        <p class="page-sub">Totales agrupados por lote y tipo de merma.</p>
      </div>
      <button class="btn btn--ghost" type="button" (click)="cargar()"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Actualizar</button>
    </div>

    <form class="filters card" (ngSubmit)="cargar()">
      <div class="field"><label for="i_lote">LOTE</label><input id="i_lote" name="lote" [(ngModel)]="iLote" placeholder="Todos los lotes" autocomplete="off" /></div>
      <div class="filters__actions">
        <button class="btn btn--primary" type="submit"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i> Ver</button>
      </div>
    </form>

    <div class="list">
      @if (loading()) {
        <div class="skeleton"></div><div class="skeleton"></div>
      } @else if (items().length === 0) {
        <div class="empty"><i class="fa-solid fa-chart-column" aria-hidden="true"></i><strong>Sin datos</strong><span>No hay registros para mostrar en el informe.</span></div>
      } @else {
        @for (r of items(); track r.lote) {
          <div class="card informe-card">
            <div class="informe__head">
              <span class="informe__lote"><i class="fa-solid fa-box" aria-hidden="true"></i> {{ r.lote }}</span>
              <span class="badge badge--lote">{{ r.num_registros }} {{ r.num_registros === 1 ? 'registro' : 'registros' }}</span>
            </div>
            <div class="informe__grid">
              <div class="informe__cell"><div class="k">APROVECHABLE</div><div class="v">{{ r.total_aprovechable }} kg</div></div>
              <div class="informe__cell informe__cell--casc"><div class="k">CASCARA / HUESO</div><div class="v">{{ r.total_cascara_hueso }} kg</div></div>
              <div class="informe__cell informe__cell--total"><div class="k">TOTAL GENERAL</div><div class="v">{{ r.total_general }} kg</div></div>
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class InformeComponent implements OnInit {
  private api = inject(ApiService);
  iLote = '';
  items = signal<InformeLote[]>([]);
  loading = signal(true);

  ngOnInit() { this.cargar(); }

  async cargar() {
    this.loading.set(true);
    try {
      const res = await this.api.informe(this.iLote.trim() || undefined);
      this.items.set(res.items);
    } catch {
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }
}
