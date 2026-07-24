export type TipoMerma = 'aprovechable' | 'cascara_hueso';
export type Rol = 'admin' | 'supervisor' | 'capturista' | 'reportes' | '';

/** Unidad de los reportes: el sistema captura y guarda siempre en kg; lb solo convierte al mostrar. */
export type Unidad = 'kg' | 'lb';

/** Catalogos editables del backend: /variedades y /caracteristicas. */
export type CatalogoTipo = 'variedades' | 'caracteristicas';

/** Item de catalogo ya normalizado (la API puede usar id_variedad / id_caracteristica). */
export interface CatalogoItem {
  id: number;
  nombre: string;
  activo: boolean;
}

/** Registro tal como lo devuelve la API. */
export interface RegistroMermaOut {
  id_registro: number;
  cant_kg: string;          // decimal como texto: "12.50"
  tipo_merma: TipoMerma;
  lote: string;
  linea_prod: string;
  fecha_hora: string;       // ISO 8601
  id_usuario?: number | null;
  registrado_por?: string | null;  // username de quien registro
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
  tipo_merma: TipoMerma;
  lote: string;
  linea_prod: string;
  fecha_hora: string;
  id_usuario?: number | null;
  registrado_por?: string | null;
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
  total_cascara_hueso: string;
  total_general: string;
  num_registros: number;
}

/** Fila del reporte, agrupada por lote + linea (un lote en 3 lineas son 3 filas). */
export interface ReporteLoteFila {
  lote: string;
  linea_prod: string;         // una sola linea por fila (antes era el array "lineas")
  variedades?: string[];
  caracteristicas?: string[];
  rezaga_aprovechable: string;
  rezaga_no_aprovechable: string;
  total_rezaga: string;
  num_registros: number;
}

/** Reporte por lote en un rango de fechas, con la fila de totales. */
export interface ReporteLote {
  desde: string | null;
  hasta: string | null;
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
  tipo_merma: TipoMerma;
  lote: string;
  linea_prod: string;
  fecha_hora?: string;
  id_variedad?: number | null;
  id_caracteristica?: number | null;
}

/** Forma uniforme de error usada en toda la app. */
export interface ApiError {
  network?: boolean;
  status?: number;
  detail?: any;
}
