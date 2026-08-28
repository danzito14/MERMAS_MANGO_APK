import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CatalogoDatos, CatalogoService } from '../core/catalogo.service';
import { ToastService } from '../core/toast.service';
import { AuthService } from '../core/auth.service';
import { ApiError, CatalogoItem, CatalogoTipo } from '../core/models';

const META: Record<CatalogoTipo, { titulo: string; sub: string; singular: string; icono: string; ph: string }> = {
  productos: {
    titulo: 'Productos',
    sub: 'Productos que se procesan (mango, naranja, ...). Cada uno tiene sus propias variedades.',
    singular: 'producto',
    icono: 'fa-lemon',
    ph: 'Mango',
  },
  'tipos-merma': {
    titulo: 'Tipos de merma',
    sub: 'En que se separa la merma. La bandera "se aprovecha" es la que suma en los reportes.',
    singular: 'tipo de merma',
    icono: 'fa-recycle',
    ph: 'Hueso',
  },
  variedades: {
    titulo: 'Variedades',
    sub: 'Variedades de cada producto que aparecen al capturar.',
    singular: 'variedad',
    icono: 'fa-seedling',
    ph: 'KEITT',
  },
  caracteristicas: {
    titulo: 'Caracteristicas',
    sub: 'Estado de la fruta que aparece al capturar.',
    singular: 'caracteristica',
    icono: 'fa-tags',
    ph: 'Maduro',
  },
};

@Component({
  selector: 'app-catalogos',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page-head">
      <div>
        <h2 class="page-title">Catalogos</h2>
        <p class="page-sub">{{ meta().sub }}</p>
      </div>
      <button class="btn btn--ghost" type="button" (click)="cargar()"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Actualizar</button>
    </div>

    <div class="segmented segmented--tipo" style="margin-bottom:16px">
      @if (cat.soportaProductos()) {
        <button type="button" class="seg" [class.is-active]="tipo() === 'productos'" (click)="ir('productos')">
          <i class="fa-solid fa-lemon" aria-hidden="true"></i> Productos
        </button>
      }
      @if (cat.soportaTipos()) {
        <button type="button" class="seg" [class.is-active]="tipo() === 'tipos-merma'" (click)="ir('tipos-merma')">
          <i class="fa-solid fa-recycle" aria-hidden="true"></i> Tipos
        </button>
      }
      <button type="button" class="seg" [class.is-active]="tipo() === 'variedades'" (click)="ir('variedades')">
        <i class="fa-solid fa-seedling" aria-hidden="true"></i> Variedades
      </button>
      <button type="button" class="seg" [class.is-active]="tipo() === 'caracteristicas'" (click)="ir('caracteristicas')">
        <i class="fa-solid fa-tags" aria-hidden="true"></i> Caracteristicas
      </button>
    </div>

    @if (tipo() !== 'productos' && hayProductos()) {
      <div class="card form" style="margin-bottom:16px">
        <div class="field">
          <label for="cat_prod">PRODUCTO</label>
          <select id="cat_prod" name="prod" [ngModel]="idProducto()" (ngModelChange)="cambiarProducto($event)">
            @for (p of productos(); track p.id) { <option [ngValue]="p.id">{{ p.nombre }}</option> }
          </select>
          <small class="hint">
            {{ tipo() === 'variedades'
              ? 'Cada variedad pertenece a un producto: el mismo nombre puede existir en dos productos distintos.'
              : 'Se muestran los de este producto y los que aplican a todos.' }}
          </small>
        </div>
      </div>
    }

    @if (tipo() === 'variedades' && cat.soportaProductos() && !hayProductos()) {
      <div class="empty"><i class="fa-solid fa-lemon" aria-hidden="true"></i><strong>Primero crea un producto</strong><span>Las variedades pertenecen a un producto.</span></div>
    } @else {
      <form class="card form" (ngSubmit)="crear()">
        <h3 class="card__title"><i class="fa-solid fa-plus" aria-hidden="true"></i> Nueva {{ meta().singular }}</h3>
        <div class="field">
          <label for="cat_nombre">NOMBRE <span class="req">*</span></label>
          <input id="cat_nombre" name="nombre" [(ngModel)]="nuevo" maxlength="60" [placeholder]="meta().ph" autocomplete="off" spellcheck="false" [class.is-invalid]="!!errNuevo()" />
          @if (errNuevo()) { <span class="error">{{ errNuevo() }}</span> }
        </div>
        @if (tipo() === 'productos') {
          <div class="field">
            <label for="cat_etq">NOMBRE DE LA MERMA NO APROVECHABLE</label>
            <input id="cat_etq" name="etq" [(ngModel)]="nuevaEtq" maxlength="60" placeholder="Cascara y Hueso" autocomplete="off" spellcheck="false" />
            <small class="hint">Como se llama al capturar la merma que no se aprovecha de este producto.</small>
          </div>
        }
        @if (tipo() === 'tipos-merma') {
          <label class="switch">
            <input type="checkbox" name="apr" [(ngModel)]="nuevaAprov" />
            <span class="switch__track"><span class="switch__thumb"></span></span>
            <span class="switch__label">Se aprovecha (si no, cuenta como residuo)</span>
          </label>
        }
        @if (tipo() !== 'productos' && tipo() !== 'variedades' && hayProductos()) {
          <label class="switch">
            <input type="checkbox" name="glob" [(ngModel)]="nuevaGlobal" />
            <span class="switch__track"><span class="switch__thumb"></span></span>
            <span class="switch__label">Aplica a todos los productos</span>
          </label>
        }
        <div class="form__actions">
          <button class="btn btn--primary" type="submit" [disabled]="guardando()"><i class="fa-solid fa-plus" aria-hidden="true"></i> Agregar</button>
        </div>
      </form>
    }

    <div class="section-head">
      <span class="section-head__badge"><i class="fa-solid {{ meta().icono }}" aria-hidden="true"></i></span>
      <h3>{{ meta().titulo }} <span class="section-head__count">({{ items().length }})</span></h3>
    </div>
    <div class="list">
      @if (loading()) {
        <div class="skeleton"></div><div class="skeleton"></div>
      } @else if (items().length === 0) {
        <div class="empty"><i class="fa-solid {{ emptyIcon() }}" aria-hidden="true"></i><strong>{{ emptyTitle() }}</strong><span>{{ emptySub() }}</span></div>
      } @else {
        @for (it of items(); track it.id) {
          <div class="item">
            <span class="item__icon"><i class="fa-solid {{ meta().icono }}" aria-hidden="true"></i></span>
            <div class="item__main">
              <div class="item__top">
                <span class="item__kg" style="font-size:1.05rem">{{ it.nombre }}</span>
                @if (!it.activo) { <span class="badge badge--off"><i class="fa-solid fa-ban" aria-hidden="true"></i> Inactiva</span> }
                @if (tipo() === 'tipos-merma') {
                  <span class="badge" [class.badge--casc]="!it.aprovechable">
                    <i class="fa-solid" [class.fa-leaf]="it.aprovechable" [class.fa-bone]="!it.aprovechable" aria-hidden="true"></i>
                    {{ it.aprovechable ? 'Se aprovecha' : 'Residuo' }}
                  </span>
                }
                @if (tipo() !== 'productos' && tipo() !== 'variedades' && hayProductos() && it.id_producto == null) {
                  <span class="badge"><i class="fa-solid fa-globe" aria-hidden="true"></i> Todos</span>
                }
              </div>
              @if (tipo() === 'productos') {
                <div class="item__meta"><span><i class="fa-solid fa-bone" aria-hidden="true"></i>{{ it.etiqueta_no_aprovechable }}</span></div>
              }
            </div>
            <div class="item__actions">
              <button class="iconaction" type="button" (click)="abrirEditar(it)" title="Editar"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
              <button class="iconaction" type="button" (click)="alternar(it)" [disabled]="guardando()" [title]="it.activo ? 'Desactivar' : 'Activar'">
                <i class="fa-solid" [class.fa-toggle-on]="it.activo" [class.fa-toggle-off]="!it.activo" aria-hidden="true"></i>
              </button>
              <button class="iconaction iconaction--danger" type="button" (click)="confirmDel.set(it)" title="Eliminar"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>
            </div>
          </div>
        }
      }
    </div>

    @if (editando(); as it) {
      <div class="overlay" (click)="editando.set(null)"></div>
      <div class="confirm">
        <h3 class="confirm__title"><i class="fa-solid fa-pen" aria-hidden="true"></i> Editar {{ meta().singular }}</h3>
        <div class="form" style="gap:12px">
          <div class="field">
            <label>NOMBRE</label>
            <input name="en" [(ngModel)]="eNombre" maxlength="60" spellcheck="false" [class.is-invalid]="!!eErr()" />
            @if (eErr()) { <span class="error">{{ eErr() }}</span> }
          </div>
          @if (tipo() === 'productos') {
            <div class="field">
              <label>NOMBRE DE LA MERMA NO APROVECHABLE</label>
              <input name="ee" [(ngModel)]="eEtq" maxlength="60" placeholder="Cascara y Hueso" spellcheck="false" />
            </div>
          }
          @if (tipo() === 'tipos-merma') {
            <label class="switch">
              <input type="checkbox" name="eap" [(ngModel)]="eAprov" />
              <span class="switch__track"><span class="switch__thumb"></span></span>
              <span class="switch__label">Se aprovecha (si no, cuenta como residuo)</span>
            </label>
          }
          @if (tipo() !== 'productos' && tipo() !== 'variedades' && hayProductos()) {
            <label class="switch">
              <input type="checkbox" name="eg" [(ngModel)]="eGlobal" />
              <span class="switch__track"><span class="switch__thumb"></span></span>
              <span class="switch__label">Aplica a todos los productos</span>
            </label>
          }
          <label class="switch">
            <input type="checkbox" name="ea" [(ngModel)]="eActivo" />
            <span class="switch__track"><span class="switch__thumb"></span></span>
            <span class="switch__label">Activa (aparece al capturar)</span>
          </label>
        </div>
        <div class="confirm__actions">
          <button class="btn btn--ghost" type="button" (click)="editando.set(null)">Cancelar</button>
          <button class="btn btn--primary" type="button" (click)="guardarEditar(it)" [disabled]="guardando()">Guardar</button>
        </div>
      </div>
    }

    @if (confirmDel(); as it) {
      <div class="overlay" (click)="confirmDel.set(null)"></div>
      <div class="confirm">
        <h3 class="confirm__title"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Eliminar {{ meta().singular }}</h3>
        <p class="confirm__msg">
          Se eliminara <b>{{ it.nombre }}</b>.
          {{ tipo() === 'tipos-merma'
            ? 'Si ya se uso en alguna merma el servidor no lo permite (los registros quedarian sin tipo): desactivalo.'
            : 'Si ya se uso en registros, es mejor desactivarla para conservar el historial.' }}
        </p>
        <div class="confirm__actions">
          <button class="btn btn--ghost" type="button" (click)="confirmDel.set(null)">Cancelar</button>
          <button class="btn btn--ghost" type="button" (click)="desactivarDesdeModal(it)">Desactivar</button>
          <button class="btn btn--danger" type="button" (click)="eliminar(it)">Eliminar</button>
        </div>
      </div>
    }
  `,
})
export class CatalogosComponent implements OnInit {
  cat = inject(CatalogoService);
  private toast = inject(ToastService);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  tipo = signal<CatalogoTipo>('variedades');
  items = signal<CatalogoItem[]>([]);
  productos = signal<CatalogoItem[]>([]);
  idProducto = signal<number | null>(null);
  loading = signal(true);
  guardando = signal(false);

  nuevo = ''; nuevaEtq = ''; nuevaGlobal = false; nuevaAprov = false;
  errNuevo = signal('');

  editando = signal<CatalogoItem | null>(null);
  eNombre = ''; eEtq = ''; eActivo = true; eGlobal = false; eAprov = false;
  eErr = signal('');

  confirmDel = signal<CatalogoItem | null>(null);

  emptyIcon = signal('fa-seedling');
  emptyTitle = signal('Sin registros');
  emptySub = signal('Agrega el primero con el formulario de arriba.');

  meta() { return META[this.tipo()]; }
  hayProductos() { return this.cat.soportaProductos() && this.productos().length > 0; }

  ngOnInit() {
    this.route.paramMap.subscribe((p) => {
      const t = p.get('tipo');
      this.tipo.set(t === 'caracteristicas' ? 'caracteristicas' : t === 'productos' ? 'productos' : t === 'tipos-merma' ? 'tipos-merma' : 'variedades');
      this.editando.set(null);
      this.confirmDel.set(null);
      this.errNuevo.set('');
      this.nuevo = ''; this.nuevaEtq = ''; this.nuevaGlobal = false; this.nuevaAprov = false;
      this.cargar();
    });
  }

  ir(t: CatalogoTipo) { this.router.navigate(['/catalogos', t]); }

  async cambiarProducto(id: number | null) {
    this.idProducto.set(id);
    await this.cargar();
  }

  async cargar() {
    this.loading.set(true);
    try {
      // Los productos hacen falta siempre: las variedades/caracteristicas cuelgan de uno.
      const prods = await this.cat.cargar('productos');
      this.productos.set(prods);
      if (this.hayProductos() && (this.idProducto() == null || !prods.some((p) => p.id === this.idProducto()))) {
        const pref = this.cat.productoPreferido();
        this.idProducto.set(pref != null && prods.some((p) => p.id === pref) ? pref : prods[0].id);
      }
      this.items.set(this.tipo() === 'productos' ? prods : await this.cat.cargar(this.tipo(), this.contexto()));
      this.emptyIcon.set(this.meta().icono);
      this.emptyTitle.set('Sin registros');
      this.emptySub.set('Agrega el primero con el formulario de arriba.');
    } catch (e) {
      const err = e as ApiError;
      this.items.set([]);
      if (err?.status === 403) { this.emptyIcon.set('fa-lock'); this.emptyTitle.set('Sin permiso'); this.emptySub.set('Solo un administrador puede editar los catalogos.'); }
      else if (err?.network) { this.emptyIcon.set('fa-wifi'); this.emptyTitle.set('Sin conexion'); this.emptySub.set('Conectate para ver los catalogos.'); }
      else { this.emptyIcon.set('fa-triangle-exclamation'); this.emptyTitle.set('No se pudo cargar'); this.emptySub.set('Intenta de nuevo.'); }
    } finally {
      this.loading.set(false);
    }
  }

  /** Producto con el que se piden y se dan de alta los items del catalogo actual. */
  private contexto(): number | null {
    return this.tipo() === 'productos' || !this.hayProductos() ? null : this.idProducto();
  }

  async crear() {
    const nombre = this.nuevo.trim();
    if (!nombre) { this.errNuevo.set('Escribe el nombre.'); return; }
    if (this.existe(nombre, null)) { this.errNuevo.set('Ya existe con ese nombre.'); return; }
    this.errNuevo.set('');

    const datos: CatalogoDatos = { nombre };
    if (this.tipo() === 'productos') {
      datos.etiqueta_no_aprovechable = this.nuevaEtq.trim() || 'Cascara y Hueso';
    } else {
      if (this.tipo() === 'tipos-merma') datos.aprovechable = this.nuevaAprov;
      if (this.hayProductos()) datos.id_producto = this.tipo() !== 'variedades' && this.nuevaGlobal ? null : this.idProducto();
    }

    this.guardando.set(true);
    try {
      await this.cat.crear(this.tipo(), datos);
      this.nuevo = ''; this.nuevaEtq = ''; this.nuevaGlobal = false; this.nuevaAprov = false;
      this.toast.show('Agregado', 'ok');
      await this.cargar();
    } catch (e) {
      this.manejarError(e as ApiError, 'No se pudo agregar');
    } finally {
      this.guardando.set(false);
    }
  }

  abrirEditar(it: CatalogoItem) {
    this.eNombre = it.nombre;
    this.eActivo = it.activo;
    this.eEtq = it.etiqueta_no_aprovechable || '';
    this.eAprov = it.aprovechable === true;
    this.eGlobal = it.id_producto == null;
    this.eErr.set('');
    this.editando.set(it);
  }

  async guardarEditar(it: CatalogoItem) {
    const nombre = this.eNombre.trim();
    if (!nombre) { this.eErr.set('Escribe el nombre.'); return; }
    if (this.existe(nombre, it.id)) { this.eErr.set('Ya existe con ese nombre.'); return; }
    this.eErr.set('');

    const cambios: CatalogoDatos = { activo: this.eActivo };
    if (nombre !== it.nombre) cambios.nombre = nombre;
    if (this.tipo() === 'productos') {
      const etq = this.eEtq.trim();
      if (etq && etq !== it.etiqueta_no_aprovechable) cambios.etiqueta_no_aprovechable = etq;
    } else {
      if (this.tipo() === 'tipos-merma' && this.eAprov !== (it.aprovechable === true)) cambios.aprovechable = this.eAprov;
      if (this.tipo() !== 'variedades' && this.hayProductos()) {
        const destino = this.eGlobal ? null : this.idProducto();
        if (destino !== (it.id_producto ?? null)) cambios.id_producto = destino;
      }
    }

    this.guardando.set(true);
    try {
      await this.cat.actualizar(this.tipo(), it.id, cambios, this.contexto());
      this.editando.set(null);
      this.toast.show('Actualizado', 'ok');
      await this.cargar();
    } catch (e) {
      this.manejarError(e as ApiError, 'No se pudo actualizar');
    } finally {
      this.guardando.set(false);
    }
  }

  /** Desactivar en vez de borrar: conserva el historial de los registros que ya la usaron. */
  async alternar(it: CatalogoItem) {
    if (this.guardando()) return;
    this.guardando.set(true);
    try {
      await this.cat.actualizar(this.tipo(), it.id, { activo: !it.activo }, this.contexto());
      this.toast.show(it.activo ? 'Desactivada' : 'Activada', 'ok');
      await this.cargar();
    } catch (e) {
      this.manejarError(e as ApiError, 'No se pudo cambiar el estado');
    } finally {
      this.guardando.set(false);
    }
  }

  async desactivarDesdeModal(it: CatalogoItem) {
    this.confirmDel.set(null);
    if (it.activo) await this.alternar(it);
  }

  async eliminar(it: CatalogoItem) {
    this.confirmDel.set(null);
    try {
      await this.cat.eliminar(this.tipo(), it.id, this.contexto());
      this.toast.show('Eliminado', 'ok');
      await this.cargar();
    } catch (e) {
      this.manejarError(e as ApiError, 'No se pudo eliminar');
    }
  }

  /** El nombre es unico dentro del producto, asi que basta con revisar la lista visible. */
  private existe(nombre: string, exceptoId: number | null): boolean {
    const n = nombre.toLowerCase();
    return this.items().some((x) => x.id !== exceptoId && (x.nombre || '').toLowerCase() === n);
  }

  private manejarError(err: ApiError, generico: string) {
    if (err?.status === 401) { this.auth.clearSession(); this.router.navigateByUrl('/login'); return; }
    if (err?.status === 403) this.toast.show('No tienes permiso para esta accion', 'error');
    else if (err?.status === 409) this.toast.show(this.detalle(err) || 'Ya se uso en registros: desactivalo en vez de borrarlo', 'error');
    else if (err?.status === 400) this.toast.show(this.detalle(err) || 'Ya existe con ese nombre', 'error');
    else if (err?.status === 404) this.toast.show('Ya no existe', 'error');
    else if (err?.status === 422) this.toast.show(this.detalle(err) || 'Datos invalidos', 'error');
    else if (err?.network) this.toast.show('Sin conexion con el servidor', 'error');
    else this.toast.show(this.detalle(err) || generico, 'error');
  }

  private detalle(err: ApiError): string {
    if (!err) return '';
    if (typeof err.detail === 'string') return err.detail;
    if (Array.isArray(err.detail) && err.detail[0]) return err.detail[0].msg;
    return '';
  }
}
