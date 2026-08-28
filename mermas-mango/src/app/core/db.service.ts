import { Injectable } from '@angular/core';
import { LocalRegistro, OutboxEntry, TIPO_LEGACY_APROVECHABLE, TIPO_LEGACY_RESIDUO } from './models';

const DB_NAME = 'mermas_mango';
const DB_VERSION = 1;

/**
 * Capa de datos local (IndexedDB) para funcionamiento sin conexion.
 * - registros : cache de registros (keyPath "_key": "srv-<id>" o "loc-<uuid>").
 * - outbox    : cola de cambios pendientes de enviar.
 * - meta      : pares clave/valor.
 */
@Injectable({ providedIn: 'root' })
export class DbService {
  private dbp: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (this.dbp) return this.dbp;
    this.dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('registros')) {
          const s = db.createObjectStore('registros', { keyPath: '_key' });
          s.createIndex('lote', 'lote', { unique: false });
          s.createIndex('tipo_merma', 'tipo_merma', { unique: false });
          s.createIndex('fecha_hora', 'fecha_hora', { unique: false });
        }
        if (!db.objectStoreNames.contains('outbox')) {
          db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'k' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbp;
  }

  private store(name: string, mode: IDBTransactionMode): Promise<IDBObjectStore> {
    return this.open().then((db) => db.transaction(name, mode).objectStore(name));
  }

  private req<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private getAll<T>(name: string): Promise<T[]> {
    return this.store(name, 'readonly').then((os) => this.req(os.getAll() as IDBRequest<T[]>));
  }
  private get<T>(name: string, key: IDBValidKey): Promise<T | undefined> {
    return this.store(name, 'readonly').then((os) => this.req(os.get(key) as IDBRequest<T | undefined>));
  }
  private put(name: string, value: any): Promise<IDBValidKey> {
    return this.store(name, 'readwrite').then((os) => this.req(os.put(value)));
  }
  private del(name: string, key: IDBValidKey): Promise<undefined> {
    return this.store(name, 'readwrite').then((os) => this.req(os.delete(key)));
  }
  private clearStore(name: string): Promise<undefined> {
    return this.store(name, 'readwrite').then((os) => this.req(os.clear()));
  }

  // ----- registros -----
  getRegistros(): Promise<LocalRegistro[]> {
    return this.getAll<LocalRegistro>('registros').then((rows) => rows.map((r) => this.compat(r)));
  }

  /**
   * Al actualizar la app, la cache del telefono trae registros de la version anterior,
   * cuando tipo_merma era el enum y no existia la bandera. Se traducen al leerlos.
   */
  private compat(r: LocalRegistro): LocalRegistro {
    if (r && r.aprovechable === undefined) {
      const residuo = (r.tipo_merma as any) === 'cascara_hueso';
      r.aprovechable = !residuo;
      r.id_tipo_merma = r.id_tipo_merma ?? (residuo ? TIPO_LEGACY_RESIDUO : TIPO_LEGACY_APROVECHABLE);
      r.tipo_merma = residuo ? 'Cascara y Hueso' : 'Aprovechable';
    }
    return r;
  }
  putRegistro(r: LocalRegistro): Promise<IDBValidKey> { return this.put('registros', r); }
  delRegistro(key: string): Promise<undefined> { return this.del('registros', key); }

  /** Reemplaza los registros del servidor conservando (sin pisar) los locales pendientes. */
  replaceServerRegistros(serverList: LocalRegistro[]): Promise<boolean> {
    return this.open().then(
      (db) =>
        new Promise<boolean>((resolve, reject) => {
          const t = db.transaction('registros', 'readwrite');
          const os = t.objectStore('registros');
          const pending: LocalRegistro[] = [];
          os.openCursor().onsuccess = (e) => {
            const cur = (e.target as IDBRequest<IDBCursorWithValue>).result;
            if (cur) {
              if ((cur.value as LocalRegistro)._pending) pending.push(cur.value);
              cur.continue();
            } else {
              os.clear().onsuccess = () => {
                const pendKeys: Record<string, boolean> = {};
                pending.forEach((p) => { os.put(p); pendKeys[p._key] = true; });
                serverList.forEach((row) => {
                  if (pendKeys[row._key]) return; // no pisar edicion/borrado pendiente
                  os.put(row);
                });
              };
            }
          };
          t.oncomplete = () => resolve(true);
          t.onerror = () => reject(t.error);
        }),
    );
  }

  // ----- outbox -----
  getOutbox(): Promise<OutboxEntry[]> { return this.getAll<OutboxEntry>('outbox'); }
  addOutbox(entry: OutboxEntry): Promise<IDBValidKey> { return this.put('outbox', entry); }
  delOutbox(id: number): Promise<undefined> { return this.del('outbox', id); }
  countOutbox(): Promise<number> {
    return this.store('outbox', 'readonly').then((os) => this.req(os.count()));
  }

  // ----- meta -----
  setMeta(k: string, value: any): Promise<IDBValidKey> { return this.put('meta', { k, value }); }
  getMeta(k: string): Promise<any> { return this.get<{ k: string; value: any }>('meta', k).then((r) => (r ? r.value : null)); }

  clearAll(): Promise<any> {
    return Promise.all([this.clearStore('registros'), this.clearStore('outbox'), this.clearStore('meta')]);
  }
}
