import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from './config.service';
import { DbService } from './db.service';
import { NetworkService } from './network.service';
import { AuthService } from './auth.service';
import { ApiError, InformeLote, LocalRegistro, MermaInput, OutboxEntry, RegistroMermaOut } from './models';

export interface QueryParams { lote?: string; linea_prod?: string; tipo_merma?: string; skip?: number; limit?: number; }

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private cfg = inject(ConfigService);
  private db = inject(DbService);
  private net = inject(NetworkService);
  private auth = inject(AuthService);

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
  formatKg(v: number | string): string {
    const n = Number(v);
    return isNaN(n) ? '0.00' : n.toFixed(2);
  }
  private serverShape(row: RegistroMermaOut): LocalRegistro {
    return {
      _key: 'srv-' + row.id_registro, _pending: false, _op: null, _deleted: false,
      id_registro: row.id_registro, cant_kg: row.cant_kg, tipo_merma: row.tipo_merma,
      lote: row.lote, linea_prod: row.linea_prod, fecha_hora: row.fecha_hora,
      id_usuario: row.id_usuario ?? null, registrado_por: row.registrado_por ?? null,
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
        await this.db.replaceServerRegistros(data || []);
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
    if (params.tipo_merma) all = all.filter((r) => r.tipo_merma === params.tipo_merma);
    all.sort((a, b) => this.cmp(a, b));
    const total = all.length;
    const skip = params.skip || 0;
    const limit = params.limit || 20;
    return { items: all.slice(skip, skip + limit), total };
  }

  async getByKey(key: string): Promise<LocalRegistro | undefined> {
    return (await this.db.getRegistros()).find((r) => r._key === key);
  }

  // ---------- informe ----------
  async informe(lote?: string): Promise<{ items: InformeLote[]; offline: boolean }> {
    if (this.online()) {
      try {
        let params = new HttpParams();
        if (lote) params = params.set('lote', lote);
        const data = await this.call(firstValueFrom(this.http.get<InformeLote[]>(this.base() + '/mermas/informe', { params })));
        return { items: data || [], offline: false };
      } catch (e) {
        if (!(e as ApiError).network) throw e;
      }
    }
    return { items: await this.computeInformeLocal(lote), offline: true };
  }

  private async computeInformeLocal(lote?: string): Promise<InformeLote[]> {
    let all = (await this.db.getRegistros()).filter((r) => !r._deleted);
    if (lote) all = all.filter((r) => r.lote === lote);
    const map: Record<string, { lote: string; a: number; c: number; n: number }> = {};
    all.forEach((r) => {
      const g = map[r.lote] || (map[r.lote] = { lote: r.lote, a: 0, c: 0, n: 0 });
      const kg = Number(r.cant_kg) || 0;
      if (r.tipo_merma === 'aprovechable') g.a += kg; else g.c += kg;
      g.n++;
    });
    return Object.keys(map).sort().map((k) => {
      const g = map[k];
      return { lote: g.lote, total_aprovechable: g.a.toFixed(2), total_cascara_hueso: g.c.toFixed(2), total_general: (g.a + g.c).toFixed(2), num_registros: g.n };
    });
  }

  // ---------- mutaciones ----------
  async crear(data: MermaInput): Promise<{ record: LocalRegistro; queued: boolean }> {
    const payload: any = { cant_kg: Number(data.cant_kg), tipo_merma: data.tipo_merma, lote: data.lote, linea_prod: data.linea_prod };
    if (data.fecha_hora) payload.fecha_hora = data.fecha_hora;

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
      cant_kg: this.formatKg(payload.cant_kg), tipo_merma: payload.tipo_merma, lote: payload.lote,
      linea_prod: payload.linea_prod, fecha_hora: payload.fecha_hora || this.nowISO(),
      id_usuario: null, registrado_por: this.auth.username(),
    };
    await this.db.putRegistro(rec);
    await this.db.addOutbox({ type: 'create', key, serverId: null, payload: { ...payload, fecha_hora: rec.fecha_hora }, createdAt: this.nowISO() });
    await this.updatePending();
    return { record: rec, queued: true };
  }

  async actualizar(key: string, changes: Partial<MermaInput>): Promise<{ record: LocalRegistro; queued: boolean }> {
    const payload: any = {};
    (['cant_kg', 'tipo_merma', 'lote', 'linea_prod', 'fecha_hora'] as const).forEach((k) => {
      const v = (changes as any)[k];
      if (v !== undefined && v !== '') payload[k] = k === 'cant_kg' ? Number(v) : v;
    });

    const rec = await this.getByKey(key);
    if (!rec) throw { status: 404, detail: 'Registro no encontrado.' } as ApiError;

    if (rec._op === 'create' || rec.id_registro == null) {
      Object.keys(payload).forEach((k) => { (rec as any)[k] = k === 'cant_kg' ? this.formatKg(payload[k]) : payload[k]; });
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
    rec._pending = true;
    await this.db.putRegistro(rec);
    await this.db.addOutbox({ type: 'update', key: rec._key, serverId: rec.id_registro, payload, createdAt: this.nowISO() });
    await this.updatePending();
    return { record: rec, queued: true };
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
