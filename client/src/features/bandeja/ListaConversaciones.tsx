import { useEffect, useMemo, useState } from 'react';
import { CheckCheck, Flame, Search, User } from 'lucide-react';
import { CHIP_LINEA, colorEtiquetaWhatsapp } from '../../lib/tema';
import { formatoHora, formatoTelefono, inicialesDe, nombreConversacion, tieneNombre } from './utils';
import { esOportunidad, type ResumenContacto, type UltimoMensaje } from './hooks/useConversaciones';
import type { Conversacion, EtiquetaWhatsapp, LineaWhatsapp } from '../../lib/tipos';

interface ListaConversacionesProps {
  conversaciones: Conversacion[];
  ultimosMensajes: Record<string, UltimoMensaje>;
  lineas: LineaWhatsapp[];
  etiquetasPorTelefono: Record<string, EtiquetaWhatsapp[]>;
  contactoPorTelefono: Record<string, ResumenContacto>;
  pendientes: Record<string, number>;
  ultimoDelCliente: Record<string, string>;
  esVendedor: boolean;
  miId: string;
  seleccionadaId: string | null;
  onSeleccionar: (c: Conversacion) => void;
  colorLinea: (lineaId: string) => string;
  nombreLinea: (lineaId: string) => string;
  compacta: boolean;
}

type Pestana = 'mios' | 'sin_asignar' | 'por_vencer' | 'resueltos';

// WhatsApp deja responder con texto libre hasta 24 h después del último mensaje
// del cliente. "Por vencer" son los chats que ya pasaron las 20 h.
const VENTANA_MIN = 24 * 60;
const AVISO_VENTANA_MIN = 4 * 60;

// Minutos que le quedan a la ventana de 24 h; null si ya venció o el cliente
// nunca escribió.
export function minutosRestantesVentana(ultimoCliente: string | undefined, ahora: number): number | null {
  if (!ultimoCliente) return null;
  const restante = VENTANA_MIN - Math.floor((ahora - new Date(ultimoCliente).getTime()) / 60000);
  return restante > 0 ? restante : null;
}

interface Filtros {
  soloSinResponder: boolean;
  sinLeer: boolean;
  etiquetaId: string;
  linea: string;
  antiguosPrimero: boolean;
}
const FILTROS_INICIALES: Filtros = { soloSinResponder: false, sinLeer: false, etiquetaId: 'todas', linea: 'todas', antiguosPrimero: true };

// "Responder ahora" (pantalla Hoy) deja marcado el filtro de sin responder
// antes de abrir la Bandeja; la lista lo lee al montarse.
export function activarFiltroSinResponder(miId: string): void {
  const clave = `bandeja-filtros-${miId}`;
  try {
    const actual = leerFiltros(clave);
    localStorage.setItem(clave, JSON.stringify({ ...actual, soloSinResponder: true }));
  } catch { /* sin storage: se abre la Bandeja sin filtro */ }
}

function leerFiltros(clave: string): Filtros {
  try {
    const guardado = localStorage.getItem(clave);
    return guardado ? { ...FILTROS_INICIALES, ...JSON.parse(guardado) } : FILTROS_INICIALES;
  } catch {
    return FILTROS_INICIALES;
  }
}

// Minutos que lleva esperando respuesta un chat (el último mensaje es del
// cliente); null si no está esperando.
export function minutosEsperando(c: Conversacion, ultimo: UltimoMensaje | undefined, ahora: number): number | null {
  if (c.estado === 'cerrado' || !ultimo || ultimo.remitente !== 'cliente') return null;
  return Math.max(0, Math.floor((ahora - new Date(ultimo.creado_en).getTime()) / 60000));
}

export function textoEspera(min: number): string {
  if (min < 1) return 'ahora';
  if (min < 60) return `${min} min`;
  if (min < 60 * 24) return `${Math.floor(min / 60)} h`;
  return `${Math.floor(min / 1440)} d`;
}

// Verde dentro de la meta (5 min), ámbar hasta 30, rojo después.
export function colorEspera(min: number): string {
  if (min <= 5) return 'var(--ok)';
  if (min <= 30) return 'var(--warn)';
  return 'var(--bad)';
}


export default function ListaConversaciones({
  conversaciones,
  ultimosMensajes,
  lineas,
  etiquetasPorTelefono,
  contactoPorTelefono,
  pendientes,
  ultimoDelCliente,
  esVendedor,
  miId,
  seleccionadaId,
  onSeleccionar,
  nombreLinea,
  compacta,
}: ListaConversacionesProps) {
  const [pestana, setPestana] = useState<Pestana>('mios');
  const [busqueda, setBusqueda] = useState('');
  // Los filtros se recuerdan por usuario (cada agente trabaja a su manera).
  const claveFiltros = `bandeja-filtros-${miId}`;
  const [filtros, setFiltros] = useState<Filtros>(() => leerFiltros(claveFiltros));
  const cambiarFiltros = (cambio: Partial<Filtros>) => {
    setFiltros((prev) => {
      const nuevo = { ...prev, ...cambio };
      try { localStorage.setItem(claveFiltros, JSON.stringify(nuevo)); } catch { /* sin storage: no se recuerda */ }
      return nuevo;
    });
  };
  const lineaSeleccionada = filtros.linea;
  // Se refresca cada minuto para que los "hace X min" se muevan solos.
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const pasaLinea = (c: Conversacion) => (esVendedor ? true : lineaSeleccionada === 'todas' || c.linea_id === lineaSeleccionada);
  const pasaBusqueda = (c: Conversacion) => {
    if (busqueda.trim() === '') return true;
    const q = busqueda.toLowerCase();
    return (
      nombreConversacion(c).toLowerCase().includes(q) ||
      c.contacto_telefono.includes(q) ||
      (ultimosMensajes[c.id]?.contenido || '').toLowerCase().includes(q) ||
      (etiquetasPorTelefono[c.contacto_telefono] || []).some((e) => e.nombre.toLowerCase().includes(q))
    );
  };

  const abiertos = useMemo(
    () => conversaciones.filter((c) => pasaLinea(c) && pasaBusqueda(c) && c.estado !== 'cerrado'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversaciones, lineaSeleccionada, busqueda, esVendedor, ultimosMensajes, etiquetasPorTelefono],
  );

  const porVencer = (c: Conversacion) => {
    const restante = minutosRestantesVentana(ultimoDelCliente[c.id], ahora);
    return restante !== null && restante <= AVISO_VENTANA_MIN;
  };
  const esMio = (c: Conversacion) => c.agente_asignado_id === miId;
  const conteos = {
    mios: abiertos.filter(esMio).length,
    sin_asignar: abiertos.filter((c) => c.agente_asignado_id === null).length,
    por_vencer: abiertos.filter(porVencer).length,
  };
  const sinResponder = abiertos.filter((c) => minutosEsperando(c, ultimosMensajes[c.id], ahora) !== null).length;

  // Etiquetas que existen entre los chats, para el chip "Etiqueta".
  const etiquetasDisponibles = useMemo(() => {
    const mapa = new Map<string, EtiquetaWhatsapp>();
    Object.values(etiquetasPorTelefono).flat().forEach((e) => mapa.set(e.id, e));
    return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [etiquetasPorTelefono]);

  const lista = conversaciones
    .filter((c) => {
      if (!pasaLinea(c) || !pasaBusqueda(c)) return false;
      if (pestana === 'resueltos') return c.estado === 'cerrado';
      if (c.estado === 'cerrado') return false;
      if (pestana === 'mios' && !esMio(c)) return false;
      if (pestana === 'sin_asignar' && c.agente_asignado_id !== null) return false;
      if (pestana === 'por_vencer' && !porVencer(c)) return false;
      if (filtros.soloSinResponder && minutosEsperando(c, ultimosMensajes[c.id], ahora) === null) return false;
      if (filtros.sinLeer && !(pendientes[c.id] > 0)) return false;
      if (filtros.etiquetaId !== 'todas' && !(etiquetasPorTelefono[c.contacto_telefono] || []).some((e) => e.id === filtros.etiquetaId)) return false;
      return true;
    })
    .sort((a, b) => {
      if (pestana === 'por_vencer') return (minutosRestantesVentana(ultimoDelCliente[a.id], ahora) ?? 0) - (minutosRestantesVentana(ultimoDelCliente[b.id], ahora) ?? 0);
      if (pestana === 'resueltos' || !(filtros.antiguosPrimero || filtros.soloSinResponder)) return 0;
      // Primero los que esperan respuesta hace más tiempo.
      const ea = minutosEsperando(a, ultimosMensajes[a.id], ahora);
      const eb = minutosEsperando(b, ultimosMensajes[b.id], ahora);
      if (ea !== null && eb !== null) return eb - ea;
      if (ea !== null) return -1;
      if (eb !== null) return 1;
      return 0;
    });

  const pestanas: { id: Pestana; etiqueta: string; conteo?: number }[] = [
    { id: 'mios', etiqueta: 'Mis chats', conteo: conteos.mios },
    { id: 'sin_asignar', etiqueta: 'Sin asignar', conteo: conteos.sin_asignar },
    { id: 'por_vencer', etiqueta: 'Por vencer', conteo: conteos.por_vencer },
    { id: 'resueltos', etiqueta: 'Resueltos' },
  ];

  const estiloChip = (activo: boolean): React.CSSProperties => ({
    border: `1px solid ${activo ? 'transparent' : 'var(--line)'}`,
    backgroundColor: activo ? 'var(--accent-soft)' : 'var(--surface)',
    color: activo ? 'var(--accent)' : 'var(--fg-2)',
    fontWeight: activo ? 600 : 400,
  });

  const encabezado = (
    <div className="shrink-0">
      <div className="px-4 pt-3.5 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="m-0 disp text-[20px] font-bold" style={{ color: 'var(--fg)' }}>Chats</h2>
          {sinResponder > 0 && (
            <button
              onClick={() => { if (pestana === 'resueltos') setPestana('mios'); cambiarFiltros({ soloSinResponder: !filtros.soloSinResponder }); }}
              aria-pressed={filtros.soloSinResponder}
              title={filtros.soloSinResponder ? 'Quitar el filtro' : 'Ver solo los que esperan respuesta, del más antiguo al más reciente'}
              className="rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold whitespace-nowrap"
              style={{ backgroundColor: 'var(--bad-soft)', color: 'var(--bad)', border: `1px solid ${filtros.soloSinResponder ? 'var(--bad)' : 'transparent'}` }}
            >
              {sinResponder} sin responder
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--fg-3)' }}>
          <Search size={15} className="shrink-0" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar chats o etiquetas"
            aria-label="Buscar chat"
            className="bg-transparent outline-none w-full min-w-0 text-[13.5px]"
            style={{ color: 'var(--fg)' }}
          />
        </label>
        <div className="flex gap-[18px]" role="tablist" aria-label="Filtrar chats" style={{ borderBottom: '1px solid var(--line)' }}>
          {pestanas.map((p) => {
            const activa = pestana === p.id;
            return (
              <button
                key={p.id}
                role="tab"
                aria-selected={activa}
                onClick={() => setPestana(p.id)}
                className="whitespace-nowrap py-2 text-[14px]"
                style={{ color: activa ? 'var(--accent)' : 'var(--fg-2)', fontWeight: activa ? 600 : 500, borderBottom: `2px solid ${activa ? 'var(--accent)' : 'transparent'}`, marginBottom: -1 }}
              >
                {p.etiqueta}
                {p.conteo !== undefined && <span className="ml-1.5 font-normal" style={{ color: 'var(--fg-3)' }}>{p.conteo}</span>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex gap-1.5 flex-wrap px-4 py-2.5">
        <button aria-pressed={filtros.sinLeer} onClick={() => cambiarFiltros({ sinLeer: !filtros.sinLeer })} className="rounded-full px-3 py-[3px] text-[12.5px]" style={estiloChip(filtros.sinLeer)}>Sin leer</button>
        {etiquetasDisponibles.length > 0 && (
          <select
            value={filtros.etiquetaId}
            onChange={(e) => cambiarFiltros({ etiquetaId: e.target.value })}
            aria-label="Filtrar por etiqueta"
            className="rounded-full px-2.5 py-[3px] text-[12.5px] outline-none cursor-pointer"
            style={estiloChip(filtros.etiquetaId !== 'todas')}
          >
            <option value="todas">Etiqueta ▾</option>
            {etiquetasDisponibles.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        )}
        {!esVendedor && lineas.length > 1 && (
          <select
            value={filtros.linea}
            onChange={(e) => cambiarFiltros({ linea: e.target.value })}
            aria-label="Filtrar por línea"
            className="rounded-full px-2.5 py-[3px] text-[12.5px] outline-none cursor-pointer"
            style={estiloChip(filtros.linea !== 'todas')}
          >
            <option value="todas">Línea ▾</option>
            {lineas.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        )}
        <button aria-pressed={filtros.antiguosPrimero} onClick={() => cambiarFiltros({ antiguosPrimero: !filtros.antiguosPrimero })} className="rounded-full px-3 py-[3px] text-[12.5px] whitespace-nowrap" style={estiloChip(filtros.antiguosPrimero)}>Más antiguos primero</button>
      </div>
    </div>
  );


  const variasLineas = lineas.filter((l) => l.estado === 'activo').length > 1;

  const filaConversacion = (c: Conversacion) => {
    const activa = seleccionadaId === c.id;
    const ultimo = ultimosMensajes[c.id];
    const espera = minutosEsperando(c, ultimo, ahora);
    const restanteVentana = minutosRestantesVentana(ultimoDelCliente[c.id], ahora);
    const resumen = contactoPorTelefono[c.contacto_telefono];
    const oportunidad = esOportunidad(resumen);
    const etiquetas = etiquetasPorTelefono[c.contacto_telefono] || [];
    const sinLeer = pendientes[c.id] || 0;
    const nombre = nombreConversacion(c);
    const conNombre = tieneNombre(c);
    const iniciales = conNombre ? inicialesDe(nombre) : '';
    const hayNombreGenerico = !conNombre && !!c.contacto_nombre;

    return (
      <button
        key={c.id}
        onClick={() => onSeleccionar(c)}
        aria-pressed={activa}
        className="relative w-full flex items-start gap-3 text-left"
        style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', backgroundColor: activa ? 'var(--accent-soft)' : 'transparent' }}
        onMouseEnter={(e) => { if (!activa) e.currentTarget.style.backgroundColor = 'var(--accent-soft)'; }}
        onMouseLeave={(e) => { if (!activa) e.currentTarget.style.backgroundColor = 'transparent'; }}
      >
        {activa && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full" style={{ backgroundColor: 'var(--accent)' }} />}
        <span
          className="shrink-0 rounded-full flex items-center justify-center font-semibold text-[13px]"
          style={{ width: 40, height: 40, backgroundColor: iniciales ? 'var(--accent-soft)' : 'var(--surface-2)', color: iniciales ? 'var(--accent)' : 'var(--fg-3)', border: iniciales ? 'none' : '1px solid var(--line)' }}
        >
          {iniciales || <User size={18} aria-label="Sin nombre" />}
        </span>
        <div className="min-w-0 flex-1 flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="truncate text-[14.5px]" style={{ color: 'var(--fg)', fontWeight: sinLeer > 0 ? 700 : 600 }} title={nombre}>{nombre}</span>
            {etiquetas.slice(1, 4).map((e) => (
              <i key={e.id} title={e.nombre} className="shrink-0 rounded-full" style={{ width: 8, height: 8, backgroundColor: colorEtiquetaWhatsapp(e.color) }} />
            ))}
            {pestana === 'por_vencer' && restanteVentana !== null ? (
              <span className="ml-auto shrink-0 text-[12.5px] font-semibold whitespace-nowrap" style={{ color: restanteVentana <= 60 ? 'var(--bad)' : 'var(--warn)' }}>Quedan {textoEspera(restanteVentana)}</span>
            ) : espera !== null && espera > 5 ? (
              <span className="ml-auto shrink-0 text-[12.5px] font-semibold whitespace-nowrap" style={{ color: 'var(--bad)' }}>Esperando {textoEspera(espera)}</span>
            ) : (
              <span className="ml-auto shrink-0 text-[12.5px] whitespace-nowrap" style={{ color: sinLeer > 0 ? 'var(--accent)' : 'var(--fg-3)', fontWeight: sinLeer > 0 ? 600 : 400, fontVariantNumeric: 'tabular-nums' }}>{formatoHora(c.ultima_actividad)}</span>
            )}
          </div>
          {conNombre && <span className="truncate text-[12px]" style={{ color: 'var(--fg-3)', fontVariantNumeric: 'tabular-nums' }}>{formatoTelefono(c.contacto_telefono)}</span>}
          <div className="flex items-center gap-1.5 min-w-0" style={{ color: 'var(--fg-2)' }}>
            {ultimo && ultimo.remitente !== 'cliente' && <CheckCheck size={15} className="shrink-0" style={{ color: 'var(--accent)' }} aria-label="Enviado" />}
            <span className="truncate flex-1 text-[13.5px]">{ultimo ? ultimo.contenido || 'Archivo adjunto' : 'Sin mensajes'}</span>
            {sinLeer > 0 && (
              <span className="shrink-0 rounded-full text-[12px] font-semibold flex items-center justify-center" style={{ minWidth: 20, height: 20, padding: '0 6px', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }} aria-label={`${sinLeer} sin responder`}>{sinLeer}</span>
            )}
          </div>
          {(etiquetas.length > 0 || hayNombreGenerico || oportunidad || variasLineas) && (
            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
              {etiquetas[0] && (
                <span className="inline-flex items-center gap-1 rounded-md px-1.5 text-[11.5px] max-w-[160px]" style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--line)', color: 'var(--fg-2)' }}>
                  <i className="shrink-0 rounded-full" style={{ width: 7, height: 7, backgroundColor: colorEtiquetaWhatsapp(etiquetas[0].color) }} />
                  <span className="truncate">{etiquetas[0].nombre}</span>
                </span>
              )}
              {oportunidad && (
                <span className="inline-flex items-center gap-1 rounded-md px-1.5 text-[11.5px] font-semibold" style={{ backgroundColor: 'var(--warn-soft)', color: 'var(--warn)' }}>
                  <Flame size={11} />{resumen?.probabilidad_cierre != null ? `${resumen.probabilidad_cierre}%` : 'Caliente'}
                </span>
              )}
              {hayNombreGenerico && <span className="text-[11.5px]" style={{ color: 'var(--fg-3)' }}>sin nombre</span>}
              {variasLineas && (
                <span className="rounded-md px-1.5 text-[11.5px] truncate max-w-[120px]" style={{ backgroundColor: CHIP_LINEA.bg, color: CHIP_LINEA.color }}>{nombreLinea(c.linea_id)}</span>
              )}
            </div>
          )}
        </div>
      </button>
    );
  };

  const vacio: Record<Pestana, string> = {
    mios: 'No tienes chats asignados. Toma uno desde "Sin asignar".',
    sin_asignar: 'No hay chats sin asignar. Buen trabajo.',
    por_vencer: 'Ningún chat está por perder la ventana de 24 h de WhatsApp.',
    resueltos: 'Todavía no hay chats resueltos.',
  };

  return (
    <div
      className={`flex flex-col min-h-0 min-w-0 ${compacta ? 'shrink-0' : 'h-full w-full'}`}
      style={compacta ? { width: 360, borderRight: '1px solid var(--line)', backgroundColor: 'color-mix(in srgb, var(--surface) 60%, transparent)' } : undefined}
    >
      {encabezado}
      <div className="flex-1 overflow-y-auto min-h-0">
        {lista.length === 0 && <div className="text-center text-[13px] py-10 px-6" style={{ color: 'var(--fg-3)' }}>{busqueda ? 'Ningún chat coincide con tu búsqueda.' : vacio[pestana]}</div>}
        {lista.map((c) => filaConversacion(c))}
      </div>
    </div>
  );
}
