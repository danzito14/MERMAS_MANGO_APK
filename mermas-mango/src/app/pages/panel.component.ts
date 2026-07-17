import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { LocalRegistro } from '../core/models';
import { formatFecha, tipoIcon, tipoLabel } from '../core/util';

interface Stat { kind: string; icon: string; num: string; label: string; }

@Component({
  selector: 'app-panel',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="page-head">
      <div>
        <h2 class="page-title">Panel general</h2>
        <p class="page-sub">Resumen de las mermas registradas por lote.</p>
      </div>
      <button class="btn btn--ghost" type="button" (click)="cargar()"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Actualizar</button>
    </div>

    <div class="section-head">
      <span class="section-head__badge"><i class="fa-solid fa-boxes-stacked" aria-hidden="true"></i></span>
      <h3>Totales <span class="section-head__count">({{ nReg() }} registros)</span></h3>
    </div>

    <div class="stats">
      @if (loading()) {
        <div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>
      } @else {
        @for (s of stats(); track s.label) {
          <div class="stat stat--{{ s.kind }}">
            <div class="stat__body"><div class="stat__num">{{ s.num }}</div><div class="stat__label">{{ s.label }}</div></div>
            <span class="stat__icon"><i class="fa-solid {{ s.icon }}" aria-hidden="true"></i></span>
          </div>
        }
      }
    </div>

    <div class="section-head">
      <span class="section-head__badge section-head__badge--amber"><i class="fa-solid fa-calendar-day" aria-hidden="true"></i></span>
      <h3>Resumen de hoy <span class="section-head__count">{{ hoyFecha() }}</span></h3>
    </div>

    <div class="card panel-hoy">
      <div class="panel-hoy__main">
        <div class="panel-hoy__big">{{ hoyKg() }} <small>kg</small></div>
        <div class="panel-hoy__txt">
          <strong>{{ hoyReg() }} {{ hoyReg() === 1 ? 'registro' : 'registros' }}</strong>
          <span class="muted">mermas registradas hoy</span>
        </div>
      </div>
      <div class="distro">
        <div class="distro__bar">
          <span class="distro__seg distro__seg--aprov" [style.width.%]="pctAprov()"></span>
          <span class="distro__seg distro__seg--casc" [style.width.%]="pctCasc()"></span>
        </div>
        <div class="distro__legend">
          <span><i class="fa-solid fa-leaf" aria-hidden="true"></i> Aprovechable <b>{{ pctAprov() }}%</b></span>
          <span><i class="fa-solid fa-bone" aria-hidden="true"></i> Cascara/Hueso <b>{{ pctCasc() }}%</b></span>
        </div>
      </div>
    </div>

    <div class="section-head">
      <span class="section-head__badge section-head__badge--blue"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i></span>
      <h3>Ultimos registros</h3>
      <a class="link" routerLink="/registros">Ver todos <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>
    </div>
    <div class="list">
      @if (!loading() && ultimos().length === 0) {
        <div class="empty"><i class="fa-solid fa-inbox" aria-hidden="true"></i><strong>Sin registros aun</strong><span>Crea tu primera merma desde el menu.</span></div>
      }
      @for (r of ultimos(); track r._key) {
        <div class="item" [class.item--casc]="r.tipo_merma === 'cascara_hueso'" [class.item--pending]="r._pending">
          <span class="item__icon"><i class="fa-solid {{ icon(r.tipo_merma) }}" aria-hidden="true"></i></span>
          <div class="item__main">
            <div class="item__top"><span class="item__kg">{{ r.cant_kg }} kg</span>
              <span class="badge" [class.badge--casc]="r.tipo_merma === 'cascara_hueso'"><i class="fa-solid {{ icon(r.tipo_merma) }}" aria-hidden="true"></i> {{ label(r.tipo_merma) }}</span>
              @if (r._pending) { <span class="badge badge--pending"><i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i> Pendiente</span> }
            </div>
            <div class="item__meta">
              <span><i class="fa-solid fa-box" aria-hidden="true"></i>{{ r.lote }}</span>
              <span><i class="fa-solid fa-industry" aria-hidden="true"></i>{{ r.linea_prod }}</span>
              <span><i class="fa-solid fa-clock" aria-hidden="true"></i>{{ fecha(r.fecha_hora) }}</span>
              @if (r.registrado_por) { <span><i class="fa-solid fa-user" aria-hidden="true"></i>{{ r.registrado_por }}</span> }
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class PanelComponent implements OnInit {
  private api = inject(ApiService);

  loading = signal(true);
  stats = signal<Stat[]>([]);
  nReg = signal(0);
  hoyKg = signal('0.00');
  hoyReg = signal(0);
  hoyFecha = signal('');
  pctAprov = signal(0);
  pctCasc = signal(0);
  ultimos = signal<LocalRegistro[]>([]);

  fecha = formatFecha; label = tipoLabel; icon = tipoIcon;

  ngOnInit() { this.cargar(); }

  async cargar() {
    this.loading.set(true);
    await this.api.refresh();
    const [inf, all] = await Promise.all([this.api.informe(), this.api.query({ skip: 0, limit: 1000000 })]);
    const items = all.items;

    let sumA = 0, sumC = 0, nReg = 0;
    inf.items.forEach((r) => { sumA += Number(r.total_aprovechable) || 0; sumC += Number(r.total_cascara_hueso) || 0; nReg += r.num_registros || 0; });
    const total = sumA + sumC;
    const nLotes = new Set(items.map((r) => r.lote)).size;
    this.nReg.set(nReg);
    this.stats.set([
      { kind: 'blue', icon: 'fa-list-ul', num: String(nReg), label: 'Registros totales' },
      { kind: 'strong', icon: 'fa-boxes-stacked', num: String(nLotes), label: 'Lotes' },
      { kind: 'green', icon: 'fa-leaf', num: sumA.toFixed(2), label: 'Aprovechable (kg)' },
      { kind: 'amber', icon: 'fa-bone', num: sumC.toFixed(2), label: 'Cascara / Hueso (kg)' },
      { kind: 'strong', icon: 'fa-scale-balanced', num: total.toFixed(2), label: 'Total general (kg)' },
    ]);

    const now = new Date();
    const ymd = now.getFullYear() + '-' + this.p2(now.getMonth() + 1) + '-' + this.p2(now.getDate());
    let hA = 0, hC = 0, hN = 0;
    items.forEach((r) => {
      if ((r.fecha_hora || '').slice(0, 10) === ymd) {
        const kg = Number(r.cant_kg) || 0;
        if (r.tipo_merma === 'aprovechable') hA += kg; else hC += kg;
        hN++;
      }
    });
    const hTot = hA + hC;
    this.hoyKg.set(hTot.toFixed(2));
    this.hoyReg.set(hN);
    this.hoyFecha.set(new Date(ymd + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }));
    const pa = hTot > 0 ? Math.round((hA / hTot) * 100) : 0;
    this.pctAprov.set(pa);
    this.pctCasc.set(hTot > 0 ? 100 - pa : 0);

    this.ultimos.set(items.slice().sort((a, b) => (b.fecha_hora || '').localeCompare(a.fecha_hora || '')).slice(0, 5));
    this.loading.set(false);
  }

  private p2(n: number): string { return (n < 10 ? '0' : '') + n; }
}
