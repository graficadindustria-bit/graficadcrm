// Tipos escritos a mano según las columnas de database/instalar.sql.

export type EstadoLinea = 'conectando' | 'activo' | 'desconectado';
export type EstadoConversacion = 'abierto' | 'pendiente' | 'cerrado';
export type TipoMensaje = 'texto' | 'imagen' | 'pdf' | 'audio' | 'documento';
export type Remitente = 'cliente' | 'agente';
// WhatsApp puede aceptar el envío y rechazar la entrega después, de forma
// asíncrona (ack de error) — ver server/src/whatsapp/entrega.ts.
export type EstadoEntregaMensaje = 'enviado' | 'error';
export type RolUsuario = 'dueno' | 'supervisor' | 'vendedor' | 'atendedor_online';

// Nota: son `type`, no `interface`. Un `interface` no se considera compatible
// con el índice `Record<string, unknown>` que pide el generic de supabase-js
// (por el declaration merging), y la consulta terminaría tipando como `never`.

export type EmpresaRow = {
  id: string;
  nombre: string;
  color_primario: string | null;
  color_acento: string | null;
  logo_url: string | null;
  cierre_auto_horas: number | null;
};

export type LineaWhatsappRow = {
  id: string;
  empresa_id: string;
  nombre: string;
  numero: string | null;
  estado: EstadoLinea;
};

export type UsuarioRow = {
  id: string;
  empresa_id: string;
  nombre: string;
  rol: RolUsuario;
  linea_id: string | null;
  zona_horaria?: string | null;
};

export type MensajeProgramadoRow = {
  id: string;
  conversacion_id: string;
  linea_id: string;
  telefono: string;
  contenido: string;
  tipo: TipoMensaje;
  media_url: string | null;
  mimetype: string | null;
  enviar_en: string;
  estado: 'pendiente' | 'enviando' | 'enviado' | 'cancelado' | 'error';
  cancelar_si_responde: boolean;
  motivo: string | null;
  creado_por: string | null;
  creado_en: string;
  enviado_en: string | null;
};

export type ConversacionRow = {
  id: string;
  linea_id: string;
  contacto_telefono: string;
  contacto_nombre: string | null;
  estado: EstadoConversacion;
  ultima_actividad: string;
};

export type MensajeRow = {
  id: string;
  conversacion_id: string;
  remitente: Remitente;
  agente_id: string | null;
  tipo: TipoMensaje;
  contenido: string | null;
  media_url: string | null;
  creado_en: string;
  whatsapp_id: string | null;
  estado_entrega: EstadoEntregaMensaje;
  error_entrega: string | null;
};

export type ContactoRow = {
  id: string;
  empresa_id: string;
  telefono: string;
  nombre?: string | null;
  origen?: string | null;
  lid: string | null;
};

export type EtiquetaWhatsappRow = {
  id: string;
  linea_id: string;
  whatsapp_id: string;
  nombre: string;
  color: number | null;
  eliminada: boolean;
  actualizado_en: string;
};

type TableDef<Row extends Record<string, unknown>> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export type ContactoEtiquetaRow = {
  contacto_id: string;
  etiqueta_id: string;
};

// Un paso de la respuesta automática: se mandan en orden, uno detrás de
// otro, cuando la regla matchea — ver server/src/whatsapp/bot-automatico.ts.
// Un paso 'espera' no manda nada: solo pausa antes de seguir con el
// siguiente (`duracion_segundos`, en vez de `contenido`/`media_url`).
export type PasoRespuestaAutomatica = {
  tipo: 'texto' | 'imagen' | 'pdf' | 'espera';
  contenido: string | null;
  media_url: string | null;
  duracion_segundos?: number | null;
};

// Un flujo de respuesta automática: grafo de nodos y conexiones (ver
// whatsapp/flujo.ts y database/instalar.sql).
export type OpcionPregunta = { id: string; etiqueta: string; palabras: string[] };
export type NodoFlujo = {
  id: string;
  type: 'inicio' | 'texto' | 'imagen' | 'pdf' | 'espera' | 'pregunta' | 'fin';
  position?: { x: number; y: number };
  data: {
    contenido?: string | null;
    media_url?: string | null;
    duracion_segundos?: number | null;
    opciones?: OpcionPregunta[];
  };
};
export type ConexionFlujo = { id: string; source: string; target: string; sourceHandle?: string | null };
export type FlujoBot = { nodes: NodoFlujo[]; edges: ConexionFlujo[] };

export type BotSesionRow = {
  conversacion_id: string;
  regla_id: string;
  nodo_id: string;
  linea_id: string;
  telefono: string;
  actualizado_en: string;
};

export type RespuestaAutomaticaRow = {
  id: string;
  empresa_id: string;
  tipo: 'rapida' | 'flujo';
  nombre: string | null;
  flujo: FlujoBot | null;
  palabra_clave: string;
  palabras_clave: string[];
  modo_coincidencia: 'contiene' | 'exacta' | 'empieza_con';
  tolerancia_errores: boolean;
  disparador: 'palabra_clave' | 'primer_mensaje' | 'primer_mensaje_del_dia' | 'cualquier_mensaje';
  pasos: PasoRespuestaAutomatica[];
  demora_segundos: number;
  activo: boolean;
};

export type Database = {
  public: {
    Tables: {
      empresas: TableDef<EmpresaRow>;
      lineas_whatsapp: TableDef<LineaWhatsappRow>;
      usuarios: TableDef<UsuarioRow>;
      conversaciones: TableDef<ConversacionRow>;
      mensajes: TableDef<MensajeRow>;
      contactos: TableDef<ContactoRow>;
      etiquetas_whatsapp: TableDef<EtiquetaWhatsappRow>;
      contacto_etiquetas: TableDef<ContactoEtiquetaRow>;
      respuestas_automaticas: TableDef<RespuestaAutomaticaRow>;
      bot_sesiones: TableDef<BotSesionRow>;
      mensajes_programados: TableDef<MensajeProgramadoRow>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
