import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { ApiService } from '../core/api.service';
import { NetworkService } from '../core/network.service';
import { ToastService } from '../core/toast.service';
import { CatalogoService } from '../core/catalogo.service';
import { TemaService } from '../core/tema.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="topbar">
      <div class="topbar__left">
        <button class="iconbtn" type="button" (click)="toggleMenu()" aria-label="Menu"><i class="fa-solid fa-bars" aria-hidden="true"></i></button>
        <div class="topbar__brand">
          <img [src]="logo()" (error)="fallaLogo()" alt="" class="topbar__logo" width="32" height="32" />
          <span class="topbar__title">{{ titulo() }}</span>
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
        <a class="navitem" routerLink="/informe" routerLinkActive="is-active" (click)="toggleMenu(false)"><i class="fa-solid fa-chart-column" aria-hidden="true"></i><span>Informe diario</span></a>
        <a class="navitem" routerLink="/reporte" routerLinkActive="is-active" (click)="toggleMenu(false)"><i class="fa-solid fa-table" aria-hidden="true"></i><span>Reporte por lote</span></a>
        @if (auth.canCatalogos()) {
          <a class="navitem" routerLink="/catalogos" routerLinkActive="is-active" (click)="toggleMenu(false)"><i class="fa-solid fa-seedling" aria-hidden="true"></i><span>Catalogos</span></a>
        }
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
  cat = inject(CatalogoService);
  private tema = inject(TemaService);
  private toast = inject(ToastService);
  private router = inject(Router);

  menuOpen = signal(false);

  /**
   * "MERMAS MANGO", "MERMAS CALABAZA"... segun el producto en uso. Viendo todos
   * los productos queda solo "MERMAS"; con un backend sin productos, "MERMAS MANGO".
   */
  titulo = computed(() => {
    const nombre = this.cat.nombreProductoActivo();
    if (nombre) return 'MERMAS ' + nombre.toUpperCase();
    const hayProductos = this.cat.soportaProductos() && this.cat.productos().length > 0;
    return hayProductos ? 'MERMAS' : 'MERMAS MANGO';
  });

  /** Imagenes que no cargaron (sin conexion o archivo borrado): se usa el icono de la app. */
  private logoRoto = signal<string | null>(null);

  /** El logo de la barra es la imagen del producto; si no tiene o falla, el de la app. */
  logo = computed(() => {
    const url = this.cat.urlImagen(this.cat.itemProductoActivo());
    return url && url !== this.logoRoto() ? url : 'icons/icon-96.png';
  });

  private prevOnline: boolean;

  constructor() {
    // El color del producto repinta la app entera: que se note cuando se cambia.
    effect(() => this.tema.aplicar(this.cat.itemProductoActivo()?.color));

    this.prevOnline = this.net.online();
    // Reacciona a los cambios de conexion: al reconectar, sube los pendientes solo.
    effect(() => {
      const on = this.net.online();
      if (on && this.prevOnline === false) {
        this.toast.show('Conexion restablecida', 'ok');
        this.api.refresh().then(() => this.api.updatePending());
        this.auth.refreshMe().catch(() => {});
        this.cat.cargarTodos().catch(() => {});
      } else if (!on && this.prevOnline === true) {
        this.toast.show('Trabajando sin conexion', 'info');
      }
      this.prevOnline = on;
    });
  }

  ngOnInit() {
    this.api.updatePending();
    this.api.refresh().then(() => this.api.updatePending());
    this.cat.cargarTodos().catch(() => { /* offline: usa la cache local */ });
    if (this.net.online()) this.auth.refreshMe().catch(() => { /* el interceptor maneja 401 */ });
  }

  toggleMenu(v?: boolean) { this.menuOpen.set(v ?? !this.menuOpen()); }

  fallaLogo() { this.logoRoto.set(this.cat.urlImagen(this.cat.itemProductoActivo())); }

  sync() {
    if (!this.net.online()) { this.toast.show('Sin conexion: se sincronizara al reconectar', 'info'); return; }
    this.toast.show('Sincronizando...', 'info');
    this.api.refresh().then((r) => {
      this.api.updatePending();
      this.toast.show(r.offline ? 'No se pudo sincronizar. Revisa el servidor.' : 'Sincronizado', r.offline ? 'error' : 'ok');
    });
  }

  logout() {
    this.tema.restaurar();          // el login vuelve al verde de la marca
    this.auth.clearSession();
    this.api.clearAll().catch(() => {});
    this.toggleMenu(false);
    this.toast.show('Sesion cerrada', 'info');
    this.router.navigateByUrl('/login');
  }
}
