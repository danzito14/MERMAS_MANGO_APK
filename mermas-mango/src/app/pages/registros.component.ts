import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { CatalogoService } from '../core/catalogo.service';
import { ToastService } from '../core/toast.service';
import { CatalogoItem, LocalRegistro } from '../core/models';
import { ProductoSelectorComponent } from '../shared/producto-selector.component';
import { fmtKg, formatFecha, numSize, semanaActual, tipoIcon, tipoLabel } from '../core/util';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-registros',
  standalone: true,
  imports: [FormsModule, RouterLink, ProductoSelectorComponent],
  template: `
    <div class="page-head">
      <div>
        <h2 class="page-title">Registros</h2>
        <p class="page-sub">Consulta y filtra las mermas.</p>
      </div>
      @if (auth.canCreate()) {
        <a class="btn btn--primary" routerLink="/captura"><i class="fa-solid fa-plus" aria-hidden="true"></i> Nueva merma</a>
      }
    </div>

    <form class="filters card" (ngSubmit)="filtrar()">
      <app-producto-selector />
      <div class="field"><label for="f_lote">LOTE</label><input id="f_lote" name="lote" [(ngModel)]="fLote" placeholder="Todos" autocomplete="off" spellcheck="false" autocapitalize="characters" /></div>
      <div class="field"><label for="f_linea">LINEA</label><input id="f_linea" name="linea" [(ngModel)]="fLinea" placeholder="Todas" autocomplete="off" /></div>
      <div class="field">
        <label for="f_tipo">TIPO</label>
        <select id="f_tipo" name="tipo" [(ngModel)]="fTipo">
          <option value="">Todos</option>
          <option value="a">Solo aprovechable</option>
          <option value="r">Solo residuos</option>
          @for (t of tipos(); track t.id) { <option [value]="t.id">{{ t.nombre }}</option> }
        </select>
      </div>
      <div class="field"><label for="f_desde">DESDE</label><input id="f_desde" type="date" name="desde" [(ngModel)]="fDesde" /></div>
      <div class="field"><label for="f_hasta">HASTA</label><input id="f_hasta" type="date" name="hasta" [(ngModel)]="fHasta" /></div>
      <div class="filters__actions">
        <button class="btn btn--primary" type="submit"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i> Filtrar</button>
        <button class="btn btn--ghost" type="button" (click)="estaSemana()"><i class="fa-solid fa-calendar-week" aria-hidden="true"></i> Esta semana</button>
        <button class="btn btn--ghost" type="button" (click)="limpiar()"><i class="fa-solid fa-eraser" aria-hidden="true"></i> Limpiar</button>
      </div>
    </form>

    <div class="stats stats--mini">
      <div class="stat stat--green"><div class="stat__body"><div class="stat__num {{ size(sumAprov()) }}">{{ sumAprov() }}</div><div class="stat__label">Aprovechable (kg)</div></div><span class="stat__icon"><i class="fa-solid fa-leaf" aria-hidden="true"></i></span></div>
      <div class="stat stat--amber"><div class="stat__body"><div class="stat__num {{ size(sumCasc()) }}">{{ sumCasc() }}</div><div class="stat__label">No aprovechable (kg)</div></div><span class="stat__icon"><i class="fa-solid fa-bone" aria-hidden="true"></i></span></div>
      <div class="stat stat--strong"><div class="stat__body"><div class="stat__num {{ size(sumTotal()) }}">{{ sumTotal() }}</div><div class="stat__label">Total pagina (kg)</div></div><span class="stat__icon"><i class="fa-solid fa-scale-balanced" aria-hidden="true"></i></span></div>
    </div>

    <div class="list">
      @if (loading()) {
        <div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>
      } @else if (pageItems().length === 0) {
        <div class="empty"><i class="fa-solid fa-inbox" aria-hidden="true"></i><strong>Sin resultados</strong><span>{{ all().length === 0 ? 'Aun no hay registros.' : 'Ningun registro coincide con el filtro.' }}</span></div>
      } @else {
        @for (r of pageItems(); track r._key) {
          <div class="item" [class.item--casc]="!r.aprovechable" [class.item--pending]="r._pending">
            <span class="item__icon"><i class="fa-solid {{ icon(r.aprovechable) }}" aria-hidden="true"></i></span>
            <div class="item__main">
              <div class="item__top">
                <span class="item__kg {{ size(kg(r.cant_kg)) }}">{{ kg(r.cant_kg) }} kg</span>
                <span class="badge" [class.badge--casc]="!r.aprovechable"><i class="fa-solid {{ icon(r.aprovechable) }}" aria-hidden="true"></i> {{ label(r.tipo_merma, r.aprovechable) }}</span>
                @if (r._pending) { <span class="badge badge--pending"><i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i> Pendiente</span> }
              </div>
              <div class="item__meta">
                @if (r.producto) { <span class="meta-cat"><i class="fa-solid fa-lemon" aria-hidden="true"></i>{{ r.producto }}</span> }
                <span><i class="fa-solid fa-box" aria-hidden="true"></i>{{ r.lote }}</span>
                <span><i class="fa-solid fa-industry" aria-hidden="true"></i>{{ r.linea_prod }}</span>
                <span><i class="fa-solid fa-clock" aria-hidden="true"></i>{{ fecha(r.fecha_hora) }}</span>
                @if (r.variedad) { <span class="meta-cat"><i class="fa-solid fa-seedling" aria-hidden="true"></i>{{ r.variedad }}</span> }
                @if (r.caracteristica) { <span class="meta-cat"><i class="fa-solid fa-tags" aria-hidden="true"></i>{{ r.caracteristica }}</span> }
                @if (r.registrado_por) { <span><i class="fa-solid fa-user" aria-hidden="true"></i>{{ r.registrado_por }}</span> }
              </div>
            </div>
            @if (auth.canModify()) {
              <div class="item__actions">
                <a class="iconaction" [routerLink]="['/captura', r._key]" title="Editar"><i class="fa-solid fa-pen" aria-hidden="true"></i></a>
                <button class="iconaction iconaction--danger" type="button" (click)="pedirEliminar(r._key)" title="Eliminar"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>
              </div>
            }
          </div>
        }
      }
    </div>

    <div class="pager">
      <button class="btn btn--ghost" type="button" [disabled]="page() <= 0" (click)="prev()"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i> Anterior</button>
      <span class="pager__info">Pagina {{ page() + 1 }} de {{ maxPage() + 1 }}</span>
      <button class="btn btn--ghost" type="button" [disabled]="page() >= maxPage()" (click)="next()">Siguiente <i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
    </div>

    @if (confirmKey()) {
      <div class="overlay" (click)="cancelarEliminar()"></div>
      <div class="confirm">
        <h3 class="confirm__title"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Confirmar</h3>
        <p class="confirm__msg">Se eliminara este registro de merma. Esta accion no se puede deshacer.</p>
        <div class="confirm__actions">
          <button class="btn btn--ghost" type="button" (click)="cancelarEliminar()">Cancelar</button>
          <button class="btn btn--danger" type="button" (click)="confirmarEliminar()">Eliminar</button>
        </div>
      </div>
    }
  `,
})
export class RegistrosComponent implements OnInit {
  private api = inject(ApiService);
  auth = inject(AuthService);
  private cat = inject(CatalogoService);
  private toast = inject(ToastService);

  fLote = ''; fLinea = ''; fTipo = ''; fDesde = ''; fHasta = '';
  all = signal<LocalRegistro[]>([]);
  tipos = signal<CatalogoItem[]>([]);

  constructor() {
    // El producto se elige en la barra de arriba: al cambiarlo se recarga la lista.
    effect(() => { this.cat.productoActivo(); if (this.iniciado) { this.page.set(0); this.cargar(true); } });
  }
  private iniciado = false;
  page = signal(0);
  loading = signal(true);
  confirmKey = signal<string | null>(null);

  fecha = formatFecha; label = tipoLabel; icon = tipoIcon; kg = fmtKg; size = numSize;

  maxPage = computed(() => Math.max(0, Math.ceil(this.all().length / PAGE_SIZE) - 1));
  pageItems = computed(() => { const s = this.page() * PAGE_SIZE; return this.all().slice(s, s + PAGE_SIZE); });
  sumAprov = computed(() => fmtKg(this.sumaNum(true)));
  sumCasc = computed(() => fmtKg(this.sumaNum(false)));
  sumTotal = computed(() => fmtKg(this.sumaNum(true) + this.sumaNum(false)));

  /** Suma cruda (numero), para no parsear textos ya formateados con comas. */
  private sumaNum(aprovechable: boolean): number {
    return this.pageItems().filter((r) => !!r.aprovechable === aprovechable).reduce((a, r) => a + (Number(r.cant_kg) || 0), 0);
  }

  ngOnInit() {
    // Abre con la semana actual (lunes a domingo).
    const s = semanaActual();
    this.fDesde = s.desde;
    this.fHasta = s.hasta;
    this.cat.cargar('tipos-merma').then((t) => this.tipos.set(t.filter((x) => x.activo))).catch(() => {});
    this.iniciado = true;
    this.cargar(true);
  }

  private async cargar(refresh: boolean) {
    if (refresh) { this.loading.set(true); await this.api.refresh(); }
    const res = await this.api.query({
      lote: this.fLote.trim().toUpperCase(), linea_prod: this.fLinea.trim(),
      // el filtro de tipo es un id, o 'a'/'r' para todo lo aprovechable / todos los residuos
      id_tipo_merma: this.fTipo && this.fTipo !== 'a' && this.fTipo !== 'r' ? Number(this.fTipo) : undefined,
      aprovechable: this.fTipo === 'a' ? true : this.fTipo === 'r' ? false : undefined,
      id_producto: this.cat.productoActivo() ?? undefined,
      desde: this.fDesde || undefined, hasta: this.fHasta || undefined, skip: 0, limit: 1000000,
    });
    if (this.page() > 0 && this.page() * PAGE_SIZE >= res.items.length) this.page.set(0);
    this.all.set(res.items);
    this.loading.set(false);
  }

  filtrar() { this.page.set(0); this.cargar(true); }
  estaSemana() { const s = semanaActual(); this.fDesde = s.desde; this.fHasta = s.hasta; this.page.set(0); this.cargar(true); }
  limpiar() { this.fLote = ''; this.fLinea = ''; this.fTipo = ''; this.fDesde = ''; this.fHasta = ''; this.page.set(0); this.cargar(true); }
  prev() { if (this.page() > 0) this.page.update((p) => p - 1); }
  next() { if (this.page() < this.maxPage()) this.page.update((p) => p + 1); }

  pedirEliminar(key: string) { this.confirmKey.set(key); }
  cancelarEliminar() { this.confirmKey.set(null); }
  async confirmarEliminar() {
    const key = this.confirmKey();
    this.confirmKey.set(null);
    if (!key) return;
    try {
      const res = await this.api.eliminar(key);
      this.toast.show(res.queued ? 'Eliminado sin conexion (se sincronizara)' : 'Registro eliminado', res.queued ? 'info' : 'ok');
      await this.cargar(false);
    } catch (e: any) {
      this.toast.show(e?.status === 403 ? 'No tienes permiso para eliminar' : 'No se pudo eliminar', 'error');
    }
  }
}
