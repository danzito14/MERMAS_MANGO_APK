import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../core/api.service';
import { CatalogoService } from '../core/catalogo.service';
import { ToastService } from '../core/toast.service';
import { ApiError, CatalogoItem } from '../core/models';
import { numKg } from '../core/util';

type Linea = 'L1' | 'L2' | 'L3' | 'L4';

/** cant_kg es DECIMAL(16,6): 16 - 6 = 10 digitos enteros como maximo. */
const MAX_ENTEROS = 10;

@Component({
  selector: 'app-captura',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page-head">
      <div>
        <h2 class="page-title">{{ editKey() ? 'Editar merma' : 'Registrar merma' }}</h2>
        <p class="page-sub">Elige el producto, la linea y el lote, y sube la cantidad.</p>
      </div>
    </div>

    <form class="card form form--captura" (ngSubmit)="subir()">
      @if (hayProductos()) {
        <div class="field">
          <label>PRODUCTO <span class="req">*</span></label>
          <div class="segmented segmented--mini" role="group" aria-label="Producto" [class.seg-invalid]="!!err()['id_producto']">
            @for (p of productos(); track p.id) {
              <button type="button" class="seg seg--mini" [class.is-active]="idProducto() === p.id" (click)="setProducto(p.id)">{{ p.nombre }}</button>
            }
          </div>
          <small class="hint">La variedad y la caracteristica cambian segun el producto.</small>
          @if (err()['id_producto']) { <span class="error">{{ err()['id_producto'] }}</span> }
        </div>
      } @else if (cat.soportaProductos()) {
        <div class="field">
          <label>PRODUCTO <span class="req">*</span></label>
          <small class="hint">No hay productos registrados. Pide a un administrador que los agregue en Catalogos.</small>
        </div>
      }

      <div class="field">
        <label>LINEA DE PRODUCCION <span class="req">*</span></label>
        <div class="segmented" role="group" aria-label="Linea de produccion">
          @for (l of lineas; track l) {
            <button type="button" class="seg" [class.is-active]="linea() === l" (click)="linea.set(l)">{{ l }}</button>
          }
        </div>
      </div>

      <div class="field">
        <label for="c_lote">LOTE <span class="req">*</span></label>
        <input id="c_lote" type="text" maxlength="50" [value]="lote()" (input)="onLote($event)"
               placeholder="Ej. 10189P02001" autocomplete="off" spellcheck="false" autocapitalize="characters"
               [class.is-invalid]="!!err()['lote']" />
        <small class="hint">Numero de lote (letras y numeros). Las letras se guardan en mayusculas.</small>
        @if (err()['lote']) { <span class="error">{{ err()['lote'] }}</span> }
      </div>

      <div class="field">
        <label>TIPO DE MERMA <span class="req">*</span></label>
        @if (tipos().length) {
          <div class="segmented segmented--tipo" role="group" aria-label="Tipo de merma" [class.seg-invalid]="!!err()['id_tipo_merma']">
            @for (t of tipos(); track t.id) {
              <button type="button" class="seg" [attr.data-tipo]="t.aprovechable ? 'aprovechable' : 'cascara_hueso'"
                      [class.is-active]="idTipo() === t.id" (click)="setTipo(t.id)">
                <i class="fa-solid" [class.fa-leaf]="t.aprovechable" [class.fa-bone]="!t.aprovechable" aria-hidden="true"></i> {{ t.nombre }}
              </button>
            }
          </div>
        } @else {
          <small class="hint">{{ vacio('tipos de merma') }}</small>
        }
        @if (err()['id_tipo_merma']) { <span class="error">{{ err()['id_tipo_merma'] }}</span> }
      </div>

      <div class="field">
        <label>VARIEDAD <span class="req">*</span></label>
        @if (variedades().length) {
          <div class="segmented segmented--mini" role="group" aria-label="Variedad" [class.seg-invalid]="!!err()['id_variedad']">
            @for (v of variedades(); track v.id) {
              <button type="button" class="seg seg--mini" [class.is-active]="idVariedad() === v.id" (click)="idVariedad.set(v.id)">{{ v.nombre }}</button>
            }
          </div>
        } @else {
          <small class="hint">{{ vacio('variedades') }}</small>
        }
        @if (err()['id_variedad']) { <span class="error">{{ err()['id_variedad'] }}</span> }
      </div>

      @if (esAprovechable()) {
        <div class="field">
          <label>CARACTERISTICA <span class="req">*</span></label>
          @if (caracteristicas().length) {
            <div class="segmented segmented--mini" role="group" aria-label="Caracteristica" [class.seg-invalid]="!!err()['id_caracteristica']">
              @for (c of caracteristicas(); track c.id) {
                <button type="button" class="seg seg--mini" [class.is-active]="idCaracteristica() === c.id" (click)="idCaracteristica.set(c.id)">{{ c.nombre }}</button>
              }
            </div>
          } @else {
            <small class="hint">{{ vacio('caracteristicas') }}</small>
          }
          @if (err()['id_caracteristica']) { <span class="error">{{ err()['id_caracteristica'] }}</span> }
        </div>
      }

      <div class="field">
        <label for="c_cant">CANTIDAD (KG) <span class="req">*</span></label>
        <input id="c_cant" type="text" inputmode="decimal" [value]="cant()" (input)="onCant($event)" placeholder="0.00" autocomplete="off" [class.is-invalid]="!!err()['cant_kg']" />
        <small class="hint">No negativos. Hasta 10 enteros y 6 decimales.</small>
        @if (err()['cant_kg']) { <span class="error">{{ err()['cant_kg'] }}</span> }
      </div>

      @if (!editKey()) {
        <label class="switch">
          <input type="checkbox" name="keep" [(ngModel)]="keep" />
          <span class="switch__track"><span class="switch__thumb"></span></span>
          <span class="switch__label"><i class="fa-solid fa-thumbtack" aria-hidden="true"></i> Mantener datos del lote para el siguiente registro</span>
        </label>
      }

      <div class="form__actions">
        <button class="btn btn--primary btn--lg" type="submit" [disabled]="submitting()">
          <i class="fa-solid" [class.fa-cloud-arrow-up]="!editKey()" [class.fa-floppy-disk]="editKey()" aria-hidden="true"></i>
          {{ editKey() ? 'Guardar' : 'Subir' }}
        </button>
        @if (editKey()) {
          <button class="btn btn--ghost" type="button" (click)="cancelar()"><i class="fa-solid fa-xmark" aria-hidden="true"></i> Cancelar</button>
        }
      </div>
    </form>
  `,
})
export class CapturaComponent implements OnInit {
  private api = inject(ApiService);
  cat = inject(CatalogoService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly lineas: Linea[] = ['L1', 'L2', 'L3', 'L4'];
  linea = signal<Linea>('L1');
  lote = signal('');
  cant = signal('');
  idProducto = signal<number | null>(null);
  idTipo = signal<number | null>(null);
  idVariedad = signal<number | null>(null);
  idCaracteristica = signal<number | null>(null);
  productos = signal<CatalogoItem[]>([]);
  tipos = signal<CatalogoItem[]>([]);
  variedades = signal<CatalogoItem[]>([]);
  caracteristicas = signal<CatalogoItem[]>([]);
  keep = false;
  err = signal<Record<string, string>>({});
  submitting = signal(false);
  editKey = signal<string | null>(null);

  hayProductos() { return this.cat.soportaProductos() && this.productos().length > 0; }

  /** La caracteristica solo se pide cuando el tipo elegido se aprovecha (si no, la API responde 400). */
  esAprovechable() { return this.tipos().find((t) => t.id === this.idTipo())?.aprovechable === true; }

  vacio(tipo: string): string {
    const p = this.hayProductos() ? this.productos().find((x) => x.id === this.idProducto()) : null;
    const donde = p ? ' para ' + p.nombre : '';
    return 'No hay ' + tipo + donde + '. Pide a un administrador que las agregue en Catalogos.';
  }

  ngOnInit() {
    const key = this.route.snapshot.paramMap.get('key');
    if (key) this.editKey.set(key);
    this.cargarCatalogos().then(() => { if (key) this.prefill(key); });
  }

  private async prefill(key: string) {
    const r = await this.api.getByKey(key);
    if (!r) { this.toast.show('Registro no encontrado', 'error'); this.router.navigateByUrl('/registros'); return; }
    this.linea.set(/^L[1-4]$/.test(r.linea_prod) ? (r.linea_prod as Linea) : 'L1');
    this.idTipo.set(r.id_tipo_merma ?? null);
    this.lote.set(String(r.lote || '').toUpperCase());
    this.cant.set(numKg(r.cant_kg));
    this.idVariedad.set(r.id_variedad ?? null);
    this.idCaracteristica.set(r.id_caracteristica ?? null);
    // El producto del registro manda sobre el preferido, y arrastra sus catalogos.
    if (r.id_producto != null) await this.setProducto(r.id_producto, true);
    else this.aplicarVisibles();
  }

  private async cargarCatalogos() {
    try { await this.cat.cargarTodos(); } catch { /* usa lo que haya en cache */ }
    this.elegirProducto();
    this.aplicarVisibles();
  }

  /** Deja seleccionado el producto guardado la vez pasada (o el primero disponible). */
  private elegirProducto() {
    if (!this.cat.soportaProductos()) { this.idProducto.set(null); this.productos.set([]); return; }
    const sel = this.idProducto();
    const lista = this.cat.de('productos').filter((p) => p.activo || p.id === sel);
    this.productos.set(lista);
    if (sel != null && lista.some((p) => p.id === sel)) return;
    const pref = this.cat.productoPreferido();
    const elegido = pref != null && lista.some((p) => p.id === pref) ? pref : (lista.length ? lista[0].id : null);
    this.idProducto.set(elegido);
  }

  /**
   * Cambia el producto y recarga sus catalogos. La variedad/caracteristica del producto
   * anterior se limpian: el backend rechaza (400) una variedad que no le pertenece.
   */
  async setProducto(id: number | null, conservarSeleccion = false) {
    if (this.idProducto() === id && !conservarSeleccion) return;
    this.idProducto.set(id);
    if (!this.editKey()) this.cat.setProductoPreferido(id);
    if (!conservarSeleccion) { this.idTipo.set(null); this.idVariedad.set(null); this.idCaracteristica.set(null); }
    this.err.update((e) => { const { id_producto, id_tipo_merma, id_variedad, id_caracteristica, ...resto } = e; return resto; });
    this.aplicarVisibles();                       // instantaneo con lo cacheado
    if (id == null) return;
    try {
      await Promise.all([this.cat.cargar('tipos-merma', id), this.cat.cargar('variedades', id), this.cat.cargar('caracteristicas', id)]);
    } catch { /* sin conexion: se queda con la cache */ }
    this.podarSeleccion();
    this.aplicarVisibles();
  }

  /** Si lo seleccionado ya no existe en el producto actual, se descarta. */
  private podarSeleccion() {
    const id = this.idProducto();
    const t = this.idTipo(), v = this.idVariedad(), c = this.idCaracteristica();
    if (t != null && !this.cat.de('tipos-merma', id).some((x) => x.id === t)) this.idTipo.set(null);
    if (v != null && !this.cat.de('variedades', id).some((x) => x.id === v)) this.idVariedad.set(null);
    if (c != null && !this.cat.de('caracteristicas', id).some((x) => x.id === c)) this.idCaracteristica.set(null);
  }

  /** Solo los activos del producto; si estas editando, deja visible el valor guardado aunque ya se haya desactivado. */
  private aplicarVisibles() {
    const id = this.idProducto();
    const vis = (items: CatalogoItem[], sel: number | null) => items.filter((x) => x.activo || x.id === sel);
    this.tipos.set(vis(this.cat.de('tipos-merma', id), this.idTipo()));
    this.variedades.set(vis(this.cat.de('variedades', id), this.idVariedad()));
    this.caracteristicas.set(vis(this.cat.de('caracteristicas', id), this.idCaracteristica()));
    if (this.idTipo() === null && this.tipos().length === 1) this.idTipo.set(this.tipos()[0].id);
  }

  /** La caracteristica solo aplica a los tipos aprovechables; en un residuo se descarta. */
  setTipo(id: number) {
    this.idTipo.set(id);
    this.err.update((e) => { const { id_tipo_merma, ...resto } = e; return resto; });
    if (!this.esAprovechable()) {
      this.idCaracteristica.set(null);
      this.err.update((e) => { const { id_caracteristica, ...resto } = e; return resto; });
    }
  }

  /** Las letras del lote van siempre en mayusculas (se corrige el input al instante). */
  onLote(ev: Event) {
    const el = ev.target as HTMLInputElement;
    const s = (el.value || '').toUpperCase();
    if (el.value !== s) {
      const pos = el.selectionStart;                 // no mover el cursor al reescribir
      el.value = s;
      if (pos !== null) el.setSelectionRange(pos, pos);
    }
    this.lote.set(s);
  }

  /** Solo numeros: un punto decimal, maximo 9 enteros y 6 decimales. */
  onCant(ev: Event) {
    const el = ev.target as HTMLInputElement;
    let s = (el.value || '').replace(/,/g, '.').replace(/[^\d.]/g, '');
    const i = s.indexOf('.');
    if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, ''); // un solo punto
    let [ent, dec] = s.split('.');
    ent = (ent || '').slice(0, MAX_ENTEROS);
    s = dec !== undefined ? ent + '.' + dec.slice(0, 6) : ent;
    if (el.value !== s) el.value = s;        // corrige el input al instante
    this.cant.set(s);
  }

  cancelar() { this.router.navigateByUrl('/registros'); }

  private validar(): Record<string, string> {
    const e: Record<string, string> = {};
    const raw = this.cant().trim();
    const n = Number(raw);
    if (raw === '') e['cant_kg'] = 'La cantidad es obligatoria.';
    else if (isNaN(n)) e['cant_kg'] = 'Debe ser un numero (usa punto decimal).';
    else if (n < 0) e['cant_kg'] = 'No puede ser negativa.';
    else if (!/^\d+(\.\d{1,6})?$/.test(raw)) e['cant_kg'] = 'Maximo 6 decimales.';
    else if (raw.split('.')[0].length > MAX_ENTEROS) e['cant_kg'] = 'Maximo ' + MAX_ENTEROS + ' digitos enteros.';

    const lote = this.lote().trim();
    if (!lote) e['lote'] = 'El lote es obligatorio.';
    else if (lote.length > 50) e['lote'] = 'Lote demasiado largo (max 50).';

    if (this.cat.soportaProductos() && this.idProducto() === null) {
      e['id_producto'] = this.productos().length ? 'Elige el producto.' : 'No hay productos en el catalogo.';
    }
    if (this.idTipo() === null) {
      e['id_tipo_merma'] = this.tipos().length ? 'Elige el tipo de merma.' : 'No hay tipos de merma en el catalogo.';
    }
    // Variedad y caracteristica son opcionales para la API: se exigen solo cuando
    // el producto tiene de donde elegir (si no, un producto sin variedades no se podria capturar).
    if (this.variedades().length && this.idVariedad() === null) e['id_variedad'] = 'Elige la variedad.';
    // La caracteristica solo aplica a los tipos aprovechables.
    if (this.esAprovechable() && this.caracteristicas().length && this.idCaracteristica() === null) {
      e['id_caracteristica'] = 'Elige la caracteristica.';
    }
    return e;
  }

  async subir() {
    const errs = this.validar();
    this.err.set(errs);
    if (Object.keys(errs).length) { this.toast.show('Revisa los campos marcados', 'error'); return; }

    const data: any = {
      cant_kg: this.cant().trim(), id_tipo_merma: this.idTipo(), lote: this.lote().trim().toUpperCase(), linea_prod: this.linea(),
      id_variedad: this.idVariedad(),
      // un residuo no lleva caracteristica: se manda null explicito (importa al editar).
      id_caracteristica: this.esAprovechable() ? this.idCaracteristica() : null,
    };
    // Solo se manda si el backend maneja productos (no romper contra la version anterior).
    if (this.cat.soportaProductos() && this.idProducto() != null) data.id_producto = this.idProducto();
    const key = this.editKey();
    this.submitting.set(true);
    try {
      const res = key ? await this.api.actualizar(key, data) : await this.api.crear(data);
      this.toast.show(res.queued ? 'Guardado sin conexion (se sincronizara)' : (key ? 'Registro actualizado' : 'Merma registrada'), res.queued ? 'info' : 'ok');
      if (key) { this.router.navigateByUrl('/registros'); return; }
      this.cant.set('');
      if (!this.keep) {
        // El producto se conserva: es la configuracion de la sesion de captura.
        this.linea.set('L1'); this.lote.set('');
        this.idTipo.set(null); this.idVariedad.set(null); this.idCaracteristica.set(null);
        this.aplicarVisibles();
      }
    } catch (e) {
      const err = e as ApiError;
      if (err?.status === 422 && Array.isArray(err.detail)) {
        const m: Record<string, string> = {};
        err.detail.forEach((it: any) => { const c = it.loc && it.loc[it.loc.length - 1]; if (c) m[c] = it.msg; });
        this.err.set(m);
        this.toast.show('El servidor rechazo los datos', 'error');
      } else if (err?.status === 400) {
        // Combinacion invalida (variedad o caracteristica de otro producto): se resincroniza el catalogo.
        this.toast.show(typeof err.detail === 'string' ? err.detail : 'Esa combinacion no es valida para el producto', 'error');
        await this.setProducto(this.idProducto(), true);
      } else if (err?.status === 403) this.toast.show('No tienes permiso para esta accion', 'error');
      else if (err?.status === 404) this.toast.show('El registro ya no existe', 'error');
      else this.toast.show('No se pudo guardar', 'error');
    } finally {
      this.submitting.set(false);
    }
  }
}
