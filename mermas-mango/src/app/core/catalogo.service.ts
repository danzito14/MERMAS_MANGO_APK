import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from './config.service';
import { DbService } from './db.service';
import { NetworkService } from './network.service';
import { ApiError, CatalogoItem, CatalogoTipo, TIPO_LEGACY_APROVECHABLE, TIPO_LEGACY_RESIDUO } from './models';

/** Lo que se guarda en IndexedDB: la cache de los catalogos + si el backend soporta productos y tipos. */
interface CacheCatalogos {
  productos: Record<string, CatalogoItem[]>;
  'tipos-merma': Record<string, CatalogoItem[]>;
  variedades: Record<string, CatalogoItem[]>;
  caracteristicas: Record<string, CatalogoItem[]>;
  soporta: boolean;
  soportaTipos?: boolean;
}

/**
 * Los dos tipos del backend anterior, que no tiene catalogo de tipos sino un enum fijo.
 * Con ids negativos para que ApiService sepa que debe mandar tipo_merma en vez de id_tipo_merma.
 */
const TIPOS_LEGACY: CatalogoItem[] = [
  { id: TIPO_LEGACY_APROVECHABLE, nombre: 'Aprovechable', activo: true, aprovechable: true, id_producto: null },
  { id: TIPO_LEGACY_RESIDUO, nombre: 'Cascara y Hueso', activo: true, aprovechable: false, id_producto: null },
];

const META_KEY = 'cat_cache';
const PREF_PRODUCTO = 'mm_producto';

/** Datos que acepta el alta/edicion de catalogo (id_producto solo aplica a variedades/caracteristicas). */
export interface CatalogoDatos {
  nombre?: string;
  activo?: boolean;
  id_producto?: number | null;
  etiqueta_no_aprovechable?: string;
  aprovechable?: boolean;
}

/**
 * Catalogos editables del backend (/productos, /variedades y /caracteristicas).
 * Lectura: cualquier usuario. Escritura: solo admin.
 *
 * Las variedades pertenecen a un producto y las caracteristicas son del producto
 * o globales, asi que se piden con ?id_producto=N y se cachean POR PRODUCTO para
 * que la captura siga funcionando sin conexion con cualquiera de ellos.
 */
@Injectable({ providedIn: 'root' })
export class CatalogoService {
  private http = inject(HttpClient);
  private cfg = inject(ConfigService);
  private db = inject(DbService);
  private net = inject(NetworkService);

  /** Ultimo listado cargado de cada tipo (el del producto en contexto). */
  readonly productos = signal<CatalogoItem[]>([]);
  readonly tipos = signal<CatalogoItem[]>([]);
  readonly variedades = signal<CatalogoItem[]>([]);
  readonly caracteristicas = signal<CatalogoItem[]>([]);

  /** false cuando el backend todavia no expone /productos: la app trabaja como antes, sin producto. */
  readonly soportaProductos = signal(true);
  /** false cuando no expone /tipos-merma: se usan los dos tipos del enum anterior. */
  readonly soportaTipos = signal(true);

  private cache: CacheCatalogos = { productos: {}, 'tipos-merma': {}, variedades: {}, caracteristicas: {}, soporta: true };
  private restaurando: Promise<void> | null = null;

  private base(tipo: CatalogoTipo): string { return this.cfg.apiBase + '/' + tipo; }
  private signalDe(tipo: CatalogoTipo) {
    if (tipo === 'productos') return this.productos;
    if (tipo === 'tipos-merma') return this.tipos;
    return tipo === 'variedades' ? this.variedades : this.caracteristicas;
  }
  /** Clave de cache: '' = sin filtro de producto. */
  private clave(tipo: CatalogoTipo, idProducto: number | null | undefined): string {
    return tipo === 'productos' || idProducto == null ? '' : String(idProducto);
  }

  /** La API puede devolver id_producto / id_tipo_merma / id_variedad / id_caracteristica / id: se normaliza. */
  private norm(tipo: CatalogoTipo, row: any): CatalogoItem {
    const propio = tipo === 'productos' ? row?.id_producto
      : tipo === 'tipos-merma' ? row?.id_tipo_merma
        : tipo === 'variedades' ? row?.id_variedad : row?.id_caracteristica;
    const it: CatalogoItem = {
      id: propio ?? row?.id,
      nombre: row?.nombre ?? row?.producto ?? row?.tipo_merma ?? row?.variedad ?? row?.caracteristica ?? '',
      activo: row?.activo !== false,
    };
    if (tipo === 'productos') {
      it.etiqueta_no_aprovechable = row?.etiqueta_no_aprovechable || 'Cascara y Hueso';
    } else {
      it.id_producto = row?.id_producto ?? null;   // en caracteristicas y tipos, null = global
      if (tipo === 'tipos-merma') it.aprovechable = row?.aprovechable === true;
    }
    return it;
  }

  private async call<T>(obs: Promise<T>): Promise<T> {
    try { return await obs; }
    catch (e) {
      const err = e as HttpErrorResponse;
      if (err && err.status === 0) throw { network: true } as ApiError;
      throw { status: err?.status, detail: err?.error?.detail } as ApiError;
    }
  }

  private restaurar(): Promise<void> {
    if (!this.restaurando) {
      this.restaurando = this.db.getMeta(META_KEY).then((c: CacheCatalogos | null) => {
        if (c && c.productos && c.variedades && c.caracteristicas) {
          // Una cache guardada por la version anterior no trae los tipos.
          this.cache = { ...c, 'tipos-merma': c['tipos-merma'] || {} };
          this.soportaProductos.set(c.soporta !== false);
          this.soportaTipos.set(c.soportaTipos !== false);
          this.productos.set(c.productos[''] || []);
        }
      }).catch(() => { /* primera vez: cache vacia */ });
    }
    return this.restaurando;
  }

  private persistir(): Promise<any> {
    this.cache.soporta = this.soportaProductos();
    this.cache.soportaTipos = this.soportaTipos();
    return this.db.setMeta(META_KEY, this.cache).catch(() => null);
  }

  /**
   * Carga un catalogo (de la API si hay red; si no, de la cache local).
   * idProducto filtra variedades (las de ese producto) y caracteristicas (las del producto + las globales).
   */
  async cargar(tipo: CatalogoTipo, idProducto: number | null = null): Promise<CatalogoItem[]> {
    await this.restaurar();
    const clave = this.clave(tipo, idProducto);
    // Backend anterior: no hay catalogo de tipos, se usan los dos del enum.
    if (tipo === 'tipos-merma' && !this.soportaTipos()) return this.usarTiposLegacy(clave);
    if (this.net.online()) {
      try {
        let params = new HttpParams();
        if (clave) params = params.set('id_producto', clave);
        const data = await this.call(firstValueFrom(this.http.get<any[]>(this.base(tipo), { params })));
        const items = (data || []).map((r) => this.norm(tipo, r));
        this.cache[tipo][clave] = items;
        if (tipo === 'productos') this.soportaProductos.set(true);
        await this.persistir();
        this.signalDe(tipo).set(items);
        return items;
      } catch (e) {
        const err = e as ApiError;
        // Backend anterior (sin /productos): se sigue trabajando sin producto.
        if (tipo === 'productos' && (err.status === 404 || err.status === 405)) {
          this.soportaProductos.set(false);
          this.cache.productos[''] = [];
          await this.persistir();
          this.productos.set([]);
          return [];
        }
        if (tipo === 'tipos-merma' && (err.status === 404 || err.status === 405)) {
          this.soportaTipos.set(false);
          await this.persistir();
          return this.usarTiposLegacy(clave);
        }
        if (!err.network) throw e;
      }
    }
    const items = this.cache[tipo][clave] || [];
    this.signalDe(tipo).set(items);
    return items;
  }

  /**
   * Carga todo lo que la captura necesita sin conexion: los productos y,
   * de cada uno, sus variedades y caracteristicas.
   */
  async cargarTodos(): Promise<void> {
    await this.restaurar();
    let prods: CatalogoItem[] = [];
    try { prods = await this.cargar('productos'); } catch { prods = this.cache.productos[''] || []; }

    if (!this.soportaProductos() || prods.length === 0) {
      await Promise.all([this.cargar('tipos-merma'), this.cargar('variedades'), this.cargar('caracteristicas')]);
      return;
    }
    for (const p of prods) {
      try {
        await Promise.all([this.cargar('tipos-merma', p.id), this.cargar('variedades', p.id), this.cargar('caracteristicas', p.id)]);
      } catch { /* si uno falla, los demas siguen con lo que haya en cache */ }
    }
  }

  /** Deja los dos tipos del backend anterior en la cache y los devuelve. */
  private usarTiposLegacy(clave: string): CatalogoItem[] {
    this.cache['tipos-merma'][clave] = TIPOS_LEGACY;
    this.tipos.set(TIPOS_LEGACY);
    return TIPOS_LEGACY;
  }

  /** Lo cacheado de ese tipo para ese producto (sin ir a la red). */
  de(tipo: CatalogoTipo, idProducto: number | null = null): CatalogoItem[] {
    return this.cache[tipo][this.clave(tipo, idProducto)] || [];
  }

  /** Busca un item por id en cualquier producto (para resolver nombres de registros ya guardados). */
  buscar(tipo: CatalogoTipo, id: any): CatalogoItem | undefined {
    if (id == null) return undefined;
    const n = Number(id);
    const grupos = this.cache[tipo];
    for (const k of Object.keys(grupos)) {
      const hit = (grupos[k] || []).find((x) => x.id === n);
      if (hit) return hit;
    }
    return undefined;
  }

  /** Solo los activos, para los selectores de captura. */
  activos(tipo: CatalogoTipo, idProducto: number | null = null): CatalogoItem[] {
    return this.de(tipo, idProducto).filter((x) => x.activo);
  }

  /** Los tipos que aplican a un producto (los suyos + los globales), solo activos. */
  tiposDe(idProducto: number | null): CatalogoItem[] {
    return this.activos('tipos-merma', idProducto);
  }

  /** true si ese tipo de merma se aprovecha (decide si se pide la caracteristica). */
  esAprovechable(idTipo: number | null): boolean {
    return this.buscar('tipos-merma', idTipo)?.aprovechable === true;
  }

  // ---- producto preferido (se recuerda entre capturas y entre sesiones) ----
  productoPreferido(): number | null {
    try {
      const v = localStorage.getItem(PREF_PRODUCTO);
      return v ? Number(v) : null;
    } catch { return null; }
  }
  setProductoPreferido(id: number | null): void {
    try {
      if (id == null) localStorage.removeItem(PREF_PRODUCTO);
      else localStorage.setItem(PREF_PRODUCTO, String(id));
    } catch { /* ignore */ }
  }

  // ---- escritura (solo admin en el backend) ----
  async crear(tipo: CatalogoTipo, datos: CatalogoDatos): Promise<CatalogoItem> {
    const row = await this.call(firstValueFrom(this.http.post<any>(this.base(tipo), this.body(tipo, datos))));
    await this.cargar(tipo, datos.id_producto ?? null);
    return this.norm(tipo, row);
  }

  async actualizar(tipo: CatalogoTipo, id: number, cambios: CatalogoDatos, contexto: number | null = null): Promise<CatalogoItem> {
    const row = await this.call(firstValueFrom(this.http.put<any>(this.base(tipo) + '/' + id, this.body(tipo, cambios))));
    await this.cargar(tipo, contexto);
    return this.norm(tipo, row);
  }

  async eliminar(tipo: CatalogoTipo, id: number, contexto: number | null = null): Promise<void> {
    await this.call(firstValueFrom(this.http.delete(this.base(tipo) + '/' + id)));
    await this.cargar(tipo, contexto);
  }

  /** Solo manda los campos que aplican a ese catalogo. */
  private body(tipo: CatalogoTipo, d: CatalogoDatos): any {
    const b: any = {};
    if (d.nombre !== undefined) b.nombre = d.nombre;
    if (d.activo !== undefined) b.activo = d.activo;
    if (tipo === 'productos') {
      if (d.etiqueta_no_aprovechable !== undefined) b.etiqueta_no_aprovechable = d.etiqueta_no_aprovechable;
      return b;
    }
    if (tipo === 'tipos-merma' && d.aprovechable !== undefined) b.aprovechable = d.aprovechable;
    if (d.id_producto !== undefined && this.soportaProductos()) b.id_producto = d.id_producto;
    return b;
  }
}
