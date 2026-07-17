import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';
import { provideServiceWorker } from '@angular/service-worker';

// True cuando la app corre dentro del APK (Capacitor), no en un navegador.
function inCapacitor(): boolean {
  const cap = (globalThis as any).Capacitor;
  return !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideServiceWorker('ngsw-worker.js', {
      // Solo en la web (PWA). En el APK, Capacitor ya sirve los archivos localmente,
      // y el service worker rompe el arranque (pantalla en blanco / se cierra).
      enabled: !isDevMode() && !inCapacitor(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
