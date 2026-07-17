import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { NetworkService } from '../core/network.service';
import { ToastService } from '../core/toast.service';
import { formatFecha } from '../core/util';

@Component({
  selector: 'app-ajustes',
  standalone: true,
  template: `
    <div class="page-head">
      <div>
        <h2 class="page-title">Ajustes</h2>
        <p class="page-sub">Datos guardados en el dispositivo.</p>
      </div>
    </div>

    <div class="card form">
      <h3 class="card__title"><i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i> Datos sin conexion</h3>
      <p class="muted">{{ offlineInfo() }}</p>
      <div class="form__actions">
        <button class="btn btn--primary" type="button" (click)="sincronizar()"><i class="fa-solid fa-rotate" aria-hidden="true"></i> Sincronizar ahora</button>
        <button class="btn btn--danger-ghost" type="button" (click)="confirmVaciar.set(true)"><i class="fa-solid fa-trash-can" aria-hidden="true"></i> Vaciar cache local</button>
      </div>
    </div>

    @if (confirmVaciar()) {
      <div class="overlay" (click)="confirmVaciar.set(false)"></div>
      <div class="confirm">
        <h3 class="confirm__title"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Vaciar cache</h3>
        <p class="confirm__msg">Se borraran los datos guardados en el dispositivo. Los cambios pendientes sin enviar se perderan.</p>
        <div class="confirm__actions">
          <button class="btn btn--ghost" type="button" (click)="confirmVaciar.set(false)">Cancelar</button>
          <button class="btn btn--danger" type="button" (click)="vaciar()">Vaciar</button>
        </div>
      </div>
    }
  `,
})
export class AjustesComponent implements OnInit {
  private api = inject(ApiService);
  private net = inject(NetworkService);
  private toast = inject(ToastService);

  offlineInfo = signal('Los registros se guardan en el dispositivo para consultarlos sin internet.');
  confirmVaciar = signal(false);

  ngOnInit() { this.refreshInfo(); }

  async sincronizar() {
    if (!this.net.online()) { this.toast.show('Sin conexion: se sincronizara al reconectar', 'info'); return; }
    this.toast.show('Sincronizando...', 'info');
    const r = await this.api.refresh();
    await this.api.updatePending();
    this.toast.show(r.offline ? 'No se pudo sincronizar. Revisa la conexion.' : 'Sincronizado', r.offline ? 'error' : 'ok');
    this.refreshInfo();
  }

  async vaciar() {
    this.confirmVaciar.set(false);
    await this.api.clearAll();
    this.toast.show('Cache local vaciada', 'ok');
    this.refreshInfo();
    if (this.net.online()) this.sincronizar();
  }

  private async refreshInfo() {
    const ls = await this.api.lastSync();
    const n = await this.api.updatePending();
    this.offlineInfo.set(
      'Los registros se guardan en el dispositivo para consultarlos sin internet.' +
      (ls ? ' Ultima sincronizacion: ' + formatFecha(ls) + '.' : '') +
      (n > 0 ? ' Hay ' + n + ' cambio(s) pendiente(s) de enviar.' : ''),
    );
  }
}
