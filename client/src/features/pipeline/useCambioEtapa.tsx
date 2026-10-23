import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { BORDE, TEAL, TEXTO_PRIMARIO, TEXTO_SECUNDARIO } from '../../lib/tema';
import type { Contacto, EtapaVenta, MotivoPerdida } from '../../lib/tipos';

type Cambios = Pick<Contacto, 'etapa_id' | 'etapa_actualizada_en' | 'motivo_perdida_id'> & Partial<Pick<Contacto, 'probabilidad_cierre'>>;

interface Pendiente {
  contactoId: string;
  etapa: EtapaVenta;
  alAplicar: (cambios: Cambios) => void;
}

// Único lugar donde se cambia la etapa de un contacto (chat, ficha, embudo y
// lista). Al entrar en una etapa con probabilidad, el contacto la toma; al
// pasar a una etapa "perdida" pide el motivo antes de guardar.
export function useCambioEtapa(etapas: EtapaVenta[]): {
  cambiarEtapa: (contactoId: string, etapaId: string, alAplicar: (cambios: Cambios) => void) => void;
  dialogo: ReactNode;
} {
  const [motivos, setMotivos] = useState<MotivoPerdida[]>([]);
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);

  useEffect(() => {
    supabase.from('motivos_perdida').select('*').order('creado_en').returns<MotivoPerdida[]>().then(({ data }) => setMotivos(data || []));
  }, []);

  const aplicar = async ({ contactoId, etapa, alAplicar }: Pendiente, motivoId: string | null) => {
    const cambios: Cambios = {
      etapa_id: etapa.id,
      etapa_actualizada_en: new Date().toISOString(),
      motivo_perdida_id: etapa.tipo === 'perdida' ? motivoId : null,
      ...(etapa.probabilidad !== null && etapa.probabilidad !== undefined ? { probabilidad_cierre: etapa.probabilidad } : {}),
    };
    alAplicar(cambios);
    await supabase.from('contactos').update(cambios).eq('id', contactoId);
  };

  const cambiarEtapa = (contactoId: string, etapaId: string, alAplicar: (cambios: Cambios) => void) => {
    const etapa = etapas.find((e) => e.id === etapaId);
    if (!etapa) return;
    const nuevo = { contactoId, etapa, alAplicar };
    if (etapa.tipo === 'perdida' && motivos.length > 0) setPendiente(nuevo);
    else aplicar(nuevo, null);
  };

  const dialogo = pendiente && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(10,15,25,0.4)' }}>
      <div className="w-full max-w-sm rounded-2xl p-5 flex flex-col gap-3" style={{ backgroundColor: 'var(--surface)' }}>
        <span className="text-[15px] font-bold tracking-tight" style={{ color: TEXTO_PRIMARIO }}>¿Por qué se perdió la venta?</span>
        <div className="flex flex-col gap-1.5">
          {motivos.map((m) => (
            <button
              key={m.id}
              onClick={() => { aplicar(pendiente, m.id); setPendiente(null); }}
              className="text-left rounded-lg px-3 py-2 text-[13.5px] font-medium"
              style={{ border: `1px solid ${BORDE}`, color: TEXTO_PRIMARIO }}
            >
              {m.nombre}
            </button>
          ))}
        </div>
        <div className="flex justify-between">
          <button onClick={() => { aplicar(pendiente, null); setPendiente(null); }} className="text-[12.5px]" style={{ color: TEXTO_SECUNDARIO }}>Omitir</button>
          <button onClick={() => setPendiente(null)} className="text-[12.5px] font-semibold" style={{ color: TEAL }}>Cancelar</button>
        </div>
      </div>
    </div>
  );

  return { cambiarEtapa, dialogo };
}
