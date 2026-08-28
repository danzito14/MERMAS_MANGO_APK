import { Injectable } from '@angular/core';

/** Variables de :root que definen el color principal de la app (styles.scss). */
const TOKENS = [
  '--green', '--green-dark', '--green-strong', '--green-600', '--green-700',
  '--green-soft', '--green-soft-2', '--grad', '--glow', '--ring', '--topbar-shadow',
];

/**
 * Contraste minimo del texto blanco sobre el color: por debajo de esto el
 * color se oscurece hasta que la barra superior y los botones se leen.
 */
const CONTRASTE_MINIMO = 3.6;

/** El verde de la marca, para volver a el al salir de la sesion. */
const VERDE_MARCA = '#0f5c2b';

interface Rgb { r: number; g: number; b: number; }

/**
 * Repinta la app con el color del producto que se esta capturando.
 *
 * Todo el verde de la interfaz sale de un punado de variables CSS, asi que
 * basta con sobreescribirlas en <html> para que cambien la barra superior, los
 * botones, los acentos y las listas de una sola vez, sin tocar componentes.
 */
@Injectable({ providedIn: 'root' })
export class TemaService {
  private aplicado: string | null = null;

  /** Pinta la app con ese color (hex #RRGGBB). null vuelve al verde de la marca. */
  aplicar(color: string | null | undefined): void {
    const hex = (color || '').trim().toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(hex)) { this.restaurar(); return; }
    if (this.aplicado === hex) return;
    this.aplicado = hex;

    // El texto de la barra y de los botones es blanco fijo: si el producto es
    // claro (un amarillo, por ejemplo) se oscurece hasta que se lea bien.
    const base = this.legibleConTextoBlanco(this.aRgb(hex));
    const estilo = document.documentElement.style;
    const set = (token: string, valor: string) => estilo.setProperty(token, valor);

    set('--green', this.aHex(base));
    set('--green-strong', this.aHex(base));
    set('--green-600', this.aHex(this.oscurecer(base, 0.88)));
    set('--green-700', this.aHex(this.oscurecer(base, 0.78)));
    set('--green-dark', this.aHex(this.oscurecer(base, 0.7)));
    set('--green-soft', this.aHex(this.aclarar(base, 0.88)));
    set('--green-soft-2', this.aHex(this.aclarar(base, 0.94)));
    set('--grad', 'linear-gradient(100deg, ' + this.aHex(this.oscurecer(base, 1.12)) + ' 0%, '
      + this.aHex(base) + ' 55%, ' + this.aHex(this.oscurecer(base, 0.78)) + ' 100%)');
    set('--glow', this.aRgba(base, 0.28));
    set('--ring', this.aRgba(base, 0.18));
    set('--topbar-shadow', this.aRgba(this.oscurecer(base, 0.7), 0.25));
    // La barra de estado del telefono (y la del navegador) van con el mismo color.
    this.metaColor(this.aHex(this.oscurecer(base, 0.7)));
  }

  /** Quita el color del producto: la app vuelve a su verde. */
  restaurar(): void {
    if (this.aplicado === null) return;
    this.aplicado = null;
    const estilo = document.documentElement.style;
    TOKENS.forEach((t) => estilo.removeProperty(t));
    this.metaColor(VERDE_MARCA);
  }

  private metaColor(hex: string): void {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', hex);
  }

  // ---- color ----
  private aRgb(hex: string): Rgb {
    const n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  private aHex(c: Rgb): string {
    const dos = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
    return '#' + dos(c.r) + dos(c.g) + dos(c.b);
  }

  private aRgba(c: Rgb, alfa: number): string {
    return 'rgba(' + Math.round(c.r) + ', ' + Math.round(c.g) + ', ' + Math.round(c.b) + ', ' + alfa + ')';
  }

  /** factor < 1 oscurece, > 1 aclara. */
  private oscurecer(c: Rgb, factor: number): Rgb {
    return { r: c.r * factor, g: c.g * factor, b: c.b * factor };
  }

  /** Mezcla con blanco: proporcion 0.9 = 90% blanco (fondos suaves). */
  private aclarar(c: Rgb, proporcion: number): Rgb {
    const m = (v: number) => v + (255 - v) * proporcion;
    return { r: m(c.r), g: m(c.g), b: m(c.b) };
  }

  /** Luminancia relativa (WCAG). */
  private luminancia(c: Rgb): number {
    const canal = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * canal(c.r) + 0.7152 * canal(c.g) + 0.0722 * canal(c.b);
  }

  private contrasteConBlanco(c: Rgb): number {
    return 1.05 / (this.luminancia(c) + 0.05);
  }

  /** Oscurece el color lo justo para que el texto blanco encima siga leyendose. */
  private legibleConTextoBlanco(c: Rgb): Rgb {
    let actual = c;
    // Cada vuelta baja un 6%; con 30 vueltas cualquier color llega al minimo.
    for (let i = 0; i < 30 && this.contrasteConBlanco(actual) < CONTRASTE_MINIMO; i++) {
      actual = this.oscurecer(actual, 0.94);
    }
    return actual;
  }
}
