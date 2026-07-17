export type TipoMerma = 'aprovechable' | 'cascara_hueso';
export type Rol = 'admin' | 'capturista' | 'reportes' | '';

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

export interface InformeLote {
  lote: string;
  total_aprovechable: string;
  total_cascara_hueso: string;
  total_general: string;
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
}

/** Forma uniforme de error usada en toda la app. */
export interface ApiError {
  network?: boolean;
  status?: number;
  detail?: any;
}
