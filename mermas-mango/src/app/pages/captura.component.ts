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
                      [class.is-active]="estaSel(t.id)" (click)="setTipo(t.id)">
                <i class="fa-solid" [class.fa-leaf]="t.aprovechable" [class.fa-bone]="!t.aprovechable" aria-hidden="true"></i> {{ t.nombre }}
              </button>
            }
          </div>
          @if (!editKey() && tipos().length > 1) {
            <small class="hint">Puedes marcar varios: se guarda un registro por cada uno.</small>
          }
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

      @if (tiposSel().length > 1) {
        <div class="field">
          <label>CANTIDADES (KG) <span class="req">*</span></label>
          @for (t of tiposSelItems(); track t.id) {
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px">
              <span style="flex:1; min-width:0; display:flex; align-items:center; gap:6px">
                <i class="fa-solid" [class.fa-leaf]="t.aprovechable" [class.fa-bone]="!t.aprovechable" aria-hidden="true"></i>
                {{ t.nombre }}
              </span>
              <input type="text" inputmode="decimal" style="flex:0 0 45%" [value]="cantidadDe(t.id)"
                     (input)="onCant($event, t.id)" placeholder="0.00" autocomplete="off"
                     [attr.aria-label]="'Cantidad de ' + t.nombre" [class.is-invalid]="!!err()['cant_' + t.id]" />
            </div>
            @if (err()['cant_' + t.id]) { <span class="error">{{ t.nombre }}: {{ err()['cant_' + t.id] }}</span> }
          }
          <small class="hint">Se guarda un registro por tipo, todos con el mismo lote y linea.</small>
        </div>
      } @else {
        <div class="field">
          <label for="c_cant">CANTIDAD (KG) <span class="req">*</span></label>
          <input id="c_cant" type="text" inputmode="decimal" [value]="cantidadDe(claveUnica())" (input)="onCant($event, claveUnica())"
                 placeholder="0.00" autocomplete="off" [class.is-invalid]="!!err()['cant_' + claveUnica()]" />
          <small class="hint">No negativos. Hasta 10 enteros y 6 decimales.</small>
          @if (err()['cant_' + claveUnica()]) { <span class="error">{{ err()['cant_' + claveUnica()] }}</span> }
        </div>
      }

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
  idProducto = signal<number | null>(null);
  /** Tipos marcados: uno solo es lo normal, varios guardan un registro por cada uno. */
  tiposSel = signal<number[]>([]);
  /** Cantidad tecleada de cada tipo. La clave 0 guarda lo que se escribio antes de elegir tipo. */
  cants = signal<Record<number, string>>({});
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

  estaSel(id: number) { return this.tiposSel().includes(id); }

  /** Los tipos marcados, en el orden en que aparecen en el catalogo. */
  tiposSelItems(): CatalogoItem[] { return this.tipos().filter((t) => this.estaSel(t.id)); }

  /** Clave del campo de cantidad cuando hay 0 o 1 tipos: 0 = todavia sin elegir. */
  claveUnica(): number { return this.tiposSel()[0] ?? 0; }

  cantidadDe(id: number): string { return this.cants()[id] || ''; }

  /**
   * La caracteristica solo se pide si alguno de los tipos marcados se aprovecha:
   * en un residuo la API la rechaza con 400.
   */
  esAprovechable() { return this.tiposSelItems().some((t) => t.aprovechable === true); }

  private aprovechable(id: number) { return this.tipos().find((t) => t.id === id)?.aprovechable === true; }

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
    const idTipo = r.id_tipo_merma ?? 0;
    this.tiposSel.set(idTipo ? [idTipo] : []);
    this.lote.set(String(r.lote || '').toUpperCase());
    this.cants.set({ [idTipo]: numKg(r.cant_kg) });
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
    // Sin preferencia guardada se toma el primero: queda como el producto en uso
    // para que la barra superior no se quede con el nombre por defecto.
    if (!this.editKey()) this.cat.setProductoPreferido(elegido);
  }

  /**
   * Cambia el producto y recarga sus catalogos. La variedad/caracteristica del producto
   * anterior se limpian: el backend rechaza (400) una variedad que no le pertenece.
   */
  async setProducto(id: number | null, conservarSeleccion = false) {
    if (this.idProducto() === id && !conservarSeleccion) return;
    this.idProducto.set(id);
    if (!this.editKey()) this.cat.setProductoPreferido(id);
    if (!conservarSeleccion) { this.tiposSel.set([]); this.cants.set({}); this.idVariedad.set(null); this.idCaracteristica.set(null); }
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
    const v = this.idVariedad(), c = this.idCaracteristica();
    const delProducto = this.cat.de('tipos-merma', id);
    const quedan = this.tiposSel().filter((t) => delProducto.some((x) => x.id === t));
    if (quedan.length !== this.tiposSel().length) this.tiposSel.set(quedan);
    if (v != null && !this.cat.de('variedades', id).some((x) => x.id === v)) this.idVariedad.set(null);
    if (c != null && !this.cat.de('caracteristicas', id).some((x) => x.id === c)) this.idCaracteristica.set(null);
  }

  /** Solo los activos del producto; si estas editando, deja visible el valor guardado aunque ya se haya desactivado. */
  private aplicarVisibles() {
    const id = this.idProducto();
    const vis = (items: CatalogoItem[], sel: number | null) => items.filter((x) => x.activo || x.id === sel);
    const visTipos = this.cat.de('tipos-merma', id).filter((x) => x.activo || this.estaSel(x.id));
    this.tipos.set(visTipos);
    this.variedades.set(vis(this.cat.de('variedades', id), this.idVariedad()));
    this.caracteristicas.set(vis(this.cat.de('caracteristicas', id), this.idCaracteristica()));
    // El formulario abre con el tipo aprovechable marcado (como antes de que se
    // pudieran marcar varios): si no, la caracteristica no se ve al entrar y
    // parece que falta. Para capturar solo residuo se desmarca.
    if (!this.tiposSel().length && visTipos.length) {
      this.marcarTipo((visTipos.find((t) => t.aprovechable) || visTipos[0]).id);
    }
  }

  /**
   * Marca o desmarca un tipo. Se pueden llevar varios a la vez: cada uno con su
   * cantidad se guarda como un registro aparte (la API crea uno por peticion).
   * Al editar un registro existente solo se puede tener uno.
   */
  setTipo(id: number) {
    if (this.editKey()) { this.tiposSel.set([id]); return; }
    this.estaSel(id) ? this.desmarcarTipo(id) : this.marcarTipo(id);
  }

  private marcarTipo(id: number) {
    const previos = this.tiposSel();
    this.tiposSel.set([...previos, id]);
    // Lo que se haya escrito antes de elegir tipo pasa al primero que se marca.
    if (!previos.length) {
      const suelto = this.cants()[0];
      if (suelto) this.cants.update((c) => { const { 0: _, ...resto } = c; return { ...resto, [id]: suelto }; });
    }
    this.err.update((e) => { const { id_tipo_merma, ...resto } = e; return resto; });
  }

  private desmarcarTipo(id: number) {
    this.tiposSel.update((sel) => sel.filter((x) => x !== id));
    this.cants.update((c) => { const copia = { ...c }; delete copia[id]; return copia; });
    this.err.update((e) => { const copia = { ...e }; delete copia['cant_' + id]; return copia; });
    // Sin ningun tipo aprovechable marcado, la caracteristica ya no aplica.
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
  onCant(ev: Event, idTipo: number) {
    const el = ev.target as HTMLInputElement;
    let s = (el.value || '').replace(/,/g, '.').replace(/[^\d.]/g, '');
    const i = s.indexOf('.');
    if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, ''); // un solo punto
    let [ent, dec] = s.split('.');
    ent = (ent || '').slice(0, MAX_ENTEROS);
    s = dec !== undefined ? ent + '.' + dec.slice(0, 6) : ent;
    if (el.value !== s) el.value = s;        // corrige el input al instante
    this.cants.update((c) => ({ ...c, [idTipo]: s }));
  }

  cancelar() { this.router.navigateByUrl('/registros'); }

  /** Revisa una cantidad; devuelve el error o '' si esta bien. */
  private errorCantidad(raw: string): string {
    const n = Number(raw);
    if (raw === '') return 'La cantidad es obligatoria.';
    if (isNaN(n)) return 'Debe ser un numero (usa punto decimal).';
    if (n < 0) return 'No puede ser negativa.';
    if (!/^\d+(\.\d{1,6})?$/.test(raw)) return 'Maximo 6 decimales.';
    if (raw.split('.')[0].length > MAX_ENTEROS) return 'Maximo ' + MAX_ENTEROS + ' digitos enteros.';
    return '';
  }

  private validar(): Record<string, string> {
    const e: Record<string, string> = {};
    // Una cantidad por cada tipo marcado (sin tipo aun, se revisa el campo suelto).
    const claves = this.tiposSel().length ? this.tiposSel() : [0];
    claves.forEach((id) => {
      const error = this.errorCantidad(this.cantidadDe(id).trim());
      if (error) e['cant_' + id] = error;
    });

    const lote = this.lote().trim();
    if (!lote) e['lote'] = 'El lote es obligatorio.';
    else if (lote.length > 50) e['lote'] = 'Lote demasiado largo (max 50).';

    if (this.cat.soportaProductos() && this.idProducto() === null) {
      e['id_producto'] = this.productos().length ? 'Elige el producto.' : 'No hay productos en el catalogo.';
    }
    if (!this.tiposSel().length) {
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

    const key = this.editKey();
    const seleccion = this.tiposSel();
    this.submitting.set(true);
    let guardados = 0, encolados = 0;
    try {
      if (key) {
        const res = await this.api.actualizar(key, this.datosDe(seleccion[0]));
        this.toast.show(res.queued ? 'Guardado sin conexion (se sincronizara)' : 'Registro actualizado', res.queued ? 'info' : 'ok');
        this.router.navigateByUrl('/registros');
        return;
      }
      // La API crea un registro por peticion: se manda uno por cada tipo marcado.
      for (const idTipo of seleccion) {
        const res = await this.api.crear(this.datosDe(idTipo));
        guardados++;
        if (res.queued) encolados++;
      }
      this.toast.show(this.mensajeAlta(guardados, encolados), encolados ? 'info' : 'ok');
      this.limpiarTrasGuardar();
    } catch (e) {
      // Si iban varias y alguna ya entro, se avisa cuales quedaron guardadas.
      if (guardados) this.toast.show(this.parcial(guardados, seleccion.length), 'error');
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

  /** El registro que se manda para un tipo: lo comun del formulario + su cantidad. */
  private datosDe(idTipo: number): any {
    const data: any = {
      cant_kg: this.cantidadDe(idTipo).trim(),
      id_tipo_merma: idTipo,
      lote: this.lote().trim().toUpperCase(),
      linea_prod: this.linea(),
      id_variedad: this.idVariedad(),
      // un residuo no lleva caracteristica: se manda null explicito (importa al editar).
      id_caracteristica: this.aprovechable(idTipo) ? this.idCaracteristica() : null,
    };
    // Solo se manda si el backend maneja productos (no romper contra la version anterior).
    if (this.cat.soportaProductos() && this.idProducto() != null) data.id_producto = this.idProducto();
    return data;
  }

  private mensajeAlta(guardados: number, encolados: number): string {
    const que = guardados === 1 ? 'Merma registrada' : guardados + ' mermas registradas';
    return encolados ? que + ' sin conexion (se sincronizan)' : que;
  }

  private parcial(guardados: number, total: number): string {
    return 'Se guardaron ' + guardados + ' de ' + total + '; el resto no se pudo.';
  }

  /** Tras un alta: la cantidad siempre se limpia; lo demas solo si no se pidio conservarlo. */
  private limpiarTrasGuardar() {
    this.cants.set({});
    if (this.keep) return;
    // El producto se conserva: es la configuracion de la sesion de captura.
    this.linea.set('L1'); this.lote.set('');
    this.tiposSel.set([]); this.idVariedad.set(null); this.idCaracteristica.set(null);
    this.aplicarVisibles();
  }
}
