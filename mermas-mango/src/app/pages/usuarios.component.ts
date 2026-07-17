import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../core/auth.service';
import { ToastService } from '../core/toast.service';
import { ApiError, Rol, UsuarioOut } from '../core/models';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page-head">
      <div>
        <h2 class="page-title">Usuarios</h2>
        <p class="page-sub">Crea cuentas, cambia roles y da de baja.</p>
      </div>
      <button class="btn btn--ghost" type="button" (click)="cargar()"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Actualizar</button>
    </div>

    <form class="card form" (ngSubmit)="crear()">
      <h3 class="card__title"><i class="fa-solid fa-user-plus" aria-hidden="true"></i> Nuevo usuario</h3>
      <div class="field">
        <label for="u_user">USUARIO <span class="req">*</span></label>
        <input id="u_user" name="user" [(ngModel)]="uUser" autocapitalize="none" spellcheck="false" maxlength="50" placeholder="nombre.usuario" autocomplete="off" [class.is-invalid]="!!err()['username']" />
        @if (err()['username']) { <span class="error">{{ err()['username'] }}</span> }
      </div>
      <div class="field">
        <label for="u_pass">CONTRASENA <span class="req">*</span></label>
        <div class="pass-wrap">
          <input id="u_pass" [type]="showPass() ? 'text' : 'password'" name="pass" [(ngModel)]="uPass" maxlength="72" placeholder="Contrasena inicial" autocomplete="new-password" [class.is-invalid]="!!err()['password']" />
          <button type="button" class="pass-toggle" (click)="showPass.set(!showPass())" aria-label="Mostrar"><i class="fa-solid" [class.fa-eye]="!showPass()" [class.fa-eye-slash]="showPass()" aria-hidden="true"></i></button>
        </div>
        @if (err()['password']) { <span class="error">{{ err()['password'] }}</span> }
      </div>
      <div class="field">
        <label for="u_rol">ROL <span class="req">*</span></label>
        <select id="u_rol" name="rol" [(ngModel)]="uRol">
          <option value="capturista">Capturista (registra y consulta)</option>
          <option value="reportes">Reportes (solo consulta)</option>
          <option value="admin">Administrador (control total)</option>
        </select>
      </div>
      <div class="form__actions">
        <button class="btn btn--primary" type="submit" [disabled]="submitting()"><i class="fa-solid fa-user-plus" aria-hidden="true"></i> Crear usuario</button>
      </div>
    </form>

    <div class="section-head">
      <span class="section-head__badge section-head__badge--blue"><i class="fa-solid fa-users" aria-hidden="true"></i></span>
      <h3>Cuentas <span class="section-head__count">({{ users().length }})</span></h3>
    </div>
    <div class="list">
      @if (loading()) {
        <div class="skeleton"></div><div class="skeleton"></div>
      } @else if (users().length === 0) {
        <div class="empty"><i class="fa-solid {{ emptyIcon() }}" aria-hidden="true"></i><strong>{{ emptyTitle() }}</strong><span>{{ emptySub() }}</span></div>
      } @else {
        @for (u of users(); track u.id_usuario) {
          <div class="item">
            <span class="item__icon"><i class="fa-solid fa-user" aria-hidden="true"></i></span>
            <div class="item__main"><div class="item__top">
              <span class="item__kg" style="font-size:1.05rem">{{ u.username }}</span>
              <span class="rolebadge rolebadge--{{ u.rol }}">{{ auth.roleLabel(u.rol) || u.rol }}</span>
              @if (!u.activo) { <span class="badge badge--off"><i class="fa-solid fa-ban" aria-hidden="true"></i> Inactivo</span> }
              @if (esYo(u)) { <span class="badge badge--lote">tu</span> }
            </div></div>
            <div class="item__actions">
              <button class="iconaction" type="button" (click)="abrirEditar(u)" title="Editar"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
              <button class="iconaction iconaction--danger" type="button" (click)="confirmDel.set(u)" [disabled]="esYo(u)" title="Eliminar"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>
            </div>
          </div>
        }
      }
    </div>

    @if (editando(); as u) {
      <div class="overlay" (click)="editando.set(null)"></div>
      <div class="confirm">
        <h3 class="confirm__title"><i class="fa-solid fa-user-pen" aria-hidden="true"></i> Editar usuario</h3>
        <div class="form" style="gap:12px">
          <div class="field">
            <label>USUARIO</label>
            <input name="eu" [(ngModel)]="eUser" autocapitalize="none" spellcheck="false" maxlength="50" [class.is-invalid]="!!eErr()['username']" />
            @if (eErr()['username']) { <span class="error">{{ eErr()['username'] }}</span> }
          </div>
          <div class="field">
            <label>CONTRASENA <small class="hint">(dejala vacia para no cambiarla)</small></label>
            <input type="text" name="ep" [(ngModel)]="ePass" maxlength="72" placeholder="Nueva contrasena" autocomplete="new-password" [class.is-invalid]="!!eErr()['password']" />
            @if (eErr()['password']) { <span class="error">{{ eErr()['password'] }}</span> }
          </div>
          <div class="field">
            <label>ROL</label>
            <select name="er" [(ngModel)]="eRol">
              <option value="capturista">Capturista</option>
              <option value="reportes">Reportes</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
          <label class="switch">
            <input type="checkbox" name="ea" [(ngModel)]="eActivo" [disabled]="esYo(u)" />
            <span class="switch__track"><span class="switch__thumb"></span></span>
            <span class="switch__label">Cuenta activa</span>
          </label>
        </div>
        <div class="confirm__actions">
          <button class="btn btn--ghost" type="button" (click)="editando.set(null)">Cancelar</button>
          <button class="btn btn--primary" type="button" (click)="guardarEditar(u)" [disabled]="guardando()">Guardar</button>
        </div>
      </div>
    }

    @if (confirmDel(); as u) {
      <div class="overlay" (click)="confirmDel.set(null)"></div>
      <div class="confirm">
        <h3 class="confirm__title"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Eliminar usuario</h3>
        <p class="confirm__msg">Se eliminara la cuenta <b>{{ u.username }}</b>. Sus registros de merma se conservan (quedan sin dueño).</p>
        <div class="confirm__actions">
          <button class="btn btn--ghost" type="button" (click)="confirmDel.set(null)">Cancelar</button>
          <button class="btn btn--danger" type="button" (click)="eliminar(u)">Eliminar</button>
        </div>
      </div>
    }
  `,
})
export class UsuariosComponent implements OnInit {
  auth = inject(AuthService);
  private toast = inject(ToastService);

  uUser = ''; uPass = ''; uRol: Rol = 'capturista';
  showPass = signal(false);
  err = signal<Record<string, string>>({});
  users = signal<UsuarioOut[]>([]);
  loading = signal(true);
  submitting = signal(false);
  emptyIcon = signal('fa-users');
  emptyTitle = signal('Sin usuarios');
  emptySub = signal('Crea el primero con el formulario de arriba.');

  // edicion
  editando = signal<UsuarioOut | null>(null);
  eUser = ''; ePass = ''; eRol: Rol = 'capturista'; eActivo = true;
  eErr = signal<Record<string, string>>({});
  guardando = signal(false);

  // borrado
  confirmDel = signal<UsuarioOut | null>(null);

  ngOnInit() { this.cargar(); }

  esYo(u: UsuarioOut): boolean { return u.username === this.auth.username(); }

  async cargar() {
    this.loading.set(true);
    try {
      this.users.set(await this.auth.listUsers());
    } catch (e) {
      const err = e as ApiError;
      this.users.set([]);
      if (err?.status === 403) { this.emptyIcon.set('fa-lock'); this.emptyTitle.set('Sin permiso'); this.emptySub.set('Solo un administrador puede ver los usuarios.'); }
      else if (err?.network) { this.emptyIcon.set('fa-wifi'); this.emptyTitle.set('Sin conexion'); this.emptySub.set('Conectate para ver los usuarios.'); }
      else { this.emptyIcon.set('fa-triangle-exclamation'); this.emptyTitle.set('No se pudo cargar'); this.emptySub.set('Intenta de nuevo.'); }
    } finally {
      this.loading.set(false);
    }
  }

  async crear() {
    const u = this.uUser.trim();
    const p = this.uPass;
    const e: Record<string, string> = {};
    if (!u) e['username'] = 'Escribe el usuario.'; else if (u.length < 3) e['username'] = 'Minimo 3 caracteres.';
    if (!p) e['password'] = 'Escribe la contrasena.'; else if (p.length < 4) e['password'] = 'Minimo 4 caracteres.';
    this.err.set(e);
    if (Object.keys(e).length) return;

    this.submitting.set(true);
    try {
      await this.auth.register(u, p, this.uRol);
      this.toast.show('Usuario creado', 'ok');
      this.uUser = ''; this.uPass = '';
      await this.cargar();
    } catch (err) {
      this.manejarError(err as ApiError, 'No se pudo crear el usuario');
    } finally {
      this.submitting.set(false);
    }
  }

  abrirEditar(u: UsuarioOut) {
    this.eUser = u.username; this.ePass = ''; this.eRol = u.rol as Rol; this.eActivo = u.activo;
    this.eErr.set({});
    this.editando.set(u);
  }

  async guardarEditar(u: UsuarioOut) {
    const eu = this.eUser.trim();
    const e: Record<string, string> = {};
    if (!eu) e['username'] = 'Escribe el usuario.'; else if (eu.length < 3) e['username'] = 'Minimo 3 caracteres.';
    if (this.ePass && this.ePass.length < 4) e['password'] = 'Minimo 4 caracteres.';
    this.eErr.set(e);
    if (Object.keys(e).length) return;

    const changes: { username?: string; password?: string; rol?: Rol; activo?: boolean } = { rol: this.eRol, activo: this.eActivo };
    if (eu !== u.username) changes.username = eu;
    if (this.ePass) changes.password = this.ePass;

    this.guardando.set(true);
    try {
      await this.auth.updateUser(u.id_usuario, changes);
      this.toast.show('Usuario actualizado', 'ok');
      this.editando.set(null);
      await this.cargar();
    } catch (err) {
      this.manejarError(err as ApiError, 'No se pudo actualizar');
    } finally {
      this.guardando.set(false);
    }
  }

  async eliminar(u: UsuarioOut) {
    this.confirmDel.set(null);
    try {
      await this.auth.deleteUser(u.id_usuario);
      this.toast.show('Usuario eliminado', 'ok');
      await this.cargar();
    } catch (err) {
      this.manejarError(err as ApiError, 'No se pudo eliminar');
    }
  }

  private manejarError(err: ApiError, generico: string) {
    if (err?.status === 403) this.toast.show('No tienes permiso para esta accion', 'error');
    else if (err?.status === 400 || err?.status === 409) this.toast.show(this.detalle(err) || 'El usuario ya existe', 'error');
    else if (err?.status === 404) this.toast.show('El usuario ya no existe', 'error');
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
