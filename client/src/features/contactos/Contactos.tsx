import { useEffect, useMemo, useState } from 'react';
import { Download, MessageCircle, Search, Upload } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { tinte, BORDE, BORDE_FILA, CHIP_LINEA, NAVY, SOMBRA_CARD, TEMPERATURA_STYLE, TEXTO_PRIMARIO, TEXTO_SECUNDARIO, TEXTO_TERCIARIO, colorAvatar, colorEtiquetaWhatsapp } from '../../lib/tema';
import type { Contacto, EtapaVenta, EtiquetaWhatsapp, TipoEtapa } from '../../lib/tipos';
import DetalleLead from './DetalleLead';
import ImportarContactos from './ImportarContactos';
import { ModalWhatsapp } from './EscribirWhatsapp';
import { formatoDuracion, useMetricasRespuesta } from '../../lib/metricasRespuesta';

interface LineaSimple {
  id: string;
  nombre: string;
}

interface ConversacionResumen {
  contacto_telefono: string;
  linea_id: string;
  agente_asignado_id: string | null;
  ultima_actividad: string;
}

interface UsuarioSimple {
  id: string;
  nombre: string;
}

const SEGMENTOS: { id: TipoEtapa; label: string }[] = [
  { id: 'normal', label: 'Leads activos' },
  { id: 'ganada', label: 'Clientes' },
  { id: 'perdida', label: 'Perdidos' },
];

function tiempoRelativo(fecha: string | null): string {
  if (!fecha) return '';
  const ms = Date.now() - new Date(fecha).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} d`;
}

function descargarCsv(
  contactos: Contacto[],
  nombreLinea: (id: string | null) => string,
  lineaDeContacto: Record<string, string>,
  etiquetasDeContacto: Record<string, EtiquetaWhatsapp[]>,
) {
  const filas = [
    ['Nombre', 'Teléfono', 'Línea', 'Producto de interés', 'Origen', 'Estado', 'Etiquetas de WhatsApp'],
    ...contactos.map((c) => [
      c.nombre || '',
      c.telefono,
      nombreLinea(lineaDeContacto[c.telefono] ?? null),
      c.producto_interes || '',
      c.origen || '',
      c.temperatura ? TEMPERATURA_STYLE[c.temperatura].label : '',
      (etiquetasDeContacto[c.id] || []).map((e) => e.nombre).join(' | '),
    ]),
  ];
  const csv = filas.map((fila) => fila.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `contactos-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Contactos({ onAbrirChat }: { onAbrirChat?: (telefono: string) => void }) {
  const { usuario } = useAuth();
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [lineas, setLineas] = useState<LineaSimple[]>([]);
  const [conversacionPorTelefono, setConversacionPorTelefono] = useState<Record<string, ConversacionResumen>>({});
  const [usuarios, setUsuarios] = useState<UsuarioSimple[]>([]);
  const [etapas, setEtapas] = useState<EtapaVenta[]>([]);
  const [etiquetasCatalogo, setEtiquetasCatalogo] = useState<EtiquetaWhatsapp[]>([]);
  const [etiquetasDeContacto, setEtiquetasDeContacto] = useState<Record<string, EtiquetaWhatsapp[]>>({});
  const [busqueda, setBusqueda] = useState('');
  const [segmento, setSegmento] = useState<TipoEtapa | 'todos'>('todos');
  const [lineaFiltro, setLineaFiltro] = useState('todas');
  const [etiquetaFiltro, setEtiquetaFiltro] = useState('todas');
  const [telefonoAbierto, setTelefonoAbierto] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [escribiendoA, setEscribiendoA] = useState<Contacto | null>(null);
  const [periodo, setPeriodo] = useState<'todos' | 'hoy' | '7d' | '30d' | 'mes' | 'personalizado'>('todos');
  const [desdeFecha, setDesdeFecha] = useState('');
  const [hastaFecha, setHastaFecha] = useState('');
  const desde30 = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 30); d.setHours(0, 0, 0, 0); return d; }, []);
  const respuesta = useMetricasRespuesta(desde30, new Date());

  const cargar = async () => {
    const { data } = await supabase.from('contactos').select('*').order('actualizado_en', { ascending: false }).returns<Contacto[]>();
    setContactos(data || []);
  };

  const cargarLineas = async () => {
    const { data: l } = await supabase.from('lineas_whatsapp').select('id, nombre').order('nombre').returns<LineaSimple[]>();
    setLineas(l || []);
    const { data: u } = await supabase.from('usuarios').select('id, nombre').returns<UsuarioSimple[]>();
    setUsuarios(u || []);
    // El teléfono de un contacto no guarda su línea/responsable directamente:
    // se infiere de la conversación más reciente (igual patrón que useConversaciones).
    const { data: conv } = await supabase
      .from('conversaciones')
      .select('contacto_telefono, linea_id, agente_asignado_id, ultima_actividad')
      .order('ultima_actividad', { ascending: false })
      .returns<ConversacionResumen[]>();
    const mapa: Record<string, ConversacionResumen> = {};
    (conv || []).forEach((c) => {
      if (!mapa[c.contacto_telefono]) mapa[c.contacto_telefono] = c;
    });
    setConversacionPorTelefono(mapa);
  };

  const cargarEtapas = async () => {
    const { data } = await supabase.from('etapas_venta').select('*').order('orden').returns<EtapaVenta[]>();
    setEtapas(data || []);
  };

  const cargarEtiquetas = async () => {
    const { data: catalogo } = await supabase
      .from('etiquetas_whatsapp')
      .select('id, nombre, color')
      .eq('eliminada', false)
      .order('nombre')
      .returns<EtiquetaWhatsapp[]>();
    setEtiquetasCatalogo(catalogo || []);

    const { data: asociaciones } = await supabase
      .from('contacto_etiquetas')
      .select('contacto_id, etiquetas_whatsapp(id, nombre, color, eliminada)')
      .returns<{ contacto_id: string; etiquetas_whatsapp: (EtiquetaWhatsapp & { eliminada: boolean }) | null }[]>();
    const mapa: Record<string, EtiquetaWhatsapp[]> = {};
    (asociaciones || []).forEach((a) => {
      if (!a.etiquetas_whatsapp || a.etiquetas_whatsapp.eliminada) return;
      (mapa[a.contacto_id] ||= []).push(a.etiquetas_whatsapp);
    });
    setEtiquetasDeContacto(mapa);
  };

  useEffect(() => {
    cargar();
    cargarLineas();
    cargarEtapas();
    cargarEtiquetas();
    const canal = supabase
      .channel(`contactos-cambios-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contactos' }, () => cargar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacto_etiquetas' }, () => cargarEtiquetas())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'etiquetas_whatsapp' }, () => cargarEtiquetas())
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.empresa_id]);

  const nombreLinea = (id: string | null) => lineas.find((l) => l.id === id)?.nombre || '';
  const nombreUsuario = (id: string | null) => usuarios.find((u) => u.id === id)?.nombre || '';
  const etapaDe = (c: Contacto) => etapas.find((e) => e.id === c.etapa_id) || null;

  const pasaBusqueda = (c: Contacto) => {
    if (!busqueda.trim()) return true;
    const q = busqueda.toLowerCase();
    return (c.nombre || '').toLowerCase().includes(q) || c.telefono.toLowerCase().includes(q) || (c.producto_interes || '').toLowerCase().includes(q);
  };
  const pasaSegmento = (c: Contacto) => segmento === 'todos' || etapaDe(c)?.tipo === segmento;
  const pasaLinea = (c: Contacto) => lineaFiltro === 'todas' || conversacionPorTelefono[c.telefono]?.linea_id === lineaFiltro;
  const pasaEtiqueta = (c: Contacto) => etiquetaFiltro === 'todas' || (etiquetasDeContacto[c.id] || []).some((e) => e.id === etiquetaFiltro);

  // Período de creación del contacto (cuándo escribió por primera vez).
  const rangoPeriodo = (): { desde: Date | null; hasta: Date | null } => {
    const hoy = new Date();
    const inicioDia = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    if (periodo === 'hoy') return { desde: inicioDia(hoy), hasta: null };
    if (periodo === '7d') { const d = inicioDia(hoy); d.setDate(d.getDate() - 6); return { desde: d, hasta: null }; }
    if (periodo === '30d') { const d = inicioDia(hoy); d.setDate(d.getDate() - 29); return { desde: d, hasta: null }; }
    if (periodo === 'mes') return { desde: new Date(hoy.getFullYear(), hoy.getMonth(), 1), hasta: null };
    if (periodo === 'personalizado') {
      const desde = desdeFecha ? new Date(`${desdeFecha}T00:00:00`) : null;
      const hasta = hastaFecha ? new Date(`${hastaFecha}T23:59:59.999`) : null;
      return { desde, hasta };
    }
    return { desde: null, hasta: null };
  };
  const pasaPeriodo = (c: Contacto) => {
    const { desde, hasta } = rangoPeriodo();
    const t = new Date(c.creado_en).getTime();
    return (!desde || t >= desde.getTime()) && (!hasta || t <= hasta.getTime());
  };

  // Los contactos con más datos (nombre, interés, etapa, etiquetas, temperatura)
  // van arriba; los que solo tienen el número, al fondo. Dentro de cada grupo
  // se mantiene el orden por actividad reciente.
  const completitud = (c: Contacto) =>
    (c.nombre ? 1 : 0) + (c.producto_interes ? 1 : 0) + (c.etapa_id ? 1 : 0) + ((etiquetasDeContacto[c.id] || []).length > 0 ? 1 : 0) + (c.temperatura ? 1 : 0);

  const filtrados = useMemo(
    () => contactos.filter((c) => pasaBusqueda(c) && pasaSegmento(c) && pasaLinea(c) && pasaEtiqueta(c) && pasaPeriodo(c)).sort((a, b) => completitud(b) - completitud(a)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contactos, busqueda, segmento, lineaFiltro, etiquetaFiltro, conversacionPorTelefono, etiquetasDeContacto, etapas, periodo, desdeFecha, hastaFecha],
  );

  const conteoSegmento = (tipo: TipoEtapa) => contactos.filter((c) => etapaDe(c)?.tipo === tipo).length;
  const lineaDeContacto: Record<string, string> = Object.fromEntries(Object.entries(conversacionPorTelefono).map(([tel, c]) => [tel, c.linea_id]));

  if (telefonoAbierto) {
    return (
      <DetalleLead
        telefono={telefonoAbierto}
        telefonoChat={conversacionPorTelefono[telefonoAbierto]?.contacto_telefono}
        lineaSugerida={conversacionPorTelefono[telefonoAbierto]?.linea_id}
        onVolver={() => setTelefonoAbierto(null)}
        onAbrirChat={onAbrirChat}
      />
    );
  }

  return (
    <div className="flex-1 flex min-h-0 min-w-0">
      {escribiendoA && (
        <ModalWhatsapp
          nombre={escribiendoA.nombre || escribiendoA.telefono}
          telefono={conversacionPorTelefono[escribiendoA.telefono]?.contacto_telefono || escribiendoA.telefono}
          lineaSugerida={conversacionPorTelefono[escribiendoA.telefono]?.linea_id}
          onCerrar={() => setEscribiendoA(null)}
          onAbrirChat={onAbrirChat && conversacionPorTelefono[escribiendoA.telefono] ? () => onAbrirChat(escribiendoA.telefono) : undefined}
        />
      )}
      {importando && <ImportarContactos telefonosExistentes={new Set(contactos.map((c) => c.telefono))} onCerrar={() => setImportando(false)} onImportado={cargar} />}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-4 md:px-8 py-4 md:py-6 flex flex-col gap-4 overflow-y-auto" style={{ background: 'var(--surface-2)' }}>
          <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 shrink-0">
            <div className="flex-1 flex flex-col gap-1">
              <h1 className="m-0 text-[22px] font-bold tracking-tight" style={{ color: TEXTO_PRIMARIO }}>Contactos</h1>
              <p className="m-0 text-[13.5px]" style={{ color: TEXTO_SECUNDARIO }}>{contactos.length} personas escribieron · {conteoSegmento('normal')} son leads activos · tiempo de respuesta promedio (30 días): <b className="num" style={{ color: 'var(--fg)' }}>{formatoDuracion(respuesta.promedioMin)}</b></p>
            </div>
            <div className="flex items-center gap-2 rounded-lg px-3 w-full md:w-auto" style={{ height: 40, border: `1px solid ${BORDE}`, backgroundColor: 'var(--surface)' }}>
              <Search size={14} color={TEXTO_TERCIARIO} className="shrink-0" />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar contacto, número o producto" className="bg-transparent outline-none text-[13.5px] w-full md:w-[220px]" style={{ color: TEXTO_PRIMARIO }} />
            </div>
            <button
              onClick={() => setImportando(true)}
              className="flex items-center justify-center gap-2 rounded-lg px-3.5 text-[13.5px] font-semibold shrink-0"
              style={{ height: 40, border: '1px solid var(--accent)', backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
            >
              <Upload size={14} />
              Importar
            </button>
            <button
              onClick={() => descargarCsv(filtrados, nombreLinea, lineaDeContacto, etiquetasDeContacto)}
              className="flex items-center justify-center gap-2 rounded-lg px-3.5 text-[13.5px] font-semibold shrink-0"
              style={{ height: 40, border: '1px solid #C7E3D6', backgroundColor: '#F2FBF6', color: '#067647' }}
            >
              <Download size={14} />
              Exportar a Excel
            </button>
          </div>

          <div className="flex items-center gap-3 flex-wrap rounded-xl px-3.5 py-3 shrink-0" style={{ backgroundColor: 'var(--surface)', border: `1px solid ${BORDE}`, boxShadow: SOMBRA_CARD }}>
            <div className="flex gap-1 rounded-lg p-1" style={{ backgroundColor: 'var(--surface-2)' }}>
              <button
                onClick={() => setSegmento('todos')}
                className="text-[12.5px] font-semibold rounded-md px-3 py-1.5"
                style={segmento === 'todos' ? { backgroundColor: NAVY, color: 'white' } : { color: TEXTO_SECUNDARIO }}
              >
                Todos ({contactos.length})
              </button>
              {SEGMENTOS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSegmento(s.id)}
                  className="text-[12.5px] font-semibold rounded-md px-3 py-1.5"
                  style={segmento === s.id ? { backgroundColor: NAVY, color: 'white' } : { color: TEXTO_SECUNDARIO }}
                >
                  {s.label} ({conteoSegmento(s.id)})
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold tracking-wider uppercase" style={{ color: TEXTO_TERCIARIO }}>Línea</span>
              <select
                value={lineaFiltro}
                onChange={(e) => setLineaFiltro(e.target.value)}
                className="rounded-lg pl-2.5 pr-1.5 py-1.5 text-[12.5px] font-semibold outline-none cursor-pointer max-w-[220px]"
                style={{ border: '1px solid var(--line)', color: TEXTO_PRIMARIO, backgroundColor: 'var(--surface)' }}
              >
                <option value="todas">Todas</option>
                {lineas.map((l) => (
                  <option key={l.id} value={l.id}>{l.nombre}</option>
                ))}
              </select>
            </div>
            {etiquetasCatalogo.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold tracking-wider uppercase" style={{ color: TEXTO_TERCIARIO }}>Etiqueta</span>
                <select
                  value={etiquetaFiltro}
                  onChange={(e) => setEtiquetaFiltro(e.target.value)}
                  className="rounded-lg pl-2.5 pr-1.5 py-1.5 text-[12.5px] font-semibold outline-none cursor-pointer max-w-[220px]"
                  style={{ border: '1px solid var(--line)', color: TEXTO_PRIMARIO, backgroundColor: 'var(--surface)' }}
                >
                  <option value="todas">Todas</option>
                  {etiquetasCatalogo.map((e) => (
                    <option key={e.id} value={e.id}>{e.nombre}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-bold tracking-wider uppercase" style={{ color: TEXTO_TERCIARIO }}>Creado</span>
              <select
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value as typeof periodo)}
                aria-label="Período de creación"
                className="rounded-lg pl-2.5 pr-1.5 py-1.5 text-[12.5px] font-semibold outline-none cursor-pointer"
                style={{ border: '1px solid var(--line)', color: TEXTO_PRIMARIO, backgroundColor: 'var(--surface)' }}
              >
                <option value="todos">Cualquier fecha</option>
                <option value="hoy">Hoy</option>
                <option value="7d">Últimos 7 días</option>
                <option value="30d">Últimos 30 días</option>
                <option value="mes">Este mes</option>
                <option value="personalizado">Personalizado…</option>
              </select>
              {periodo === 'personalizado' && (
                <>
                  <input type="date" value={desdeFecha} onChange={(e) => setDesdeFecha(e.target.value)} aria-label="Desde" className="rounded-lg px-2 py-1 text-[12.5px] outline-none" style={{ border: '1px solid var(--line)', color: TEXTO_PRIMARIO, backgroundColor: 'var(--surface)' }} />
                  <span className="text-xs" style={{ color: TEXTO_TERCIARIO }}>a</span>
                  <input type="date" value={hastaFecha} onChange={(e) => setHastaFecha(e.target.value)} aria-label="Hasta" className="rounded-lg px-2 py-1 text-[12.5px] outline-none" style={{ border: '1px solid var(--line)', color: TEXTO_PRIMARIO, backgroundColor: 'var(--surface)' }} />
                </>
              )}
            </div>
            <span className="text-[12.5px] w-full md:w-auto md:ml-auto" style={{ color: TEXTO_SECUNDARIO }}>Mostrando {filtrados.length} de {contactos.length}</span>
          </div>

          <div className="rounded-xl overflow-hidden shrink-0" style={{ backgroundColor: 'var(--surface)', border: `1px solid ${BORDE}`, boxShadow: SOMBRA_CARD }}>
            <div
              className="hidden md:grid px-4 py-2.5 text-[11px] font-bold tracking-wider uppercase"
              style={{ gridTemplateColumns: '2fr 1.2fr 1.1fr 1.6fr .8fr 1.5fr 1.2fr', color: TEXTO_TERCIARIO, borderBottom: `1px solid ${BORDE}` }}
            >
              <span>Contacto</span>
              <span>Interés</span>
              <span>Etapa</span>
              <span>Etiquetas</span>
              <span>Temp.</span>
              <span>Última actividad</span>
              <span>Responsable</span>
            </div>

            {filtrados.length === 0 && (
              <div className="text-center text-sm py-10 px-6" style={{ color: TEXTO_TERCIARIO }}>
                {contactos.length === 0 ? 'Todavía no hay contactos guardados. Se van a ir agregando solos apenas les escriban por WhatsApp.' : 'Ningún contacto con este filtro.'}
              </div>
            )}
            {filtrados.map((c) => {
              const etapa = etapaDe(c);
              const conv = conversacionPorTelefono[c.telefono];
              return (
                // div y no <button>: adentro va el botón de WhatsApp y no se
                // pueden anidar botones.
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setTelefonoAbierto(c.telefono)}
                  onKeyDown={(e) => e.key === 'Enter' && setTelefonoAbierto(c.telefono)}
                  className="w-full grid grid-cols-1 md:grid gap-1.5 md:gap-3 items-center px-4 py-3 text-left cursor-pointer"
                  style={{ gridTemplateColumns: '2fr 1.2fr 1.1fr 1.6fr .8fr 1.5fr 1.2fr', borderBottom: `1px solid ${BORDE_FILA}` }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-[12.5px] font-semibold shrink-0" style={{ backgroundColor: colorAvatar(c.telefono), color: 'white' }}>
                      {(c.nombre || c.telefono).slice(-2)}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <span className="text-[13.5px] font-semibold truncate" style={{ color: TEXTO_PRIMARIO }}>{c.nombre || c.telefono}</span>
                      <span className="text-xs truncate" style={{ color: TEXTO_SECUNDARIO, fontFamily: 'var(--fuente-mono)' }}>{c.telefono}{c.nombre ? ` · creado ${new Date(c.creado_en).toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: '2-digit' })}` : ''}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEscribiendoA(c);
                      }}
                      aria-label={`Escribir por WhatsApp a ${c.nombre || c.telefono}`}
                      title="Escribir por WhatsApp"
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: '#E7F8EE', color: '#128C4B' }}
                    >
                      <MessageCircle size={15} />
                    </button>
                  </div>
                  <span className="hidden md:block text-[12.5px] truncate" style={{ color: TEXTO_SECUNDARIO }}>{c.producto_interes || '—'}</span>
                  <span className="hidden md:block">
                    {etapa ? (
                      <span className="text-[11.5px] font-semibold rounded-full px-2 py-0.5 inline-block truncate max-w-full" style={{ backgroundColor: tinte(colorEtiquetaWhatsapp(etapa.color)), color: colorEtiquetaWhatsapp(etapa.color) }}>
                        {etapa.nombre}
                      </span>
                    ) : <span className="text-xs" style={{ color: TEXTO_TERCIARIO }}>—</span>}
                  </span>
                  <span className="hidden md:flex items-center gap-1 flex-wrap min-w-0">
                    {(etiquetasDeContacto[c.id] || []).length === 0 && <span className="text-xs" style={{ color: TEXTO_TERCIARIO }}>—</span>}
                    {(etiquetasDeContacto[c.id] || []).slice(0, 2).map((e) => (
                      <span key={e.id} className="inline-flex items-center gap-1 rounded-md px-1.5 py-px text-[11px] font-semibold max-w-[110px]" style={{ backgroundColor: tinte(colorEtiquetaWhatsapp(e.color), 20), color: 'var(--fg)' }}>
                        <span className="rounded-full shrink-0" style={{ width: 7, height: 7, backgroundColor: colorEtiquetaWhatsapp(e.color) }} />
                        <span className="truncate">{e.nombre}</span>
                      </span>
                    ))}
                    {(etiquetasDeContacto[c.id] || []).length > 2 && <span className="text-[11px]" style={{ color: TEXTO_TERCIARIO }}>+{(etiquetasDeContacto[c.id] || []).length - 2}</span>}
                  </span>
                  <span className="hidden md:block">
                    {c.temperatura ? (
                      <span className="text-xs font-bold" style={{ color: TEMPERATURA_STYLE[c.temperatura].color }}>{TEMPERATURA_STYLE[c.temperatura].label}</span>
                    ) : <span className="text-xs" style={{ color: TEXTO_TERCIARIO }}>—</span>}
                  </span>
                  <span className="hidden md:flex items-center gap-1.5 text-[12px] truncate" style={{ color: TEXTO_SECUNDARIO }}>
                    {conv?.linea_id && (
                      <span className="text-[10.5px] font-semibold rounded px-1.5 py-0.5 shrink-0" style={{ backgroundColor: CHIP_LINEA.bg, color: CHIP_LINEA.color }}>{nombreLinea(conv.linea_id)}</span>
                    )}
                    <span className="truncate">{conv ? tiempoRelativo(conv.ultima_actividad) : 'sin conversación'}</span>
                  </span>
                  <span className="hidden md:block text-[12.5px] truncate" style={{ color: conv?.agente_asignado_id ? TEXTO_SECUNDARIO : TEXTO_TERCIARIO, fontStyle: conv?.agente_asignado_id ? 'normal' : 'italic' }}>
                    {conv?.agente_asignado_id ? nombreUsuario(conv.agente_asignado_id) : 'Sin asignar'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
