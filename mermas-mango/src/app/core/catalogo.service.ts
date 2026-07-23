import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from './config.service';
import { DbService } from './db.service';
import { NetworkService } from './network.service';
import { ApiError, CatalogoItem, CatalogoTipo } from './models';

/**
 * Catalogos editables del backend (/variedades y /caracteristicas).
 * Lectura: cualquier usuario. Escritura: solo admin.
 * Se cachean en local para que la captura funcione sin conexion.
 */
@Injectable({ providedIn: 'root' })
export class CatalogoService {
  private http = inject(HttpClient);
  private cfg = inject(ConfigService);
  private db = inject(DbService);
  private net = inject(NetworkService);

  readonly variedades = signal<CatalogoItem[]>([]);
  readonly caracteristicas = signal<CatalogoItem[]>([]);

  private base(tipo: CatalogoTipo): string { return this.cfg.apiBase + '/' + tipo; }
  private metaKey(tipo: CatalogoTipo): string { return 'cat_' + tipo; }
  private signalDe(tipo: CatalogoTipo) { return tipo === 'variedades' ? this.variedades : this.caracteristicas; }

  /** La API puede devolver id_variedad / id_caracteristica / id: se normaliza a { id, nombre, activo }. */
  private norm(row: any): CatalogoItem {
    return {
      id: row?.id_variedad ?? row?.id_caracteristica ?? row?.id,
      nombre: row?.nombre ?? row?.variedad ?? row?.caracteristica ?? '',
      activo: row?.activo !== false,
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

  /** Carga ambos catalogos (de la API si hay red; si no, de la cache local). */
  async cargarTodos(): Promise<void> {
    await Promise.all([this.cargar('variedades'), this.cargar('caracteristicas')]);
  }

  async cargar(tipo: CatalogoTipo): Promise<CatalogoItem[]> {
    const sig = this.signalDe(tipo);
    if (this.net.online()) {
      try {
        const data = await this.call(firstValueFrom(this.http.get<any[]>(this.base(tipo))));
        const items = (data || []).map((r) => this.norm(r));
        sig.set(items);
        await this.db.setMeta(this.metaKey(tipo), items);
        return items;
      } catch (e) {
        if (!(e as ApiError).network) throw e;
      }
    }
    const cache = (await this.db.getMeta(this.metaKey(tipo))) as CatalogoItem[] | null;
    const items = cache || [];
    sig.set(items);
    return items;
  }

  /** Solo los activos, para los selectores de captura. */
  activos(tipo: CatalogoTipo): CatalogoItem[] {
    return this.signalDe(tipo)().filter((x) => x.activo);
  }

  // ---- escritura (solo admin en el backend) ----
  async crear(tipo: CatalogoTipo, nombre: string): Promise<CatalogoItem> {
    const row = await this.call(firstValueFrom(this.http.post<any>(this.base(tipo), { nombre })));
    await this.cargar(tipo);
    return this.norm(row);
  }

  async actualizar(tipo: CatalogoTipo, id: number, cambios: { nombre?: string; activo?: boolean }): Promise<CatalogoItem> {
    const row = await this.call(firstValueFrom(this.http.put<any>(this.base(tipo) + '/' + id, cambios)));
    await this.cargar(tipo);
    return this.norm(row);
  }

  async eliminar(tipo: CatalogoTipo, id: number): Promise<void> {
    await this.call(firstValueFrom(this.http.delete(this.base(tipo) + '/' + id)));
    await this.cargar(tipo);
  }
}
