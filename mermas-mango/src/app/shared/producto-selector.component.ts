import { Component, Input, computed, inject } from '@angular/core';
import { CatalogoService } from '../core/catalogo.service';

/**
 * Selector del producto en uso, para las pantallas de consulta.
 *
 * No es un filtro local: cambia el producto de TODA la app (el color, el logo
 * y el titulo de la barra), ademas de acotar lo que muestra la pantalla. Asi
 * el producto que se esta viendo es siempre el mismo en todos lados.
 */
@Component({
  selector: 'app-producto-selector',
  standalone: true,
  template: `
    @if (visible()) {
      <div class="field">
        <label>PRODUCTO</label>
        <div class="segmented segmented--mini" role="group" aria-label="Producto">
          @if (conTodos) {
            <button type="button" class="seg seg--mini" [class.is-active]="cat.productoActivo() === null" (click)="elegir(null)">
              Todos
            </button>
          }
          @for (p of productos(); track p.id) {
            <button type="button" class="seg seg--mini" [class.is-active]="cat.productoActivo() === p.id" (click)="elegir(p.id)">
              {{ p.nombre }}
            </button>
          }
        </div>
      </div>
    }
  `,
})
export class ProductoSelectorComponent {
  cat = inject(CatalogoService);

  /** Deja elegir "Todos" (sin filtrar). En la captura hay que elegir uno concreto. */
  @Input() conTodos = true;

  productos = computed(() => this.cat.productos().filter((p) => p.activo));
  visible = computed(() => this.cat.soportaProductos() && this.productos().length > 0);

  elegir(id: number | null) {
    if (this.cat.productoActivo() === id) return;
    this.cat.setProductoPreferido(id);
  }
}
