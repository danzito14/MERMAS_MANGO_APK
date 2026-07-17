import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from './config.service';
import { ApiError, Rol, UsuarioOut } from './models';

const TKEY = 'mm_token';
const UKEY = 'mm_user';
const RKEY = 'mm_role';

interface Perm { write: boolean; users: boolean; }
const PERM: Record<string, Perm> = {
  admin: { write: true, users: true },
  capturista: { write: true, users: false },
  reportes: { write: false, users: false },
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private cfg = inject(ConfigService);

  readonly role = signal<Rol>(this.getRole());
  readonly username = signal<string>(this.getUser());
  readonly canWrite = computed(() => this.perms().write);
  readonly canUsers = computed(() => this.perms().users);

  private perms(): Perm { return PERM[this.role()] || { write: false, users: false }; }

  // ---- almacenamiento ----
  getToken(): string { try { return localStorage.getItem(TKEY) || ''; } catch { return ''; } }
  private setToken(t: string) { try { localStorage.setItem(TKEY, t || ''); } catch { /* */ } }
  private getUser(): string { try { return localStorage.getItem(UKEY) || ''; } catch { return ''; } }
  private setUser(u: string) { try { localStorage.setItem(UKEY, u || ''); } catch { /* */ } this.username.set(u || 'usuario'); }
  private getRole(): Rol { try { return (localStorage.getItem(RKEY) || '') as Rol; } catch { return ''; } }
  private setRole(r: Rol) { try { localStorage.setItem(RKEY, r || ''); } catch { /* */ } this.role.set(r || ''); }

  clearSession(): void {
    try { localStorage.removeItem(TKEY); localStorage.removeItem(UKEY); localStorage.removeItem(RKEY); } catch { /* */ }
    this.role.set('');
    this.username.set('');
  }

  // ---- JWT ----
  private payload(): any {
    const t = this.getToken();
    if (!t || t.indexOf('.') === -1) return null;
    try {
      let b = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b.length % 4) b += '=';
      return JSON.parse(decodeURIComponent(escape(atob(b))));
    } catch { return null; }
  }
  private expired(): boolean {
    const p = this.payload();
    if (!p || !p.exp) return false;
    return p.exp * 1000 <= Date.now();
  }

  /** Autenticado si hay token vigente. Sin conexion se acepta el token guardado. */
  isAuthenticated(): boolean {
    if (!this.getToken()) return false;
    if (this.expired()) return !navigator.onLine;
    return true;
  }

  roleLabel(r: Rol = this.role()): string {
    return r === 'admin' ? 'Administrador' : r === 'reportes' ? 'Reportes' : r === 'capturista' ? 'Capturista' : '';
  }

  // ---- llamadas ----
  private async call<T>(obs: Promise<T>): Promise<T> {
    try { return await obs; }
    catch (e) {
      const err = e as HttpErrorResponse;
      if (err && err.status === 0) throw { network: true } as ApiError;
      throw { status: err?.status, detail: err?.error?.detail } as ApiError;
    }
  }

  async login(user: string, pass: string): Promise<void> {
    const body = new URLSearchParams();
    body.set('username', user);
    body.set('password', pass);
    const data = await this.call(
      firstValueFrom(this.http.post<{ access_token: string }>(this.cfg.apiBase + '/auth/login', body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })),
    );
    this.setToken(data.access_token);
    this.setUser(user);
    await this.refreshMe(user);
  }

  /** Obtiene rol y username reales desde /auth/me y los guarda. */
  async refreshMe(fallbackUser?: string): Promise<UsuarioOut | null> {
    try {
      const info = await this.call(firstValueFrom(this.http.get<UsuarioOut>(this.cfg.apiBase + '/auth/me')));
      this.setUser(info.username || fallbackUser || this.getUser());
      this.setRole((info.rol || '') as Rol);
      return info;
    } catch (e) {
      const err = e as ApiError;
      if (err && err.network) { if (fallbackUser) this.setUser(fallbackUser); return null; }
      throw err;
    }
  }

  register(user: string, pass: string, rol: Rol): Promise<UsuarioOut> {
    return this.call(firstValueFrom(this.http.post<UsuarioOut>(this.cfg.apiBase + '/auth/register', {
      username: user, password: pass, rol: rol || 'capturista',
    })));
  }

  listUsers(): Promise<UsuarioOut[]> {
    return this.call(firstValueFrom(this.http.get<UsuarioOut[]>(this.cfg.apiBase + '/auth/usuarios')));
  }
}
