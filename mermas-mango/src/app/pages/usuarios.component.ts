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
        <p class="page-sub">Crea cuentas y asigna roles.</p>
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
          <button type="button" class="pass-toggle" (click)="showPass.set(!showPass())" aria-label="Mostrar contrasena"><i class="fa-solid" [class.fa-eye]="!showPass()" [class.fa-eye-slash]="showPass()" aria-hidden="true"></i></button>
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
            </div></div>
          </div>
        }
      }
    </div>
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

  ngOnInit() { this.cargar(); }

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
      const ae = err as ApiError;
      if (ae?.status === 403) this.toast.show('Solo un administrador puede crear usuarios', 'error');
      else if (ae?.status === 400 || ae?.status === 409) this.toast.show(this.detalle(ae) || 'El usuario ya existe', 'error');
      else if (ae?.status === 422) this.toast.show(this.detalle(ae) || 'Datos invalidos', 'error');
      else if (ae?.network) this.toast.show('Sin conexion con el servidor', 'error');
      else this.toast.show(this.detalle(ae) || 'No se pudo crear el usuario', 'error');
    } finally {
      this.submitting.set(false);
    }
  }

  private detalle(err: ApiError): string {
    if (!err) return '';
    if (typeof err.detail === 'string') return err.detail;
    if (Array.isArray(err.detail) && err.detail[0]) return err.detail[0].msg;
    return '';
  }
}
