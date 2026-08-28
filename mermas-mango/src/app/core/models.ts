export type Rol = 'admin' | 'supervisor' | 'capturista' | 'reportes' | '';

/**
 * El tipo de merma dejo de ser un enum fijo: ahora es el catalogo /tipos-merma,
 * y la bandera `aprovechable` (no el nombre) decide de que lado cae en los reportes.
 * Ids negativos = tipos sinteticos para hablar con el backend anterior, que
 * todavia espera tipo_merma: 'aprovechable' | 'cascara_hueso'.
 */
export const TIPO_LEGACY_APROVECHABLE = -1;
export const TIPO_LEGACY_RESIDUO = -2;

/** Unidad de los reportes: el sistema captura y guarda siempre en kg; lb solo convierte al mostrar. */
export type Unidad = 'kg' | 'lb';

/** Catalogos editables del backend (el valor es la ruta: /productos, /tipos-merma, ...). */
export type CatalogoTipo = 'productos' | 'tipos-merma' | 'variedades' | 'caracteristicas';

/** Item de catalogo ya normalizado (la API puede usar id_producto / id_variedad / id_caracteristica). */
export interface CatalogoItem {
  id: number;
  nombre: string;
  activo: boolean;
  /** variedades: producto dueno (obligatorio). caracteristicas: null = aplica a todos los productos. */
  id_producto?: number | null;
  /** Solo productos: nombre del tipo de merma no aprovechable que se le crea al darlo de alta. */
  etiqueta_no_aprovechable?: string;
  /** Solo tipos-merma: true = se aprovecha, false = residuo. */
  aprovechable?: boolean;
  /** Solo productos: color hex (#RRGGBB) con el que el front lo distingue. Nunca null. */
  color?: string;
  /** Solo productos: ruta relativa de su imagen ("/static/productos/1-ab12.png"), o null. */
  imagen_url?: string | null;
}

/** Cuanto se acumulo de un tipo de merma concreto (desglose de informes y reportes). */
export interface TotalPorTipo {
  id_tipo_merma: number;
  tipo_merma: string;
  aprovechable: boolean;
  cant: string;
}

/** Registro tal como lo devuelve la API. */
export interface RegistroMermaOut {
  id_registro: number;
  cant_kg: string;          // decimal como texto: "12.50"
  id_tipo_merma?: number | null;
  tipo_merma: string;       // nombre resuelto: "Cascara/Hueso" (el backend anterior mandaba el enum)
  aprovechable?: boolean;
  lote: string;
  linea_prod: string;
  fecha_hora: string;       // ISO 8601
  id_usuario?: number | null;
  registrado_por?: string | null;  // username de quien registro
  id_producto?: number | null;
  producto?: string | null;
  id_variedad?: number | null;
  variedad?: string | null;
  id_caracteristica?: number | null;
  caracteristica?: string | null;
}

/** Registro guardado en la cache local (IndexedDB). */
export interface LocalRegistro {
  _key: string;             // "srv-<id>" o "loc-<uuid>"
  _pending: boolean;
  _op: 'create' | 'update' | null;
  _deleted: boolean;
  id_registro: number | null;
  cant_kg: string;
  id_tipo_merma: number | null;
  tipo_merma: string;       // nombre para mostrar
  aprovechable: boolean;    // lo que decide de que lado suma
  lote: string;
  linea_prod: string;
  fecha_hora: string;
  id_usuario?: number | null;
  registrado_por?: string | null;
  id_producto?: number | null;
  producto?: string | null;
  id_variedad?: number | null;
  variedad?: string | null;
  id_caracteristica?: number | null;
  caracteristica?: string | null;
}

/** Entrada de la cola de cambios pendientes de enviar. */
export interface OutboxEntry {
  id?: number;
  type: 'create' | 'update' | 'delete';
  key: string;
  serverId: number | null;
  payload: any;
  createdAt: string;
}

/** Fila del informe, agrupado por dia (fecha). */
export interface InformeDia {
  fecha: string;   // YYYY-MM-DD
  unidad?: Unidad;
  total_aprovechable: string;
  total_no_aprovechable: string;   // antes se llamaba total_cascara_hueso
  total_general: string;
  num_registros: number;
  por_tipo?: TotalPorTipo[];       // desglose del dia por cada tipo capturado
}

/** Fila del reporte, agrupada por lote + linea (un lote en 3 lineas son 3 filas). */
export interface ReporteLoteFila {
  producto?: string | null;   // el backend agrupa por producto + lote + linea
  id_producto?: number | null;
  lote: string;
  linea_prod: string;         // una sola linea por fila (antes era el array "lineas")
  variedades?: string[];
  caracteristicas?: string[];
  rezaga_aprovechable: string;    // suma de los tipos con aprovechable = true
  rezaga_no_aprovechable: string; // suma de los tipos con aprovechable = false
  total_rezaga: string;
  num_registros: number;
  por_tipo?: TotalPorTipo[];      // desglose de esa fila por cada tipo
}

/** Reporte por lote en un rango de fechas, con la fila de totales. */
export interface ReporteLote {
  desde: string | null;
  hasta: string | null;
  id_producto?: number | null;
  unidad?: Unidad;            // lo que devolvio el backend ('kg' por defecto)
  lotes: ReporteLoteFila[];
  total_aprovechable: string;
  total_no_aprovechable: string;
  total_rezaga: string;
  num_registros: number;
}

export interface UsuarioOut {
  id_usuario: number;
  username: string;
  rol: Rol;
  activo: boolean;
}

export interface MermaInput {
  cant_kg: number | string;
  id_tipo_merma?: number | null;
  lote: string;
  linea_prod: string;
  fecha_hora?: string;
  id_producto?: number | null;
  id_variedad?: number | null;
  id_caracteristica?: number | null;
}

/** Forma uniforme de error usada en toda la app. */
export interface ApiError {
  network?: boolean;
  status?: number;
  detail?: any;
}
