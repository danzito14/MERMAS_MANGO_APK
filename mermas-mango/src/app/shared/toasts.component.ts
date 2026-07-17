import { Component, inject } from '@angular/core';
import { ToastService } from '../core/toast.service';

@Component({
  selector: 'app-toasts',
  standalone: true,
  template: `
    <div class="toasts" aria-live="polite">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast toast--{{ t.kind }}">
          <i class="fa-solid"
             [class.fa-circle-check]="t.kind === 'ok'"
             [class.fa-circle-exclamation]="t.kind === 'error'"
             [class.fa-circle-info]="t.kind === 'info'" aria-hidden="true"></i>
          <span>{{ t.msg }}</span>
        </div>
      }
    </div>
  `,
})
export class ToastsComponent {
  toast = inject(ToastService);
}
