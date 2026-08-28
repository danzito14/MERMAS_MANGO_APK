import { Injectable } from '@angular/core';

// Backend local de desarrollo. Para volver a produccion: 'https://mermasmango.slagricola.cloud'.
// Se puede sobreescribir en tiempo de ejecucion con localStorage['mm_api_base'].
const DEFAULT_API = 'https://mermasmango.slagricola.cloud';
// const DEFAULT_API = 'http://127.0.0.1:8013';
const KEY = 'mm_api_base';

@Injectable({ providedIn: 'root' })
export class ConfigService {
  readonly defaultApi = DEFAULT_API;

  get apiBase(): string {
    try {
      const v = localStorage.getItem(KEY);
      return v && v.trim() ? v.trim().replace(/\/+$/, '') : DEFAULT_API;
    } catch {
      return DEFAULT_API;
    }
  }

  setApiBase(url: string): string {
    const clean = (url || '').trim().replace(/\/+$/, '');
    try { localStorage.setItem(KEY, clean || DEFAULT_API); } catch { /* ignore */ }
    return this.apiBase;
  }
}
