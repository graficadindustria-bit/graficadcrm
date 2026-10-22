import { Fragment, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Calculator, Check, MoreVertical, PanelRight, User } from 'lucide-react';
import { ESTADO_CONVERSACION_STYLE, colorEtiquetaWhatsapp } from '../../lib/tema';
import { inicialesDe, nombreConversacion, tieneNombre } from './utils';
import { useContacto } from './hooks/useContacto';
import { supabase } from '../../lib/supabaseClient';
import BurbujaMensaje from './BurbujaMensaje';
import Compositor from './Compositor';
import { BloqueProgramados } from './ProgramarMensaje';
import type { Conversacion, EstadoConversacion, EtapaVenta, Mensaje, RespuestaAutomatica, RespuestaRapida, Usuario } from '../../lib/tipos';

interface HiloMensajesProps {
  seleccionada: Conversacion;
  usuario: Usuario;
  mensajes: Mensaje[];
  respuestasRapidas: RespuestaRapida[];
  respuestasAutomaticas: RespuestaAutomatica[];
  etapasVenta: EtapaVenta[];
  nombreLinea: string;
  /** Nombre de quien tiene asignado el chat (si hay). */
  nombreAsignado?: string;
  mostrarPanelContacto: boolean;
  onTogglePanelContacto: () => void;
  onCambiarEstado: (estado: EstadoConversacion) => void;
  onResolver: () => void;
  onReclamar: () => void;
  onLiberar: () => void;
  /** Abre el cotizador de Graficad con este chat como cliente. */
  onCotizar?: () => void;
  /** Presente solo en la vista celular: muestra la flecha de volver y usa el layout mobile. */
  onVolver?: () => void;
}

// "Hoy", "Ayer" o "13 de octubre" (con año si no es el actual).
function etiquetaDia(iso: string): string {
  const f = new Date(iso);
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  if (f.toDateString() === hoy.toDateString()) return 'Hoy';
  if (f.toDateString() === ayer.toDateString()) return 'Ayer';
  return f.toLocaleDateString('es-BO', { day: 'numeric', month: 'long', ...(f.getFullYear() !== hoy.getFullYear() ? { year: 'numeric' } : {}) });
}

export default function HiloMensajes({
  seleccionada,
  usuario,
  mensajes,
  respuestasRapidas,
  respuestasAutomaticas,
  etapasVenta,
  nombreLinea,
  nombreAsignado,
  mostrarPanelContacto,
  onTogglePanelContacto,
  onCambiarEstado,
  onResolver,
  onReclamar,
  onLiberar,
  onCotizar,
  onVolver,
}: HiloMensajesProps) {
  const { contacto, setContacto } = useContacto(seleccionada.contacto_telefono.split('@')[0], usuario.empresa_id);
  const [menuAbierto, setMenuAbierto] = useState(false);
  // Siempre al último mensaje cuando llega uno nuevo o se abre otro chat.
  const contenedorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = contenedorRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensajes.length, seleccionada.id]);
  useEffect(() => setMenuAbierto(false), [seleccionada.id]);

  // El nombre editado a mano en la ficha del contacto (contactos.nombre) tiene
  // prioridad sobre el que trajo WhatsApp al crear la conversación.
  const nombreMostrado = contacto?.nombre || nombreConversacion(seleccionada);
  const conNombre = !!contacto?.nombre || tieneNombre(seleccionada);
  const iniciales = conNombre ? inicialesDe(nombreMostrado) : '';

  const cambiarEtapa = async (etapaId: string) => {
    if (!contacto) return;
    const ahora = new Date().toISOString();
    setContacto((prev) => (prev ? { ...prev, etapa_id: etapaId, etapa_actualizada_en: ahora } : prev));
    await supabase.from('contactos').update({ etapa_id: etapaId, etapa_actualizada_en: ahora }).eq('id', contacto.id);
  };

  const etapaActual = etapasVenta.find((e) => e.id === contacto?.etapa_id);
  const esMio = seleccionada.agente_asignado_id === usuario.id;
  const esMovil = !!onVolver;

  const textoAsignado = !seleccionada.agente_asignado_id ? 'Sin asignar' : esMio ? 'Asignado a ti' : `Asignado a ${nombreAsignado || 'otro agente'}`;

  // El botón principal cambia según el estado del chat.
  const accionPrincipal =
    seleccionada.estado === 'cerrado'
      ? { texto: 'Reabrir', onClick: () => onCambiarEstado('abierto'), icono: false }
      : !seleccionada.agente_asignado_id
        ? { texto: 'Reclamar', onClick: onReclamar, icono: false }
        : { texto: 'Marcar resuelto', onClick: onResolver, icono: true };

  const itemMenu = 'flex items-center gap-2.5 w-full text-left rounded-lg px-2.5 py-2 text-[13.5px]';

  return (
    <div className={`flex flex-col min-w-0 ${esMovil ? 'h-full w-full' : 'flex-1'}`}>
      <div className="px-3 md:px-[18px] flex items-center gap-3" style={{ minHeight: 64, backgroundColor: 'var(--surface)', borderBottom: '1px solid var(--line)' }}>
        {esMovil && <button onClick={onVolver} aria-label="Volver a la lista" className="p-1 -ml-1"><ArrowLeft size={20} color="var(--fg)" /></button>}
        <span
          className="shrink-0 rounded-full flex items-center justify-center font-semibold text-[14px]"
          style={{ width: 40, height: 40, backgroundColor: iniciales ? 'var(--accent-soft)' : 'var(--surface-2)', color: iniciales ? 'var(--accent)' : 'var(--fg-3)', border: iniciales ? 'none' : '1px solid var(--line)' }}
        >
          {iniciales || <User size={19} aria-label="Sin nombre" />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[16px] font-bold leading-tight break-words" style={{ color: 'var(--fg)' }} title={nombreMostrado}>{nombreMostrado}</div>
          <div className="flex items-center gap-x-1.5 flex-wrap text-[12.5px]" style={{ color: 'var(--fg-2)' }}>
            <span>{textoAsignado}</span>
            {etapaActual && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1">
                  <i className="rounded-full" style={{ width: 7, height: 7, backgroundColor: colorEtiquetaWhatsapp(etapaActual.color) }} />
                  {etapaActual.nombre}
                </span>
              </>
            )}
            {nombreLinea && (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate max-w-[160px]">{nombreLinea}</span>
              </>
            )}
          </div>
        </div>
        {onCotizar && (
          <button
            onClick={onCotizar}
            title="Cotizar este pedido"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 font-semibold text-[13.5px] whitespace-nowrap"
            style={{ border: '1px solid var(--line-2)', color: 'var(--fg)', backgroundColor: 'var(--surface)' }}
          >
            <Calculator size={15} />
            <span className={esMovil ? 'sr-only' : ''}>Cotizar</span>
          </button>
        )}

        <button
          onClick={accionPrincipal.onClick}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-[10px] px-4 py-2 font-semibold text-[13.5px] whitespace-nowrap"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
        >
          {accionPrincipal.icono && <Check size={15} />}
          {accionPrincipal.texto}
        </button>

        <div className="relative shrink-0">
          <button onClick={() => setMenuAbierto((v) => !v)} aria-label="Más acciones" aria-haspopup="menu" aria-expanded={menuAbierto} className="w-9 h-9 rounded-[10px] flex items-center justify-center" style={{ color: 'var(--fg-2)', backgroundColor: menuAbierto ? 'var(--accent-soft)' : 'transparent' }}>
            <MoreVertical size={18} />
          </button>
          {menuAbierto && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuAbierto(false)} />
              <div role="menu" className="aparecer absolute right-0 top-full mt-1 z-20 rounded-xl p-1.5" style={{ width: 240, backgroundColor: 'var(--surface)', border: '1px solid var(--line)', boxShadow: '0 8px 24px rgba(7,26,56,.18)' }}>
                <div className="eyebrow px-2.5 pt-1.5 pb-1">Estado</div>
                {(Object.entries(ESTADO_CONVERSACION_STYLE) as [EstadoConversacion, { label: string }][]).map(([valor, cfg]) => (
                  <button key={valor} role="menuitemradio" aria-checked={seleccionada.estado === valor} onClick={() => { onCambiarEstado(valor); setMenuAbierto(false); }} className={itemMenu} style={{ color: 'var(--fg)', backgroundColor: seleccionada.estado === valor ? 'var(--accent-soft)' : 'transparent' }}>
                    <span className="w-4 flex justify-center">{seleccionada.estado === valor && <Check size={14} color="var(--accent)" />}</span>
                    {cfg.label}
                  </button>
                ))}
                {etapasVenta.length > 0 && (
                  <>
                    <div className="eyebrow px-2.5 pt-2.5 pb-1">Etapa del embudo</div>
                    <select
                      value={contacto?.etapa_id || ''}
                      onChange={(e) => { if (e.target.value) { cambiarEtapa(e.target.value); setMenuAbierto(false); } }}
                      disabled={!contacto}
                      aria-label="Etapa del embudo"
                      className="w-full rounded-lg px-2 py-2 text-[13.5px] outline-none"
                      style={{ border: '1px solid var(--line)', backgroundColor: 'var(--surface-2)', color: 'var(--fg)' }}
                    >
                      {!contacto?.etapa_id && <option value="">Sin etapa</option>}
                      {etapasVenta.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                    </select>
                  </>
                )}
                {esMio && seleccionada.estado !== 'cerrado' && (
                  <button role="menuitem" onClick={() => { onLiberar(); setMenuAbierto(false); }} className={`${itemMenu} mt-1.5`} style={{ color: 'var(--fg)', borderTop: '1px solid var(--line)', borderRadius: 0, paddingTop: 10 }}>
                    Liberar chat
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <button onClick={onTogglePanelContacto} aria-label="Ficha del contacto" title="Ficha del contacto" aria-pressed={mostrarPanelContacto} className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0" style={{ color: mostrarPanelContacto ? 'var(--accent)' : 'var(--fg-2)', backgroundColor: mostrarPanelContacto ? 'var(--accent-soft)' : 'transparent' }}>
          <PanelRight size={18} />
        </button>
      </div>

      <div ref={contenedorRef} className="flex-1 overflow-y-auto px-3 md:px-6 py-4 flex flex-col gap-1.5" style={{ background: 'var(--chat)' }}>
        {mensajes.map((m, i) => {
          const dia = new Date(m.creado_en).toDateString();
          const nuevoDia = i === 0 || dia !== new Date(mensajes[i - 1].creado_en).toDateString();
          return (
            <Fragment key={m.id}>
              {nuevoDia && (
                <span className="self-center text-[12px] rounded-full px-3 py-0.5 my-2" style={{ color: 'var(--fg-2)', backgroundColor: 'var(--surface)', border: '1px solid var(--line)' }}>
                  {etiquetaDia(m.creado_en)}
                </span>
              )}
              <BurbujaMensaje m={m} />
            </Fragment>
          );
        })}
        <BloqueProgramados conversacionId={seleccionada.id} usuario={usuario} />
      </div>
      <Compositor mensajes={mensajes} seleccionada={seleccionada} usuario={usuario} respuestasRapidas={respuestasRapidas} respuestasAutomaticas={respuestasAutomaticas} />
    </div>
  );
}
