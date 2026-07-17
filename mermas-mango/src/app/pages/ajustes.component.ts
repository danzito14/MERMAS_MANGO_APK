import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { ConfigService } from '../core/config.service';
import { ToastService } from '../core/toast.service';
import { formatFecha } from '../core/util';

@Component({
  selector: 'app-ajustes',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page-head">
      <div>
        <h2 class="page-title">Ajustes</h2>
        <p class="page-sub">Configura el servidor y los datos sin conexion.</p>
      </div>
    </div>

    <div class="card form">
      <h3 class="card__title"><i class="fa-solid fa-server" aria-hidden="true"></i> Servidor (API)</h3>
      <div class="field">
        <label for="a_api">URL DEL SERVIDOR</label>
        <input id="a_api" type="url" name="api" [(ngModel)]="apiUrl" placeholder="https://mermasmango.slagricola.cloud" autocomplete="off" />
        <small class="hint">Direccion donde corre la API (por defecto https://mermasmango.slagricola.cloud). Sin barra final ni ruta.</small>
      </div>
      <div class="form__actions">
        <button class="btn btn--primary" type="button" (click)="guardar()"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Guardar</button>
        <button class="btn btn--ghost" type="button" (click)="probar()"><i class="fa-solid fa-plug" aria-hidden="true"></i> Probar conexion</button>
      </div>
      @if (estado()) { <div class="conn-state" [class.ok]="estadoOk()" [class.fail]="estadoOk() === false" [innerHTML]="estado()"></div> }
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
  private cfg = inject(ConfigService);
  private api = inject(ApiService);
  private toast = inject(ToastService);

  apiUrl = '';
  estado = signal('');
  estadoOk = signal<boolean | null>(null);
  offlineInfo = signal('Los registros se guardan en el dispositivo para consultarlos sin internet.');
  confirmVaciar = signal(false);

  ngOnInit() {
    this.apiUrl = this.cfg.apiBase;
    this.refreshInfo();
  }

  guardar() {
    this.cfg.setApiBase(this.apiUrl.trim());
    this.apiUrl = this.cfg.apiBase;
    this.toast.show('Servidor guardado', 'ok');
    this.sincronizar();
  }

  async probar() {
    this.cfg.setApiBase(this.apiUrl.trim());
    this.estado.set('Probando...');
    this.estadoOk.set(null);
    const ok = await this.api.ping();
    this.estadoOk.set(ok);
    this.estado.set(ok
      ? '<i class="fa-solid fa-circle-check"></i> Conexion correcta con el servidor.'
      : '<i class="fa-solid fa-circle-xmark"></i> No se pudo conectar. Verifica la URL y que el servidor este encendido.');
  }

  async sincronizar() {
    if (!navigator.onLine) { this.toast.show('Sin conexion: se sincronizara al reconectar', 'info'); return; }
    this.toast.show('Sincronizando...', 'info');
    const r = await this.api.refresh();
    await this.api.updatePending();
    this.toast.show(r.offline ? 'No se pudo sincronizar. Revisa el servidor.' : 'Sincronizado', r.offline ? 'error' : 'ok');
    this.refreshInfo();
  }

  async vaciar() {
    this.confirmVaciar.set(false);
    await this.api.clearAll();
    this.toast.show('Cache local vaciada', 'ok');
    this.refreshInfo();
    if (navigator.onLine) this.sincronizar();
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
