import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { PALETA_LINEAS } from '../../../lib/tema';
import type { Conversacion, EstadoConversacion, EtiquetaWhatsapp, LineaWhatsapp, Mensaje, Temperatura, Usuario } from '../../../lib/tipos';

export interface UltimoMensaje {
  conversacion_id: string;
  contenido: string | null;
  tipo: Mensaje['tipo'];
  creado_en: string;
  remitente: Mensaje['remitente'];
}

// Datos de venta del contacto que la lista de chats necesita para marcar
// oportunidades (leads calientes) sin abrir la ficha.
export interface ResumenContacto {
  temperatura: Temperatura | null;
  probabilidad_cierre: number | null;
  valor_estimado: number | null;
  producto_interes: string | null;
}

// Un chat es "oportunidad" si el contacto está caliente o con alta
// probabilidad de cierre: son los leads que conviene atender primero.
export function esOportunidad(r: ResumenContacto | undefined): boolean {
  if (!r) return false;
  return r.temperatura === 'caliente' || (r.probabilidad_cierre ?? 0) >= 70;
}

export function useConversaciones(usuario: Usuario | null) {
  const [lineas, setLineas] = useState<LineaWhatsapp[]>([]);
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const [ultimosMensajes, setUltimosMensajes] = useState<Record<string, UltimoMensaje>>({});
  const [etiquetasPorTelefono, setEtiquetasPorTelefono] = useState<Record<string, EtiquetaWhatsapp[]>>({});
  const [pendientes, setPendientes] = useState<Record<string, number>>({});
  // Cuándo escribió el cliente por última vez: WhatsApp solo deja responder
  // con texto libre hasta 24 h después.
  const [ultimoDelCliente, setUltimoDelCliente] = useState<Record<string, string>>({});
  const [contactoPorTelefono, setContactoPorTelefono] = useState<Record<string, ResumenContacto>>({});

  const cargarLineas = useCallback(async () => {
    const { data } = await supabase.from('lineas_whatsapp').select('*').order('nombre').returns<LineaWhatsapp[]>();
    setLineas(data || []);
  }, []);

  const cargarConversaciones = useCallback(async () => {
    if (!usuario) return;
    const { data, error } = await supabase
      .from('conversaciones')
      .select('*')
      .order('ultima_actividad', { ascending: false })
      .returns<Conversacion[]>();
    if (error) {
      console.error(error);
      return;
    }
    setConversaciones(data || []);
    if (data && data.length > 0) {
      // Asegura que cada conversación tenga su ficha de contacto (sin pisar datos ya cargados)
      const filasContacto = data.map((c) => ({ empresa_id: usuario.empresa_id, telefono: c.contacto_telefono, nombre: c.contacto_nombre || null }));
      await supabase.from('contactos').upsert(filasContacto, { onConflict: 'empresa_id,telefono', ignoreDuplicates: true });

      const ids = data.map((c) => c.id);
      const { data: msjs } = await supabase
        .from('mensajes')
        .select('conversacion_id, contenido, tipo, creado_en, remitente')
        .in('conversacion_id', ids)
        .order('creado_en', { ascending: false })
        .returns<UltimoMensaje[]>();
      const ultimos: Record<string, UltimoMensaje> = {};
      // Mensajes del cliente seguidos desde la última respuesta nuestra: es lo
      // que la lista muestra como globo azul (no hay "leído" real en el modelo).
      const cuenta: Record<string, number> = {};
      const cortada = new Set<string>();
      const delCliente: Record<string, string> = {};
      (msjs || []).forEach((m) => {
        if (!ultimos[m.conversacion_id]) ultimos[m.conversacion_id] = m;
        if (m.remitente === 'cliente' && !delCliente[m.conversacion_id]) delCliente[m.conversacion_id] = m.creado_en;
        if (cortada.has(m.conversacion_id)) return;
        if (m.remitente === 'cliente') cuenta[m.conversacion_id] = (cuenta[m.conversacion_id] || 0) + 1;
        else cortada.add(m.conversacion_id);
      });
      setUltimosMensajes(ultimos);
      setPendientes(cuenta);
      setUltimoDelCliente(delCliente);
    }
  }, [usuario]);

  const cargarEtiquetas = useCallback(async () => {
    if (!usuario) return;
    const { data: contactos } = await supabase
      .from('contactos')
      .select('id, telefono, temperatura, probabilidad_cierre, valor_estimado, producto_interes')
      .returns<({ id: string; telefono: string } & ResumenContacto)[]>();
    const telefonoPorContactoId: Record<string, string> = {};
    const resumenes: Record<string, ResumenContacto> = {};
    (contactos || []).forEach((c) => {
      telefonoPorContactoId[c.id] = c.telefono;
      resumenes[c.telefono] = { temperatura: c.temperatura, probabilidad_cierre: c.probabilidad_cierre, valor_estimado: c.valor_estimado, producto_interes: c.producto_interes };
    });
    setContactoPorTelefono(resumenes);

    const { data: asociaciones } = await supabase
      .from('contacto_etiquetas')
      .select('contacto_id, etiquetas_whatsapp(id, nombre, color, eliminada)')
      .returns<{ contacto_id: string; etiquetas_whatsapp: (EtiquetaWhatsapp & { eliminada: boolean }) | null }[]>();

    const mapa: Record<string, EtiquetaWhatsapp[]> = {};
    (asociaciones || []).forEach((a) => {
      if (!a.etiquetas_whatsapp || a.etiquetas_whatsapp.eliminada) return;
      const telefono = telefonoPorContactoId[a.contacto_id];
      if (!telefono) return;
      (mapa[telefono] ||= []).push(a.etiquetas_whatsapp);
    });
    setEtiquetasPorTelefono(mapa);
  }, [usuario]);

  useEffect(() => {
    if (!usuario) return;
    cargarLineas();
    cargarConversaciones();
    cargarEtiquetas();

    const canal = supabase
      .channel(`etiquetas-chats-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacto_etiquetas' }, () => cargarEtiquetas())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'etiquetas_whatsapp' }, () => cargarEtiquetas())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contactos' }, () => cargarEtiquetas())
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.id]);

  const reclamar = async (c: Conversacion) => {
    await supabase.from('conversaciones').update({ agente_asignado_id: usuario!.id }).eq('id', c.id);
  };
  const liberar = async (c: Conversacion) => {
    await supabase.from('conversaciones').update({ agente_asignado_id: null }).eq('id', c.id);
  };
  const transferir = async (c: Conversacion, agenteId: string) => {
    await supabase.from('conversaciones').update({ agente_asignado_id: agenteId }).eq('id', c.id);
  };
  const cambiarEstado = async (c: Conversacion, estado: EstadoConversacion) => {
    await supabase.from('conversaciones').update({ estado }).eq('id', c.id);
  };
  const resolver = (c: Conversacion) => cambiarEstado(c, 'cerrado');

  const colorLinea = (lineaId: string) => {
    const idx = lineas.findIndex((l) => l.id === lineaId);
    return PALETA_LINEAS[idx >= 0 ? idx % PALETA_LINEAS.length : 0];
  };
  const nombreLinea = (lineaId: string) => lineas.find((l) => l.id === lineaId)?.nombre || '';

  return {
    lineas,
    conversaciones,
    ultimosMensajes,
    etiquetasPorTelefono,
    contactoPorTelefono,
    pendientes,
    ultimoDelCliente,
    recargar: cargarConversaciones,
    reclamar,
    liberar,
    transferir,
    cambiarEstado,
    resolver,
    colorLinea,
    nombreLinea,
  };
}
