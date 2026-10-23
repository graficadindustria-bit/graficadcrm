import { useCallback, useEffect, useState } from 'react';
import { Clock, FileText, Image as ImageIcon, Mic, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { BORDE, TEXTO_PRIMARIO, TEXTO_SECUNDARIO, TEXTO_TERCIARIO } from '../../lib/tema';
import { formatearEnZona, zonaDelNavegador } from '../../lib/zonaHoraria';
import { EVENTO_CAMBIO } from './ProgramarMensaje';
import type { MensajeProgramado, Usuario } from '../../lib/tipos';

const ICONO_TIPO = { imagen: ImageIcon, pdf: FileText, documento: FileText, audio: Mic, texto: Clock } as const;

// Las "cajitas" de la pestaña Seguimiento: lo que está programado para este
// contacto (sin importar en qué conversación se programó), con su hora, el
// adjunto si lo hay y el botón para cancelar.
export default function ProgramadosContacto({ telefono, lineaId, usuario }: { telefono: string; lineaId: string | null; usuario: Usuario }) {
  const zona = usuario.zona_horaria || zonaDelNavegador();
  const [lista, setLista] = useState<MensajeProgramado[]>([]);

  const cargar = useCallback(async () => {
    let consulta = supabase
      .from('mensajes_programados')
      .select('id, conversacion_id, contenido, tipo, media_url, enviar_en, estado, cancelar_si_responde, motivo, creado_en')
      .like('telefono', `${telefono}%`)
      .in('estado', ['pendiente', 'enviando', 'error'])
      .order('enviar_en');
    if (lineaId) consulta = consulta.eq('linea_id', lineaId);
    const { data } = await consulta.returns<MensajeProgramado[]>();
    setLista(data || []);
  }, [telefono, lineaId]);

  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, 30000);
    window.addEventListener(EVENTO_CAMBIO, cargar);
    return () => {
      clearInterval(intervalo);
      window.removeEventListener(EVENTO_CAMBIO, cargar);
    };
  }, [cargar]);

  const cancelar = async (id: string) => {
    await supabase.from('mensajes_programados').update({ estado: 'cancelado', motivo: 'Cancelado por un agente' }).eq('id', id).eq('estado', 'pendiente');
    await cargar();
    window.dispatchEvent(new Event(EVENTO_CAMBIO));
  };

  if (lista.length === 0) return <div className="text-[11px]" style={{ color: TEXTO_TERCIARIO }}>Nada programado para este contacto</div>;
  return (
    <div className="flex flex-col gap-1.5">
      {lista.map((m) => {
        const Icono = ICONO_TIPO[m.tipo];
        const fallo = m.estado === 'error';
        return (
          <div key={m.id} className="rounded-lg p-2 flex flex-col gap-1" style={{ border: `1px ${fallo ? 'solid' : 'dashed'} ${fallo ? 'var(--bad)' : BORDE}`, backgroundColor: 'var(--surface-2)' }}>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: fallo ? 'var(--bad)' : 'var(--warn)' }}>
              <Icono size={12} />
              {fallo ? 'No se envió' : 'Programado'} · {formatearEnZona(m.enviar_en, zona)}
            </div>
            <div className="text-[12.5px] break-words" style={{ color: TEXTO_PRIMARIO }}>
              {m.contenido || (m.tipo === 'audio' ? 'Nota de voz' : m.tipo === 'imagen' ? 'Imagen' : 'Archivo adjunto')}
            </div>
            {m.motivo && fallo && <div className="text-[11px]" style={{ color: 'var(--bad)' }}>{m.motivo}</div>}
            {m.estado === 'pendiente' && (
              <div className="flex items-center justify-between">
                <span className="text-[10.5px]" style={{ color: TEXTO_SECUNDARIO }}>{m.cancelar_si_responde ? 'Se cancela si el cliente responde' : 'Sale aunque el cliente responda'}</span>
                <button onClick={() => cancelar(m.id)} className="flex items-center gap-0.5 text-[11px] font-semibold" style={{ color: 'var(--bad)' }}><X size={11} />Cancelar</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
