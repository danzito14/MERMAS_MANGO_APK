import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../core/api.service';
import { ToastService } from '../core/toast.service';
import { ApiError, TipoMerma } from '../core/models';
import { fmtKg } from '../core/util';

type Linea = 'L1' | 'L2' | 'L3' | 'L4';

@Component({
  selector: 'app-captura',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page-head">
      <div>
        <h2 class="page-title">{{ editKey() ? 'Editar merma' : 'Registrar merma' }}</h2>
        <p class="page-sub">Selecciona la linea, escribe el lote y sube la cantidad.</p>
      </div>
    </div>

    <form class="card form form--captura" (ngSubmit)="subir()">
      <div class="field">
        <label>LINEA DE PRODUCCION <span class="req">*</span></label>
        <div class="segmented" role="group" aria-label="Linea de produccion">
          @for (l of lineas; track l) {
            <button type="button" class="seg" [class.is-active]="linea() === l" (click)="linea.set(l)">{{ l }}</button>
          }
        </div>
      </div>

      <div class="field">
        <label for="c_lote">LOTE <span class="req">*</span></label>
        <input id="c_lote" type="text" maxlength="50" name="lote"
               [ngModel]="lote()" (ngModelChange)="onLote($event)"
               placeholder="Ej. 10189P02001" autocomplete="off" spellcheck="false" [class.is-invalid]="!!err()['lote']" />
        <small class="hint">Numero de lote (letras y numeros).</small>
        @if (err()['lote']) { <span class="error">{{ err()['lote'] }}</span> }
      </div>

      <div class="field">
        <label>TIPO DE MERMA <span class="req">*</span></label>
        <div class="segmented segmented--tipo" role="group" aria-label="Tipo de merma">
          <button type="button" class="seg" data-tipo="aprovechable" [class.is-active]="tipo() === 'aprovechable'" (click)="tipo.set('aprovechable')">
            <i class="fa-solid fa-leaf" aria-hidden="true"></i> Aprovechable
          </button>
          <button type="button" class="seg" data-tipo="cascara_hueso" [class.is-active]="tipo() === 'cascara_hueso'" (click)="tipo.set('cascara_hueso')">
            <i class="fa-solid fa-bone" aria-hidden="true"></i> Cascara y Hueso
          </button>
        </div>
      </div>

      <div class="field">
        <label for="c_cant">CANTIDAD (KG) <span class="req">*</span></label>
        <input id="c_cant" type="text" inputmode="decimal" [value]="cant()" (input)="onCant($event)" placeholder="0.00" autocomplete="off" [class.is-invalid]="!!err()['cant_kg']" />
        <small class="hint">No negativos. Hasta 6 decimales.</small>
        @if (err()['cant_kg']) { <span class="error">{{ err()['cant_kg'] }}</span> }
      </div>

      @if (!editKey()) {
        <label class="switch">
          <input type="checkbox" name="keep" [(ngModel)]="keep" />
          <span class="switch__track"><span class="switch__thumb"></span></span>
          <span class="switch__label"><i class="fa-solid fa-thumbtack" aria-hidden="true"></i> Mantener datos del lote para el siguiente registro</span>
        </label>
      }

      <div class="form__actions">
        <button class="btn btn--primary btn--lg" type="submit" [disabled]="submitting()">
          <i class="fa-solid" [class.fa-cloud-arrow-up]="!editKey()" [class.fa-floppy-disk]="editKey()" aria-hidden="true"></i>
          {{ editKey() ? 'Guardar' : 'Subir' }}
        </button>
        @if (editKey()) {
          <button class="btn btn--ghost" type="button" (click)="cancelar()"><i class="fa-solid fa-xmark" aria-hidden="true"></i> Cancelar</button>
        }
      </div>
    </form>
  `,
})
export class CapturaComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly lineas: Linea[] = ['L1', 'L2', 'L3', 'L4'];
  linea = signal<Linea>('L1');
  tipo = signal<TipoMerma>('aprovechable');
  lote = signal('');
  cant = signal('');
  keep = false;
  err = signal<Record<string, string>>({});
  submitting = signal(false);
  editKey = signal<string | null>(null);

  ngOnInit() {
    const key = this.route.snapshot.paramMap.get('key');
    if (key) {
      this.editKey.set(key);
      this.api.getByKey(key).then((r) => {
        if (!r) { this.toast.show('Registro no encontrado', 'error'); this.router.navigateByUrl('/registros'); return; }
        this.linea.set(/^L[1-4]$/.test(r.linea_prod) ? (r.linea_prod as Linea) : 'L1');
        this.tipo.set(r.tipo_merma === 'cascara_hueso' ? 'cascara_hueso' : 'aprovechable');
        this.lote.set(String(r.lote || ''));
        this.cant.set(fmtKg(r.cant_kg));
      });
    }
  }

  onLote(v: string) { this.lote.set(v || ''); }

  /** Deja escribir solo numeros: un punto decimal y maximo 6 decimales. */
  onCant(ev: Event) {
    const el = ev.target as HTMLInputElement;
    let s = (el.value || '').replace(/,/g, '.').replace(/[^\d.]/g, '');
    const i = s.indexOf('.');
    if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '');
    const dot = s.indexOf('.');
    if (dot !== -1) s = s.slice(0, dot + 7); // punto + 6 decimales
    if (el.value !== s) el.value = s;        // corrige el input al instante
    this.cant.set(s);
  }

  cancelar() { this.router.navigateByUrl('/registros'); }

  private validar(): Record<string, string> {
    const e: Record<string, string> = {};
    const raw = this.cant().trim();
    const n = Number(raw);
    if (raw === '') e['cant_kg'] = 'La cantidad es obligatoria.';
    else if (isNaN(n)) e['cant_kg'] = 'Debe ser un numero (usa punto decimal).';
    else if (n < 0) e['cant_kg'] = 'No puede ser negativa.';
    else if (!/^\d+(\.\d{1,6})?$/.test(raw)) e['cant_kg'] = 'Maximo 6 decimales.';

    const lote = this.lote().trim();
    if (!lote) e['lote'] = 'El lote es obligatorio.';
    else if (lote.length > 50) e['lote'] = 'Lote demasiado largo (max 50).';
    return e;
  }

  async subir() {
    const errs = this.validar();
    this.err.set(errs);
    if (Object.keys(errs).length) { this.toast.show('Revisa los campos marcados', 'error'); return; }

    const data = { cant_kg: this.cant().trim(), tipo_merma: this.tipo(), lote: this.lote().trim(), linea_prod: this.linea() };
    const key = this.editKey();
    this.submitting.set(true);
    try {
      const res = key ? await this.api.actualizar(key, data) : await this.api.crear(data);
      this.toast.show(res.queued ? 'Guardado sin conexion (se sincronizara)' : (key ? 'Registro actualizado' : 'Merma registrada'), res.queued ? 'info' : 'ok');
      if (key) { this.router.navigateByUrl('/registros'); return; }
      this.cant.set('');
      if (!this.keep) { this.linea.set('L1'); this.tipo.set('aprovechable'); this.lote.set(''); }
    } catch (e) {
      const err = e as ApiError;
      if (err?.status === 422 && Array.isArray(err.detail)) {
        const m: Record<string, string> = {};
        err.detail.forEach((it: any) => { const c = it.loc && it.loc[it.loc.length - 1]; if (c) m[c] = it.msg; });
        this.err.set(m);
        this.toast.show('El servidor rechazo los datos', 'error');
      } else if (err?.status === 403) this.toast.show('No tienes permiso para esta accion', 'error');
      else if (err?.status === 404) this.toast.show('El registro ya no existe', 'error');
      else this.toast.show('No se pudo guardar', 'error');
    } finally {
      this.submitting.set(false);
    }
  }
}
