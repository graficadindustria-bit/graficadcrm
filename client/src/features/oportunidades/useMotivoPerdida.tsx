import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { BORDE, TEAL, TEXTO_PRIMARIO, TEXTO_SECUNDARIO } from '../../lib/tema';
import type { MotivoPerdida } from '../../lib/tipos';

// Diálogo "¿Por qué se perdió la venta?" para marcar una oportunidad como
// perdida. Si la empresa no definió motivos, no pregunta nada.
export function useMotivoPerdida(): {
  pedirMotivo: (alElegir: (motivoId: string | null) => void) => void;
  motivos: MotivoPerdida[];
  dialogo: ReactNode;
} {
  const [motivos, setMotivos] = useState<MotivoPerdida[]>([]);
  const [pendiente, setPendiente] = useState<((motivoId: string | null) => void) | null>(null);

  useEffect(() => {
    supabase.from('motivos_perdida').select('*').order('creado_en').returns<MotivoPerdida[]>().then(({ data }) => setMotivos(data || []));
  }, []);

  const pedirMotivo = (alElegir: (motivoId: string | null) => void) => {
    if (motivos.length === 0) alElegir(null);
    else setPendiente(() => alElegir);
  };

  const elegir = (id: string | null) => {
    pendiente?.(id);
    setPendiente(null);
  };

  const dialogo = pendiente && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(10,15,25,0.4)' }}>
      <div className="w-full max-w-sm rounded-2xl p-5 flex flex-col gap-3" style={{ backgroundColor: 'var(--surface)' }}>
        <span className="text-[15px] font-bold tracking-tight" style={{ color: TEXTO_PRIMARIO }}>¿Por qué se perdió la venta?</span>
        <div className="flex flex-col gap-1.5">
          {motivos.map((m) => (
            <button key={m.id} onClick={() => elegir(m.id)} className="text-left rounded-lg px-3 py-2 text-[13.5px] font-medium" style={{ border: `1px solid ${BORDE}`, color: TEXTO_PRIMARIO }}>
              {m.nombre}
            </button>
          ))}
        </div>
        <div className="flex justify-between">
          <button onClick={() => elegir(null)} className="text-[12.5px]" style={{ color: TEXTO_SECUNDARIO }}>Omitir</button>
          <button onClick={() => setPendiente(null)} className="text-[12.5px] font-semibold" style={{ color: TEAL }}>Cancelar</button>
        </div>
      </div>
    </div>
  );

  return { pedirMotivo, motivos, dialogo };
}
