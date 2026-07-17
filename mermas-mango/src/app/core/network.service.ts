import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Network } from '@capacitor/network';

/**
 * Estado de conexion. Usa el plugin nativo @capacitor/network, que en el APK
 * detecta la red de forma fiable (navigator.onLine no funciona bien en el WebView).
 * En la web, el plugin usa su implementacion de navegador.
 */
@Injectable({ providedIn: 'root' })
export class NetworkService {
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly online = signal<boolean>(true);

  constructor() {
    if (!this.isBrowser) return;
    try {
      this.online.set(navigator.onLine);
      Network.getStatus().then((s) => this.online.set(s.connected)).catch(() => {});
      Network.addListener('networkStatusChange', (s) => this.online.set(s.connected));
    } catch {
      // Fallback por si el plugin no esta disponible.
      this.online.set(navigator.onLine);
      window.addEventListener('online', () => this.online.set(true));
      window.addEventListener('offline', () => this.online.set(false));
    }
  }
}
