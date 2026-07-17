import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  msg: string;
  kind: 'ok' | 'error' | 'info';
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private seq = 0;

  show(msg: string, kind: Toast['kind'] = 'ok'): void {
    const id = ++this.seq;
    this.toasts.update((t) => [...t, { id, msg, kind }]);
    setTimeout(() => this.toasts.update((t) => t.filter((x) => x.id !== id)), 3200);
  }
}
