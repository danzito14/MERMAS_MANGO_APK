import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { ConfigService } from '../core/config.service';
import { ApiError } from '../core/models';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="auth">
      <div class="auth__card">
        <div class="auth__brand">
          <img src="icons/icon-192.png" alt="" width="72" height="72" />
          <h1>Mermas Mango</h1>
          <p class="auth__tag">Control de mermas por lote</p>
        </div>
        <form class="auth__form" (ngSubmit)="submit()">
          <h2 class="auth__title">Iniciar sesion</h2>
          <div class="field">
            <label for="au_user">USUARIO</label>
            <input id="au_user" type="text" name="user" [(ngModel)]="user" autocapitalize="none" spellcheck="false" placeholder="Tu usuario" />
          </div>
          <div class="field">
            <label for="au_pass">CONTRASENA</label>
            <div class="pass-wrap">
              <input id="au_pass" [type]="showPass() ? 'text' : 'password'" name="pass" [(ngModel)]="pass" placeholder="Tu contrasena" />
              <button type="button" class="pass-toggle" (click)="showPass.set(!showPass())" aria-label="Mostrar contrasena">
                <i class="fa-solid" [class.fa-eye]="!showPass()" [class.fa-eye-slash]="showPass()" aria-hidden="true"></i>
              </button>
            </div>
          </div>
          @if (error()) { <div class="auth__error">{{ error() }}</div> }
          <button class="btn btn--primary btn--lg auth__submit" type="submit" [disabled]="submitting()">
            <i class="fa-solid fa-right-to-bracket" aria-hidden="true"></i> Entrar
          </button>
        </form>
        <p class="auth__hint muted">Las cuentas las crea el administrador desde la app.</p>
        <div class="auth__cfg">
          <p class="muted"><i class="fa-solid fa-server" aria-hidden="true"></i> Servidor: <b>{{ server() }}</b>
            <button type="button" class="link" (click)="toggleCfg()">cambiar</button></p>
          @if (cfgOpen()) {
            <div class="field">
              <input type="url" name="apiUrl" [(ngModel)]="apiUrl" (change)="saveApi()" placeholder="https://mermasmango.slagricola.cloud" autocomplete="off" />
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class LoginComponent {
  private auth = inject(AuthService);
  private cfg = inject(ConfigService);
  private router = inject(Router);

  user = '';
  pass = '';
  apiUrl = '';
  error = signal('');
  showPass = signal(false);
  cfgOpen = signal(false);
  submitting = signal(false);
  server = signal(this.cfg.apiBase);

  async submit() {
    this.error.set('');
    const u = this.user.trim();
    const p = this.pass;
    if (!u || !p) { this.error.set('Escribe usuario y contrasena.'); return; }
    this.submitting.set(true);
    try {
      await this.auth.login(u, p);
      this.router.navigateByUrl(this.auth.canWrite() ? '/captura' : '/panel');
    } catch (e) {
      const err = e as ApiError;
      if (err?.network) this.error.set("Sin conexion con el servidor. Revisa la URL en 'cambiar'.");
      else if (err?.status === 401) this.error.set('Usuario o contrasena incorrectos.');
      else this.error.set(this.detalle(err) || 'No se pudo iniciar sesion. Intenta de nuevo.');
    } finally {
      this.submitting.set(false);
    }
  }

  toggleCfg() { this.cfgOpen.update((v) => !v); if (this.cfgOpen()) this.apiUrl = this.cfg.apiBase; }
  saveApi() { this.cfg.setApiBase(this.apiUrl.trim()); this.server.set(this.cfg.apiBase); }

  private detalle(err: ApiError): string {
    if (!err) return '';
    if (typeof err.detail === 'string') return err.detail;
    if (Array.isArray(err.detail) && err.detail[0]) return err.detail[0].msg;
    return '';
  }
}
