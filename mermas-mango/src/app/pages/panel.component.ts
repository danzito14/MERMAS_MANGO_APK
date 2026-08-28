import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { LocalRegistro } from '../core/models';
import { fmtKg, formatFecha, numSize, semanaActual, tipoIcon, tipoLabel } from '../core/util';

interface Stat { kind: string; icon: string; num: string; label: string; }

@Component({
  selector: 'app-panel',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="page-head">
      <div>
        <h2 class="page-title">Panel general</h2>
        <p class="page-sub">Resumen de la semana.</p>
      </div>
      <button class="btn btn--ghost" type="button" (click)="cargar()"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Actualizar</button>
    </div>

    <form class="filters card" (ngSubmit)="cargar()">
      <div class="field"><label for="p_desde">DESDE</label><input id="p_desde" type="date" name="desde" [(ngModel)]="desde" /></div>
      <div class="field"><label for="p_hasta">HASTA</label><input id="p_hasta" type="date" name="hasta" [(ngModel)]="hasta" /></div>
      <div class="filters__actions">
        <button class="btn btn--primary" type="submit"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i> Ver</button>
        <button class="btn btn--ghost" type="button" (click)="estaSemana()"><i class="fa-solid fa-calendar-week" aria-hidden="true"></i> Esta semana</button>
        <button class="btn btn--ghost" type="button" (click)="limpiar()"><i class="fa-solid fa-eraser" aria-hidden="true"></i> Todo</button>
      </div>
    </form>

    <div class="section-head">
      <span class="section-head__badge"><i class="fa-solid fa-boxes-stacked" aria-hidden="true"></i></span>
      <h3>Totales <span class="section-head__count">{{ rangoTxt() }} &middot; {{ nReg() }} registros</span></h3>
    </div>

    <div class="stats">
      @if (loading()) {
        <div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>
      } @else {
        @for (s of stats(); track s.label) {
          <div class="stat stat--{{ s.kind }}">
            <div class="stat__body"><div class="stat__num {{ size(s.num) }}">{{ s.num }}</div><div class="stat__label">{{ s.label }}</div></div>
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
        <div class="panel-hoy__big {{ size(hoyKg()) }}">{{ hoyKg() }} <small>kg</small></div>
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
        <div class="empty"><i class="fa-solid fa-inbox" aria-hidden="true"></i><strong>Sin registros en el rango</strong><span>Cambia las fechas o registra una merma.</span></div>
      }
      @for (r of ultimos(); track r._key) {
        <div class="item" [class.item--casc]="!r.aprovechable" [class.item--pending]="r._pending">
          <span class="item__icon"><i class="fa-solid {{ icon(r.aprovechable) }}" aria-hidden="true"></i></span>
          <div class="item__main">
            <div class="item__top"><span class="item__kg {{ size(kg(r.cant_kg)) }}">{{ kg(r.cant_kg) }} kg</span>
              <span class="badge" [class.badge--casc]="!r.aprovechable"><i class="fa-solid {{ icon(r.aprovechable) }}" aria-hidden="true"></i> {{ label(r.tipo_merma, r.aprovechable) }}</span>
              @if (r._pending) { <span class="badge badge--pending"><i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i> Pendiente</span> }
            </div>
            <div class="item__meta">
              @if (r.producto) { <span class="meta-cat"><i class="fa-solid fa-lemon" aria-hidden="true"></i>{{ r.producto }}</span> }
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

  desde = '';
  hasta = '';
  loading = signal(true);
  stats = signal<Stat[]>([]);
  nReg = signal(0);
  hoyKg = signal('0.00');
  hoyReg = signal(0);
  hoyFecha = signal('');
  pctAprov = signal(0);
  pctCasc = signal(0);
  ultimos = signal<LocalRegistro[]>([]);

  fecha = formatFecha; label = tipoLabel; icon = tipoIcon; kg = fmtKg; size = numSize;

  ngOnInit() {
    const s = semanaActual();
    this.desde = s.desde;
    this.hasta = s.hasta;
    this.cargar();
  }

  estaSemana() { const s = semanaActual(); this.desde = s.desde; this.hasta = s.hasta; this.cargar(); }
  limpiar() { this.desde = ''; this.hasta = ''; this.cargar(); }

  rangoTxt(): string {
    if (!this.desde && !this.hasta) return 'todo el historico';
    const f = (s: string) => (s ? new Date(s + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : '...');
    return f(this.desde) + ' a ' + f(this.hasta);
  }

  async cargar() {
    this.loading.set(true);
    await this.api.refresh();

    const now = new Date();
    const ymd = now.getFullYear() + '-' + this.p2(now.getMonth() + 1) + '-' + this.p2(now.getDate());
    const desde = this.desde || undefined;
    const hasta = this.hasta || undefined;

    const [inf, rango, hoy] = await Promise.all([
      this.api.informe(desde, hasta),
      this.api.query({ desde, hasta, skip: 0, limit: 1000000 }),
      this.api.query({ fecha: ymd, skip: 0, limit: 1000000 }),
    ]);

    // Totales del rango (semana por defecto)
    let sumA = 0, sumC = 0, nReg = 0;
    inf.items.forEach((r) => { sumA += Number(r.total_aprovechable) || 0; sumC += Number(r.total_no_aprovechable) || 0; nReg += r.num_registros || 0; });
    const total = sumA + sumC;
    const nLotes = new Set(rango.items.map((r) => r.lote)).size;
    this.nReg.set(nReg);
    this.stats.set([
      { kind: 'blue', icon: 'fa-list-ul', num: String(nReg), label: 'Registros' },
      { kind: 'strong', icon: 'fa-boxes-stacked', num: String(nLotes), label: 'Lotes' },
      { kind: 'green', icon: 'fa-leaf', num: fmtKg(sumA), label: 'Aprovechable (kg)' },
      { kind: 'amber', icon: 'fa-bone', num: fmtKg(sumC), label: 'No aprovechable (kg)' },
      { kind: 'strong', icon: 'fa-scale-balanced', num: fmtKg(total), label: 'Total general (kg)' },
    ]);

    // Resumen de hoy (siempre del dia actual, independiente del rango)
    let hA = 0, hC = 0;
    hoy.items.forEach((r) => {
      const kg = Number(r.cant_kg) || 0;
      if (r.aprovechable) hA += kg; else hC += kg;
    });
    const hTot = hA + hC;
    this.hoyKg.set(fmtKg(hTot));
    this.hoyReg.set(hoy.items.length);
    this.hoyFecha.set(new Date(ymd + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }));
    const pa = hTot > 0 ? Math.round((hA / hTot) * 100) : 0;
    this.pctAprov.set(pa);
    this.pctCasc.set(hTot > 0 ? 100 - pa : 0);

    this.ultimos.set(rango.items.slice().sort((a, b) => (b.fecha_hora || '').localeCompare(a.fecha_hora || '')).slice(0, 5));
    this.loading.set(false);
  }

  private p2(n: number): string { return (n < 10 ? '0' : '') + n; }
}
