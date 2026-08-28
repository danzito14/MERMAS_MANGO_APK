import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from './config.service';
import { DbService } from './db.service';
import { NetworkService } from './network.service';
import { AuthService } from './auth.service';
import { CatalogoService } from './catalogo.service';
import { ApiError, CatalogoTipo, InformeDia, LocalRegistro, MermaInput, OutboxEntry, RegistroMermaOut, ReporteLote, TIPO_LEGACY_APROVECHABLE, TIPO_LEGACY_RESIDUO, TotalPorTipo, Unidad } from './models';
import { aUnidad } from './util';

export interface QueryParams { lote?: string; linea_prod?: string; id_tipo_merma?: number; aprovechable?: boolean; fecha?: string; desde?: string; hasta?: string; id_producto?: number; id_variedad?: number; id_caracteristica?: number; skip?: number; limit?: number; }

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private cfg = inject(ConfigService);
  private db = inject(DbService);
  private net = inject(NetworkService);
  private auth = inject(AuthService);
  private cat = inject(CatalogoService);

  readonly pending = signal<number>(0);

  private base(): string { return this.cfg.apiBase; }
  // Usa el detector de red nativo (fiable en el APK), no navigator.onLine.
  private online(): boolean { return this.net.online(); }

  // ---------- utilidades ----------
  private uuid(): string {
    if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) return (crypto as any).randomUUID();
    return 'xxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16)) + '-' + Date.now();
  }
  private pad(n: number): string { return (n < 10 ? '0' : '') + n; }
  nowISO(): string {
    const d = new Date();
    return d.getFullYear() + '-' + this.pad(d.getMonth() + 1) + '-' + this.pad(d.getDate()) +
      'T' + this.pad(d.getHours()) + ':' + this.pad(d.getMinutes()) + ':' + this.pad(d.getSeconds());
  }
  /** Guarda con la misma precision que el backend (6 decimales). */
  formatKg(v: number | string): string {
    const n = Number(v);
    return isNaN(n) ? '0.000000' : n.toFixed(6);
  }
  /**
   * El tipo de merma llega de dos formas: como catalogo (id_tipo_merma + nombre + bandera)
   * o, en el backend anterior, como el enum 'aprovechable' | 'cascara_hueso'.
   */
  private tipoShape(row: any): { id_tipo_merma: number | null; tipo_merma: string; aprovechable: boolean } {
    if (row?.id_tipo_merma != null) {
      return {
        id_tipo_merma: Number(row.id_tipo_merma),
        tipo_merma: row.tipo_merma || this.nombreCat('tipos-merma', row.id_tipo_merma) || '',
        aprovechable: row.aprovechable === true,
      };
    }
    const residuo = row?.tipo_merma === 'cascara_hueso';
    return {
      id_tipo_merma: residuo ? TIPO_LEGACY_RESIDUO : TIPO_LEGACY_APROVECHABLE,
      tipo_merma: residuo ? 'Cascara y Hueso' : 'Aprovechable',
      aprovechable: !residuo,
    };
  }

  private serverShape(row: RegistroMermaOut): LocalRegistro {
    return {
      _key: 'srv-' + row.id_registro, _pending: false, _op: null, _deleted: false,
      id_registro: row.id_registro, cant_kg: row.cant_kg, ...this.tipoShape(row),
      lote: row.lote, linea_prod: row.linea_prod, fecha_hora: row.fecha_hora,
      id_usuario: row.id_usuario ?? null, registrado_por: row.registrado_por ?? null,
      id_producto: row.id_producto ?? null, producto: row.producto ?? this.nombreCat('productos', row.id_producto),
      id_variedad: row.id_variedad ?? null, variedad: row.variedad ?? null,
      id_caracteristica: row.id_caracteristica ?? null, caracteristica: row.caracteristica ?? null,
    };
  }

  private async call<T>(obs: Promise<T>): Promise<T> {
    try { return await obs; }
    catch (e) {
      const err = e as HttpErrorResponse;
      if (err && err.status === 0) throw { network: true } as ApiError;
      throw { status: err?.status, detail: err?.error?.detail } as ApiError;
    }
  }

  // Los filtros aceptan "YYYY-MM-DD" o "YYYY-MM-DDTHH:MM[:SS]".
  // Se normalizan a datetime completo para comparar contra fecha_hora (ISO) como texto.
  private normDesde(v: string): string {
    if (!v.includes('T')) return v + 'T00:00:00';
    return v.length === 16 ? v + ':00' : v;
  }
  private normHasta(v: string): string {
    if (!v.includes('T')) return v + 'T23:59:59';   // fecha sola: dia completo, igual que el backend
    return v.length === 16 ? v + ':00' : v;         // hora elegida: exacta, sin extenderla
  }
  private enRango(fechaHora: string, desde?: string, hasta?: string): boolean {
    const f = fechaHora || '';
    if (desde && f < this.normDesde(desde)) return false;
    if (hasta && f > this.normHasta(hasta)) return false;
    return true;
  }

  // Una sola regla para /mermas, /mermas/informe y /mermas/reporte: los tres aceptan
  // fecha sola (el backend la extiende al dia completo) o fecha con hora (se respeta exacta).
  // Se manda tal cual: extender la hora elegida romperia los cortes por turno
  // (un "hasta 14:00" convertido a 14:00:59 contaria ese minuto en los dos turnos).
  private paramRango(v: string | undefined): string | undefined {
    if (!v) return undefined;
    if (!v.includes('T')) return v;              // fecha sola
    return v.length === 16 ? v + ':00' : v;      // solo completa segundos si el navegador los omite
  }

  /** Nombre del catalogo para mostrar en registros creados sin conexion. */
  private nombreCat(tipo: CatalogoTipo, id: any): string | null {
    const it = this.cat.buscar(tipo, id);
    return it ? it.nombre : null;
  }

  async updatePending(): Promise<number> {
    const n = await this.db.countOutbox();
    this.pending.set(n);
    return n;
  }

  // ---------- sincronizacion ----------
  private _syncing: Promise<number> | null = null;
  private _refreshing: Promise<{ offline: boolean; error?: any }> | null = null;

  private async dropAndReconcile(it: OutboxEntry): Promise<void> {
    await this.db.delOutbox(it.id!);
    const rec = await this.getByKey(it.key);
    if (!rec) return;
    if (it.type === 'create') { await this.db.delRegistro(it.key); return; }
    rec._pending = false; rec._deleted = false;
    await this.db.putRegistro(rec);
  }

  private async processOutbox(it: OutboxEntry): Promise<boolean> {
    if (it.type === 'create') {
      const rec = await this.call(firstValueFrom(this.http.post<RegistroMermaOut>(this.base() + '/mermas', it.payload)));
      await this.db.delRegistro(it.key);
      await this.db.putRegistro(this.serverShape(rec));
      await this.db.delOutbox(it.id!);
      return true;
    }
    if (it.type === 'update') {
      const rec = await this.call(firstValueFrom(this.http.put<RegistroMermaOut>(this.base() + '/mermas/' + it.serverId, it.payload)));
      await this.db.putRegistro(this.serverShape(rec));
      await this.db.delOutbox(it.id!);
      return true;
    }
    if (it.type === 'delete') {
      try {
        await this.call(firstValueFrom(this.http.delete(this.base() + '/mermas/' + it.serverId)));
      } catch (e) { if ((e as ApiError).status !== 404) throw e; }
      await this.db.delRegistro(it.key);
      await this.db.delOutbox(it.id!);
      return true;
    }
    await this.db.delOutbox(it.id!);
    return true;
  }

  syncOutbox(): Promise<number> {
    if (this._syncing) return this._syncing;
    if (!this.online()) return Promise.resolve(0);
    this._syncing = this.db.getOutbox().then(async (items) => {
      items.sort((a, b) => (a.id! - b.id!));
      let done = 0;
      for (const it of items) {
        try {
          if (await this.processOutbox(it)) done++;
        } catch (e) {
          const err = e as ApiError;
          if (err && err.network) break;                                   // sigue offline: cortar
          if (err && (err.status === 422 || err.status === 403 || err.status === 404)) { await this.dropAndReconcile(it); continue; }
          break;                                                            // otro error: reintentar luego
        }
      }
      return done;
    }).then((r) => { this._syncing = null; return r; }, (e) => { this._syncing = null; throw e; });
    return this._syncing;
  }

  /** Empuja pendientes y baja los datos frescos del servidor (con candado de reentrancia). */
  refresh(): Promise<{ offline: boolean; error?: any }> {
    if (this._refreshing) return this._refreshing;
    if (!this.online()) return Promise.resolve({ offline: true });
    this._refreshing = (async () => {
      try {
        await this.syncOutbox();
        const params = new HttpParams().set('limit', '500').set('skip', '0');
        const data = await this.call(firstValueFrom(this.http.get<RegistroMermaOut[]>(this.base() + '/mermas', { params })));
        await this.db.replaceServerRegistros((data || []).map((r) => this.serverShape(r)));
        await this.db.setMeta('lastSync', this.nowISO());
        return { offline: false };
      } catch (e) {
        return { offline: true, error: e };
      }
    })().then((r) => { this._refreshing = null; return r; });
    return this._refreshing;
  }

  // ---------- consultas (desde la cache) ----------
  private cmp(a: LocalRegistro, b: LocalRegistro): number {
    if (a._pending !== b._pending) return a._pending ? -1 : 1;
    const fa = a.fecha_hora || '', fb = b.fecha_hora || '';
    if (fa < fb) return 1; if (fa > fb) return -1;
    return (b.id_registro || 0) - (a.id_registro || 0);
  }

  async query(params: QueryParams = {}): Promise<{ items: LocalRegistro[]; total: number }> {
    let all = (await this.db.getRegistros()).filter((r) => !r._deleted);
    if (params.lote) { const l = params.lote.toLowerCase(); all = all.filter((r) => (r.lote || '').toLowerCase().indexOf(l) !== -1); }
    if (params.linea_prod) { const p = params.linea_prod.toLowerCase(); all = all.filter((r) => (r.linea_prod || '').toLowerCase().indexOf(p) !== -1); }
    if (params.id_tipo_merma != null) all = all.filter((r) => Number(r.id_tipo_merma) === Number(params.id_tipo_merma));
    if (params.aprovechable != null) all = all.filter((r) => r.aprovechable === params.aprovechable);
    if (params.fecha) all = all.filter((r) => (r.fecha_hora || '').slice(0, 10) === params.fecha);
    if (params.desde || params.hasta) all = all.filter((r) => this.enRango(r.fecha_hora, params.desde, params.hasta));
    if (params.id_producto != null) all = all.filter((r) => Number(r.id_producto) === Number(params.id_producto));
    if (params.id_variedad != null) all = all.filter((r) => Number(r.id_variedad) === Number(params.id_variedad));
    if (params.id_caracteristica != null) all = all.filter((r) => Number(r.id_caracteristica) === Number(params.id_caracteristica));
    all.sort((a, b) => this.cmp(a, b));
    const total = all.length;
    const skip = params.skip || 0;
    const limit = params.limit || 20;
    return { items: all.slice(skip, skip + limit), total };
  }

  async getByKey(key: string): Promise<LocalRegistro | undefined> {
    return (await this.db.getRegistros()).find((r) => r._key === key);
  }

  // ---------- informe (agrupado por dia) ----------
  async informe(desde?: string, hasta?: string, unidad: Unidad = 'kg', idProducto?: number | null): Promise<{ items: InformeDia[]; offline: boolean }> {
    if (this.online()) {
      try {
        let params = new HttpParams();
        const d = this.paramRango(desde), h = this.paramRango(hasta);
        if (d) params = params.set('desde', d);
        if (h) params = params.set('hasta', h);
        if (unidad !== 'kg') params = params.set('unidad', unidad);
        if (idProducto != null) params = params.set('id_producto', String(idProducto));
        const data = await this.call(firstValueFrom(this.http.get<any[]>(this.base() + '/mermas/informe', { params })));
        // El backend anterior llamaba total_cascara_hueso a lo no aprovechable.
        const items: InformeDia[] = (data || []).map((r) => ({ ...r, total_no_aprovechable: r.total_no_aprovechable ?? r.total_cascara_hueso ?? '0' }));
        return { items, offline: false };
      } catch (e) {
        if (!(e as ApiError).network) throw e;
      }
    }
    return { items: await this.computeInformeLocal(desde, hasta, unidad, idProducto), offline: true };
  }

  private async computeInformeLocal(desde?: string, hasta?: string, unidad: Unidad = 'kg', idProducto?: number | null): Promise<InformeDia[]> {
    let all = (await this.db.getRegistros()).filter((r) => !r._deleted);
    if (desde || hasta) all = all.filter((r) => this.enRango(r.fecha_hora, desde, hasta));
    if (idProducto != null) all = all.filter((r) => Number(r.id_producto) === Number(idProducto));
    const map: Record<string, { fecha: string; a: number; c: number; n: number; tipos: Record<string, TotalPorTipo & { _n: number }> }> = {};
    all.forEach((r) => {
      const dia = (r.fecha_hora || '').slice(0, 10);
      const g = map[dia] || (map[dia] = { fecha: dia, a: 0, c: 0, n: 0, tipos: {} });
      const kg = aUnidad(Number(r.cant_kg) || 0, unidad);
      if (r.aprovechable) g.a += kg; else g.c += kg;
      this.acumularTipo(g.tipos, r, kg);
      g.n++;
    });
    return Object.keys(map).sort().reverse().map((k) => {
      const g = map[k];
      return { fecha: g.fecha, unidad, total_aprovechable: g.a.toFixed(6), total_no_aprovechable: g.c.toFixed(6), total_general: (g.a + g.c).toFixed(6), num_registros: g.n, por_tipo: this.cerrarTipos(g.tipos) };
    });
  }

  /** Desglose por tipo, igual que el `por_tipo` que manda el backend. */
  private acumularTipo(acc: Record<string, TotalPorTipo & { _n: number }>, r: LocalRegistro, kg: number): void {
    const clave = String(r.id_tipo_merma ?? r.tipo_merma ?? '');
    const t = acc[clave] || (acc[clave] = { id_tipo_merma: Number(r.id_tipo_merma ?? 0), tipo_merma: r.tipo_merma || '', aprovechable: !!r.aprovechable, cant: '0', _n: 0 });
    t._n += kg;
  }
  private cerrarTipos(acc: Record<string, TotalPorTipo & { _n: number }>): TotalPorTipo[] {
    return Object.keys(acc).map((k) => {
      const t = acc[k];
      return { id_tipo_merma: t.id_tipo_merma, tipo_merma: t.tipo_merma, aprovechable: t.aprovechable, cant: t._n.toFixed(6) };
    }).sort((a, b) => (a.aprovechable === b.aprovechable ? a.tipo_merma.localeCompare(b.tipo_merma) : a.aprovechable ? -1 : 1));
  }

  // ---------- reporte por lote (estilo Excel) ----------
  async reporte(desde?: string, hasta?: string, unidad: Unidad = 'kg', idProducto?: number | null): Promise<{ data: ReporteLote; offline: boolean }> {
    if (this.online()) {
      try {
        let params = new HttpParams();
        const d = this.paramRango(desde), h = this.paramRango(hasta);
        if (d) params = params.set('desde', d);
        if (h) params = params.set('hasta', h);
        if (unidad !== 'kg') params = params.set('unidad', unidad);
        if (idProducto != null) params = params.set('id_producto', String(idProducto));
        const data = await this.call(firstValueFrom(this.http.get<ReporteLote>(this.base() + '/mermas/reporte', { params })));
        return { data: { ...data, unidad: data?.unidad || unidad }, offline: false };
      } catch (e) {
        if (!(e as ApiError).network) throw e;
      }
    }
    return { data: await this.computeReporteLocal(desde, hasta, unidad, idProducto), offline: true };
  }

  /** Reporte por lote del dia de hoy (endpoint dedicado del backend). */
  async reporteHoy(unidad: Unidad = 'kg', idProducto?: number | null): Promise<{ data: ReporteLote; offline: boolean }> {
    if (this.online()) {
      try {
        let params = new HttpParams();
        if (unidad !== 'kg') params = params.set('unidad', unidad);
        if (idProducto != null) params = params.set('id_producto', String(idProducto));
        const data = await this.call(firstValueFrom(this.http.get<ReporteLote>(this.base() + '/mermas/reporte/hoy', { params })));
        return { data: { ...data, unidad: data?.unidad || unidad }, offline: false };
      } catch (e) {
        if (!(e as ApiError).network) throw e;
      }
    }
    const d = new Date();
    const ymd = d.getFullYear() + '-' + this.pad(d.getMonth() + 1) + '-' + this.pad(d.getDate());
    return { data: await this.computeReporteLocal(ymd, ymd, unidad, idProducto), offline: true };
  }

  /** Mismo criterio que el backend: una fila por producto + lote + linea. */
  private async computeReporteLocal(desde?: string, hasta?: string, unidad: Unidad = 'kg', idProducto?: number | null): Promise<ReporteLote> {
    let all = (await this.db.getRegistros()).filter((r) => !r._deleted);
    if (desde || hasta) all = all.filter((r) => this.enRango(r.fecha_hora, desde, hasta));
    if (idProducto != null) all = all.filter((r) => Number(r.id_producto) === Number(idProducto));
    const map: Record<string, { prod: string | null; idProd: number | null; lote: string; linea: string; a: number; c: number; n: number; vars: Set<string>; cars: Set<string>; tipos: Record<string, TotalPorTipo & { _n: number }> }> = {};
    let tA = 0, tC = 0, tN = 0;
    all.forEach((r) => {
      const linea = r.linea_prod || '';
      const idProd = r.id_producto ?? null;
      // Un mismo lote de dos productos son dos filas: no se pueden sumar juntos.
      const clave = (idProd ?? '') + '|' + r.lote + '|' + linea;
      const g = map[clave] || (map[clave] = { prod: r.producto ?? null, idProd, lote: r.lote, linea, a: 0, c: 0, n: 0, vars: new Set<string>(), cars: new Set<string>(), tipos: {} });
      if (!g.prod && r.producto) g.prod = r.producto;
      if (r.variedad) g.vars.add(r.variedad);
      if (r.caracteristica) g.cars.add(r.caracteristica);
      const kg = aUnidad(Number(r.cant_kg) || 0, unidad);
      if (r.aprovechable) { g.a += kg; tA += kg; } else { g.c += kg; tC += kg; }
      this.acumularTipo(g.tipos, r, kg);
      g.n++; tN++;
    });
    const lotes = Object.keys(map).sort().map((k) => {
      const g = map[k];
      return { producto: g.prod, id_producto: g.idProd, lote: g.lote, linea_prod: g.linea, variedades: Array.from(g.vars).sort(), caracteristicas: Array.from(g.cars).sort(), rezaga_aprovechable: g.a.toFixed(6), rezaga_no_aprovechable: g.c.toFixed(6), total_rezaga: (g.a + g.c).toFixed(6), num_registros: g.n, por_tipo: this.cerrarTipos(g.tipos) };
    });
    return {
      desde: desde || null, hasta: hasta || null, id_producto: idProducto ?? null, unidad, lotes,
      total_aprovechable: tA.toFixed(6), total_no_aprovechable: tC.toFixed(6), total_rezaga: (tA + tC).toFixed(6), num_registros: tN,
    };
  }

  // ---------- mutaciones ----------
  /**
   * El backend nuevo espera id_tipo_merma; el anterior, el enum tipo_merma.
   * Los ids negativos son los tipos sinteticos del catalogo legacy.
   */
  private tipoPayload(id: number | null | undefined): any {
    if (id == null) return {};
    return id < 0 ? { tipo_merma: id === TIPO_LEGACY_RESIDUO ? 'cascara_hueso' : 'aprovechable' } : { id_tipo_merma: id };
  }

  async crear(data: MermaInput): Promise<{ record: LocalRegistro; queued: boolean }> {
    const payload: any = { cant_kg: Number(data.cant_kg), lote: data.lote, linea_prod: data.linea_prod, ...this.tipoPayload(data.id_tipo_merma) };
    if (data.fecha_hora) payload.fecha_hora = data.fecha_hora;
    if (data.id_producto != null) payload.id_producto = data.id_producto;
    if (data.id_variedad != null) payload.id_variedad = data.id_variedad;
    if (data.id_caracteristica != null) payload.id_caracteristica = data.id_caracteristica;

    if (this.online()) {
      try {
        const rec = await this.call(firstValueFrom(this.http.post<RegistroMermaOut>(this.base() + '/mermas', payload)));
        const local = this.serverShape(rec);
        await this.db.putRegistro(local);
        return { record: local, queued: false };
      } catch (e) {
        if (!(e as ApiError).network) throw e;
      }
    }
    return this.queueCreate(payload);
  }

  private async queueCreate(payload: any): Promise<{ record: LocalRegistro; queued: boolean }> {
    const key = 'loc-' + this.uuid();
    const rec: LocalRegistro = {
      _key: key, _pending: true, _op: 'create', _deleted: false, id_registro: null,
      cant_kg: this.formatKg(payload.cant_kg), ...this.tipoShape(payload), lote: payload.lote,
      linea_prod: payload.linea_prod, fecha_hora: payload.fecha_hora || this.nowISO(),
      id_usuario: null, registrado_por: this.auth.username(),
      id_producto: payload.id_producto ?? null, producto: this.nombreCat('productos', payload.id_producto),
      id_variedad: payload.id_variedad ?? null, variedad: this.nombreCat('variedades', payload.id_variedad),
      id_caracteristica: payload.id_caracteristica ?? null, caracteristica: this.nombreCat('caracteristicas', payload.id_caracteristica),
    };
    await this.db.putRegistro(rec);
    await this.db.addOutbox({ type: 'create', key, serverId: null, payload: { ...payload, fecha_hora: rec.fecha_hora }, createdAt: this.nowISO() });
    await this.updatePending();
    return { record: rec, queued: true };
  }

  async actualizar(key: string, changes: Partial<MermaInput>): Promise<{ record: LocalRegistro; queued: boolean }> {
    const payload: any = {};
    (['cant_kg', 'lote', 'linea_prod', 'fecha_hora'] as const).forEach((k) => {
      const v = (changes as any)[k];
      if (v !== undefined && v !== '') payload[k] = k === 'cant_kg' ? Number(v) : v;
    });
    if (changes.id_tipo_merma !== undefined) Object.assign(payload, this.tipoPayload(changes.id_tipo_merma));
    (['id_producto', 'id_variedad', 'id_caracteristica'] as const).forEach((k) => {
      const v = (changes as any)[k];
      if (v !== undefined) payload[k] = v === null ? null : Number(v);
    });

    const rec = await this.getByKey(key);
    if (!rec) throw { status: 404, detail: 'Registro no encontrado.' } as ApiError;

    if (rec._op === 'create' || rec.id_registro == null) {
      Object.keys(payload).forEach((k) => { (rec as any)[k] = k === 'cant_kg' ? this.formatKg(payload[k]) : payload[k]; });
      this.refrescarNombres(rec);
      await this.db.putRegistro(rec);
      await this.mergeOutboxCreate(key, payload);
      return { record: rec, queued: true };
    }

    if (this.online()) {
      try {
        const updated = await this.call(firstValueFrom(this.http.put<RegistroMermaOut>(this.base() + '/mermas/' + rec.id_registro, payload)));
        const local = this.serverShape(updated);
        await this.db.putRegistro(local);
        return { record: local, queued: false };
      } catch (e) {
        if (!(e as ApiError).network) throw e;
      }
    }
    return this.queueUpdate(rec, payload);
  }

  private async queueUpdate(rec: LocalRegistro, payload: any): Promise<{ record: LocalRegistro; queued: boolean }> {
    Object.keys(payload).forEach((k) => { (rec as any)[k] = k === 'cant_kg' ? this.formatKg(payload[k]) : payload[k]; });
    this.refrescarNombres(rec);
    rec._pending = true;
    await this.db.putRegistro(rec);
    await this.db.addOutbox({ type: 'update', key: rec._key, serverId: rec.id_registro, payload, createdAt: this.nowISO() });
    await this.updatePending();
    return { record: rec, queued: true };
  }

  /** Reetiqueta producto/variedad/caracteristica tras editar sin conexion (los ids ya cambiaron). */
  private refrescarNombres(rec: LocalRegistro): void {
    const t = this.cat.buscar('tipos-merma', rec.id_tipo_merma);
    if (t) { rec.tipo_merma = t.nombre; rec.aprovechable = t.aprovechable === true; }
    rec.producto = this.nombreCat('productos', rec.id_producto);
    rec.variedad = this.nombreCat('variedades', rec.id_variedad);
    rec.caracteristica = this.nombreCat('caracteristicas', rec.id_caracteristica);
  }

  private async mergeOutboxCreate(key: string, changes: any): Promise<void> {
    const all = await this.db.getOutbox();
    const entry = all.find((o) => o.type === 'create' && o.key === key);
    if (!entry) return;
    Object.keys(changes).forEach((k) => { entry.payload[k] = changes[k]; });
    await this.db.addOutbox(entry);
  }

  async eliminar(key: string): Promise<{ queued: boolean }> {
    const rec = await this.getByKey(key);
    if (!rec) return { queued: false };

    if (rec._op === 'create' || rec.id_registro == null) {
      const all = await this.db.getOutbox();
      const entry = all.find((o) => o.type === 'create' && o.key === key);
      if (entry) await this.db.delOutbox(entry.id!);
      await this.db.delRegistro(key);
      await this.updatePending();
      return { queued: false };
    }

    if (this.online()) {
      try {
        await this.call(firstValueFrom(this.http.delete(this.base() + '/mermas/' + rec.id_registro)));
        await this.db.delRegistro(key);
        return { queued: false };
      } catch (e) {
        const err = e as ApiError;
        if (err.status === 404) { await this.db.delRegistro(key); return { queued: false }; }
        if (!err.network) throw e;
      }
    }
    return this.queueDelete(rec);
  }

  private async queueDelete(rec: LocalRegistro): Promise<{ queued: boolean }> {
    rec._deleted = true; rec._pending = true;
    await this.db.putRegistro(rec);
    await this.db.addOutbox({ type: 'delete', key: rec._key, serverId: rec.id_registro, payload: null, createdAt: this.nowISO() });
    await this.updatePending();
    return { queued: true };
  }

  // ---------- varios ----------
  async ping(): Promise<boolean> {
    try {
      await firstValueFrom(this.http.get(this.base() + '/mermas', { params: new HttpParams().set('limit', '1') }));
      return true;
    } catch (e) {
      // Cualquier respuesta HTTP (incluye 401/403) significa que el servidor responde.
      return (e as HttpErrorResponse)?.status !== 0;
    }
  }

  lastSync(): Promise<any> { return this.db.getMeta('lastSync'); }
  clearAll(): Promise<any> { return this.db.clearAll().then(() => this.updatePending()); }
}
