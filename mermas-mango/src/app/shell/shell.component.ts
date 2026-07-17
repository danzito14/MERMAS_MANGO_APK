import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { ApiService } from '../core/api.service';
import { NetworkService } from '../core/network.service';
import { ToastService } from '../core/toast.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="topbar">
      <div class="topbar__left">
        <button class="iconbtn" type="button" (click)="toggleMenu()" aria-label="Menu"><i class="fa-solid fa-bars" aria-hidden="true"></i></button>
        <div class="topbar__brand">
          <img src="icons/icon-96.png" alt="" class="topbar__logo" width="32" height="32" />
          <span class="topbar__title">MERMAS MANGO</span>
        </div>
      </div>
      <div class="topbar__right">
        @if (api.pending() > 0) {
          <button class="chip chip--sync" type="button" (click)="sync()" title="Sincronizar pendientes">
            <i class="fa-solid fa-rotate" aria-hidden="true"></i> <span>{{ api.pending() }}</span>
          </button>
        }
        <span class="chip chip--net" [class.is-offline]="!net.online()">
          <i class="fa-solid fa-circle" aria-hidden="true"></i>
          <span class="chip__text">{{ net.online() ? 'En linea' : 'Sin conexion' }}</span>
        </span>
      </div>
    </header>

    <aside class="sidebar" [class.is-open]="menuOpen()" aria-label="Navegacion principal">
      <div class="sidebar__head">
        <span class="sidebar__label">NAVEGACION</span>
        <button class="iconbtn iconbtn--dark" type="button" (click)="toggleMenu(false)" aria-label="Cerrar menu"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
      </div>
      <nav class="sidebar__nav">
        @if (auth.canCreate()) {
          <a class="navitem" routerLink="/captura" routerLinkActive="is-active" (click)="toggleMenu(false)"><i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i><span>Registrar merma</span></a>
        }
        <a class="navitem" routerLink="/panel" routerLinkActive="is-active" (click)="toggleMenu(false)"><i class="fa-solid fa-chart-pie" aria-hidden="true"></i><span>Panel</span></a>
        <a class="navitem" routerLink="/registros" routerLinkActive="is-active" (click)="toggleMenu(false)"><i class="fa-solid fa-list-ul" aria-hidden="true"></i><span>Registros</span></a>
        <a class="navitem" routerLink="/informe" routerLinkActive="is-active" (click)="toggleMenu(false)"><i class="fa-solid fa-chart-column" aria-hidden="true"></i><span>Informe por lote</span></a>
        @if (auth.canUsers()) {
          <a class="navitem" routerLink="/usuarios" routerLinkActive="is-active" (click)="toggleMenu(false)"><i class="fa-solid fa-users-gear" aria-hidden="true"></i><span>Usuarios</span></a>
        }
        <div class="sidebar__divider"></div>
        <a class="navitem" routerLink="/ajustes" routerLinkActive="is-active" (click)="toggleMenu(false)"><i class="fa-solid fa-gear" aria-hidden="true"></i><span>Ajustes</span></a>
      </nav>
      <div class="sidebar__foot">
        <div class="sidebar__user">
          <i class="fa-solid fa-circle-user" aria-hidden="true"></i>
          <span>
            <span>{{ auth.username() }}</span>
            @if (auth.roleLabel()) { <span class="rolebadge rolebadge--{{ auth.role() }}">{{ auth.roleLabel() }}</span> }
          </span>
        </div>
        <button class="navitem navitem--logout" type="button" (click)="logout()"><i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i><span>Cerrar sesion</span></button>
        <span class="muted sidebar__ver">Mermas Mango &middot; v1.0.0</span>
      </div>
    </aside>
    @if (menuOpen()) { <div class="overlay" (click)="toggleMenu(false)"></div> }

    <main class="content">
      <router-outlet></router-outlet>
    </main>
  `,
})
export class ShellComponent implements OnInit {
  auth = inject(AuthService);
  net = inject(NetworkService);
  api = inject(ApiService);
  private toast = inject(ToastService);
  private router = inject(Router);

  menuOpen = signal(false);
  private prevOnline: boolean;

  constructor() {
    this.prevOnline = this.net.online();
    // Reacciona a los cambios de conexion: al reconectar, sube los pendientes solo.
    effect(() => {
      const on = this.net.online();
      if (on && this.prevOnline === false) {
        this.toast.show('Conexion restablecida', 'ok');
        this.api.refresh().then(() => this.api.updatePending());
        this.auth.refreshMe().catch(() => {});
      } else if (!on && this.prevOnline === true) {
        this.toast.show('Trabajando sin conexion', 'info');
      }
      this.prevOnline = on;
    });
  }

  ngOnInit() {
    this.api.updatePending();
    this.api.refresh().then(() => this.api.updatePending());
    if (this.net.online()) this.auth.refreshMe().catch(() => { /* el interceptor maneja 401 */ });
  }

  toggleMenu(v?: boolean) { this.menuOpen.set(v ?? !this.menuOpen()); }

  sync() {
    if (!this.net.online()) { this.toast.show('Sin conexion: se sincronizara al reconectar', 'info'); return; }
    this.toast.show('Sincronizando...', 'info');
    this.api.refresh().then((r) => {
      this.api.updatePending();
      this.toast.show(r.offline ? 'No se pudo sincronizar. Revisa el servidor.' : 'Sincronizado', r.offline ? 'error' : 'ok');
    });
  }

  logout() {
    this.auth.clearSession();
    this.api.clearAll().catch(() => {});
    this.toggleMenu(false);
    this.toast.show('Sesion cerrada', 'info');
    this.router.navigateByUrl('/login');
  }
}
