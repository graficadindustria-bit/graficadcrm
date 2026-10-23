import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Clock, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { BLUE, BORDE, TEAL, TEXTO_SECUNDARIO, TEXTO_TERCIARIO } from '../../lib/tema';
import { aInstanteUTC, aLocalEnZona, etiquetaDeZona, formatearEnZona, zonaDelNavegador } from '../../lib/zonaHoraria';
import type { Conversacion, MensajeProgramado, TipoMensaje, Usuario } from '../../lib/tipos';

interface ProgramarMensajeProps {
  seleccionada: Conversacion;
  usuario: Usuario;
  borrador: string;
  /** Archivo elegido en el compositor: se programa junto con el mensaje. */
  adjunto: { file: File; tipo: TipoMensaje } | null;
  abierto: boolean;
  onCerrar: () => void;
  onProgramado: () => void;
}

// "Mañana a las 9:00" en la zona de la persona.
function proximaHora(zona: string, horas: number, minutos: number, diasMas: number): string {
  const ahora = aLocalEnZona(new Date(), zona); // YYYY-MM-DDTHH:mm
  const [fecha] = ahora.split('T');
  const base = new Date(`${fecha}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + diasMas);
  return `${base.toISOString().slice(0, 10)}T${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
}

// Aviso interno para que el bloque del hilo y el panel del compositor se
// actualicen al instante cuando uno de los dos programa o cancela algo.
export const EVENTO_CAMBIO = 'programados-cambio';

export function useProgramados(conversacionId: string) {
  const [lista, setLista] = useState<MensajeProgramado[]>([]);

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from('mensajes_programados')
      .select('id, conversacion_id, contenido, tipo, media_url, enviar_en, estado, cancelar_si_responde, motivo, creado_en')
      .eq('conversacion_id', conversacionId)
      .in('estado', ['pendiente', 'enviando', 'error', 'cancelado'])
      .order('enviar_en')
      .returns<MensajeProgramado[]>();
    setLista(data || []);
  }, [conversacionId]);

  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, 30000);
    window.addEventListener(EVENTO_CAMBIO, cargar);
    return () => {
      clearInterval(intervalo);
      window.removeEventListener(EVENTO_CAMBIO, cargar);
    };
  }, [cargar]);

  const avisarCambio = () => window.dispatchEvent(new Event(EVENTO_CAMBIO));
  return { lista, recargar: cargar, avisarCambio };
}

const ETIQUETA_TIPO: Record<TipoMensaje, string> = { texto: '', imagen: 'Imagen', pdf: 'PDF', documento: 'Archivo', audio: 'Audio' };

export default function ProgramarMensaje({ seleccionada, usuario, borrador, adjunto, abierto, onCerrar, onProgramado }: ProgramarMensajeProps) {
  const zona = usuario.zona_horaria || zonaDelNavegador();
  const { recargar, avisarCambio } = useProgramados(seleccionada.id);
  const [cuando, setCuando] = useState('');
  const [cancelarSiResponde, setCancelarSiResponde] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (abierto) {
      setError('');
      setCuando((actual) => actual || proximaHora(zona, 9, 0, 1));
    }
  }, [abierto, zona]);

  const programar = async () => {
    setError('');
    if (!borrador.trim() && !adjunto) return setError('Escribí primero el mensaje en el cuadro de abajo.');
    if (!cuando) return setError('Elegí fecha y hora.');
    const instante = aInstanteUTC(cuando, zona);
    if (instante.getTime() < Date.now() + 30_000) return setError('Esa hora ya pasó. Elegí una hora futura.');

    setGuardando(true);
    const base = {
      conversacion_id: seleccionada.id,
      linea_id: seleccionada.linea_id,
      telefono: seleccionada.contacto_telefono,
      cancelar_si_responde: cancelarSiResponde,
      creado_por: usuario.id,
    };
    const texto = borrador.trim();
    const filas: Record<string, unknown>[] = [];
    if (adjunto) {
      // El archivo se sube ya; el servidor lo manda a la hora elegida.
      const ext = adjunto.file.name.split('.').pop();
      const ruta = `${usuario.empresa_id}/${seleccionada.id}/${Date.now()}.${ext}`;
      const { error: errorSubida } = await supabase.storage.from('media').upload(ruta, adjunto.file);
      if (errorSubida) {
        setGuardando(false);
        return setError('No se pudo subir el archivo.');
      }
      const mediaUrl = supabase.storage.from('media').getPublicUrl(ruta).data.publicUrl;
      // En una imagen el texto va de leyenda; en el resto de archivos WhatsApp
      // no muestra leyenda, así que el texto sale como mensaje aparte justo después.
      const esImagen = adjunto.tipo === 'imagen';
      const contenido = adjunto.tipo === 'pdf' || adjunto.tipo === 'documento' ? adjunto.file.name : esImagen ? texto : '';
      filas.push({ ...base, tipo: adjunto.tipo, contenido, media_url: mediaUrl, mimetype: adjunto.tipo === 'documento' ? adjunto.file.type : null, enviar_en: instante.toISOString() });
      if (texto && !esImagen) filas.push({ ...base, tipo: 'texto', contenido: texto, enviar_en: new Date(instante.getTime() + 5000).toISOString() });
    } else {
      filas.push({ ...base, tipo: 'texto', contenido: texto, enviar_en: instante.toISOString() });
    }
    const { error: errorBD } = await supabase.from('mensajes_programados').insert(filas);
    setGuardando(false);
    if (errorBD) return setError('No se pudo programar el mensaje.');
    setCuando('');
    await recargar();
    avisarCambio();
    onProgramado();
  };

  return (
    <>
      {abierto && (
        <div className="px-3 py-3 flex flex-col gap-2.5" style={{ borderTop: `1px solid ${BORDE}`, backgroundColor: 'var(--warn-soft)' }}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[13px] font-bold" style={{ color: 'var(--warn)' }}><Clock size={14} /> Programar mensaje</span>
            <button onClick={onCerrar} aria-label="Cerrar"><X size={15} color={TEXTO_TERCIARIO} /></button>
          </div>
          <div className="text-[12px] rounded-md px-2.5 py-1.5 bg-[var(--surface)] truncate" style={{ border: `1px solid ${BORDE}`, color: borrador.trim() ? 'var(--fg)' : TEXTO_TERCIARIO }}>
            {adjunto ? `${ETIQUETA_TIPO[adjunto.tipo]}: ${adjunto.file.name}${borrador.trim() ? ` · ${borrador.trim()}` : ''}` : borrador.trim() || 'Escribí el mensaje en el cuadro de abajo y volvé a abrir esto.'}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="datetime-local"
              value={cuando}
              min={aLocalEnZona(new Date(), zona)}
              onChange={(e) => setCuando(e.target.value)}
              className="rounded-lg px-2.5 outline-none text-[13px] bg-[var(--surface)]"
              style={{ border: `1px solid ${BORDE}`, height: 36 }}
            />
            <button onClick={() => setCuando(aLocalEnZona(new Date(Date.now() + 2 * 3600 * 1000), zona))} className="rounded-md px-2 py-1 text-[11.5px] font-semibold" style={{ backgroundColor: 'var(--surface)', border: `1px solid ${BORDE}`, color: BLUE }}>En 2 horas</button>
            <button onClick={() => setCuando(proximaHora(zona, 9, 0, 1))} className="rounded-md px-2 py-1 text-[11.5px] font-semibold" style={{ backgroundColor: 'var(--surface)', border: `1px solid ${BORDE}`, color: BLUE }}>Mañana 9:00</button>
            <button onClick={() => setCuando(proximaHora(zona, 14, 0, 1))} className="rounded-md px-2 py-1 text-[11.5px] font-semibold" style={{ backgroundColor: 'var(--surface)', border: `1px solid ${BORDE}`, color: BLUE }}>Mañana 14:00</button>
          </div>
          <span className="text-[11px]" style={{ color: TEXTO_SECUNDARIO }}>
            Hora en tu zona: {etiquetaDeZona(zona)}. Podés cambiarla en Configuración.
          </span>
          <label className="flex items-center gap-2 text-[12px] cursor-pointer" style={{ color: 'var(--fg-2)' }}>
            <input type="checkbox" checked={cancelarSiResponde} onChange={(e) => setCancelarSiResponde(e.target.checked)} />
            Cancelar si el cliente responde antes
          </label>
          {error && <span className="text-[12px]" style={{ color: 'var(--bad)' }}>{error}</span>}
          <button onClick={programar} disabled={guardando} className="self-start text-[13px] font-semibold rounded-lg px-4" style={{ height: 36, backgroundColor: TEAL, color: 'var(--accent-fg)' }}>
            {guardando ? 'Programando…' : 'Programar envío'}
          </button>
        </div>
      )}
    </>
  );
}

// Mensajes programados de esta conversación (pendientes, y los que fallaron
// o se cancelaron para que la persona se entere), mostrados al final del hilo
// como "burbujas fantasma" con lo que va a salir y cuándo.
export function BloqueProgramados({ conversacionId, usuario }: { conversacionId: string; usuario: Usuario }) {
  const zona = usuario.zona_horaria || zonaDelNavegador();
  const { lista, recargar, avisarCambio } = useProgramados(conversacionId);

  const cancelar = async (id: string) => {
    await supabase.from('mensajes_programados').update({ estado: 'cancelado', motivo: 'Cancelado por un agente' }).eq('id', id).in('estado', ['pendiente']);
    await recargar();
    avisarCambio();
  };

  const descartar = async (id: string) => {
    await supabase.from('mensajes_programados').delete().eq('id', id);
    await recargar();
    avisarCambio();
  };

  if (lista.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 items-end">
      {lista.map((m) => {
        const color = m.estado === 'error' ? 'var(--c-peligro, var(--bad))' : m.estado === 'cancelado' ? TEXTO_TERCIARIO : 'var(--c-advertencia, var(--warn))';
        return (
          <div key={m.id} className="max-w-[80%] rounded-2xl px-3 py-2 text-[12.5px]" style={{ border: `1px dashed ${color}`, backgroundColor: 'color-mix(in srgb, ' + color + ' 7%, white)', color: TEXTO_SECUNDARIO }}>
            <div className="flex items-center gap-1.5 font-semibold" style={{ color }}>
              {m.estado === 'pendiente' || m.estado === 'enviando' ? <Clock size={12} /> : <CalendarClock size={12} />}
              {m.estado === 'error' ? 'No se envió' : m.estado === 'cancelado' ? 'Cancelado' : 'Programado'} · {formatearEnZona(m.enviar_en, zona)}
            </div>
            <div className="mt-1 break-words" style={{ color: 'var(--fg)' }}>{m.tipo !== 'texto' && <span className="font-semibold">{ETIQUETA_TIPO[m.tipo]}{m.contenido ? ': ' : ''}</span>}{m.contenido}</div>
            {m.motivo && m.estado !== 'pendiente' && <div className="mt-0.5 text-[11.5px]" style={{ color }}>{m.motivo}</div>}
            {m.estado === 'pendiente' && m.cancelar_si_responde && <div className="mt-0.5 text-[11px]" style={{ color: TEXTO_TERCIARIO }}>Se cancela si el cliente responde</div>}
            <div className="mt-1 flex justify-end">
              {m.estado === 'pendiente' ? (
                <button onClick={() => cancelar(m.id)} className="text-[11.5px] font-semibold" style={{ color: 'var(--c-peligro, var(--bad))' }}>Cancelar</button>
              ) : (
                <button onClick={() => descartar(m.id)} aria-label="Quitar aviso" className="flex items-center gap-1 text-[11.5px]" style={{ color: TEXTO_TERCIARIO }}><X size={12} />Quitar</button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
