import { useEffect, useState } from 'react';
import { X, Trash2, ArrowUp, ArrowDown, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { PALETA_ETIQUETAS_WHATSAPP, TEAL, BORDE, TEXTO_PRIMARIO, TEXTO_SECUNDARIO, TEXTO_TERCIARIO, colorEtiquetaWhatsapp } from '../../lib/tema';
import type { EtapaVenta, MotivoPerdida } from '../../lib/tipos';

interface GestionEtapasProps {
  etapas: EtapaVenta[];
  onClose: () => void;
}

export default function GestionEtapas({ etapas, onClose }: GestionEtapasProps) {
  const { usuario } = useAuth();
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [error, setError] = useState('');
  const [motivos, setMotivos] = useState<MotivoPerdida[]>([]);
  const [motivoNuevo, setMotivoNuevo] = useState('');

  const cargarMotivos = async () => {
    const { data } = await supabase.from('motivos_perdida').select('*').order('creado_en').returns<MotivoPerdida[]>();
    setMotivos(data || []);
  };
  useEffect(() => {
    cargarMotivos();
  }, []);

  const agregarMotivo = async () => {
    if (!motivoNuevo.trim()) return;
    await supabase.from('motivos_perdida').insert({ empresa_id: usuario!.empresa_id, nombre: motivoNuevo.trim() });
    setMotivoNuevo('');
    cargarMotivos();
  };
  const quitarMotivo = async (id: string) => {
    await supabase.from('motivos_perdida').delete().eq('id', id);
    cargarMotivos();
  };
  const cambiarProbabilidad = async (etapa: EtapaVenta, texto: string) => {
    const valor = texto.trim() === '' ? null : Math.min(100, Math.max(0, Math.round(Number(texto))));
    if (valor !== null && Number.isNaN(valor)) return;
    if (valor !== etapa.probabilidad) await supabase.from('etapas_venta').update({ probabilidad: valor }).eq('id', etapa.id);
  };

  const agregar = async () => {
    if (!nombreNuevo.trim()) return;
    const orden = Math.max(0, ...etapas.map((e) => e.orden)) + 1;
    const color = etapas.length % PALETA_ETIQUETAS_WHATSAPP.length;
    await supabase.from('etapas_venta').insert({ empresa_id: usuario!.empresa_id, nombre: nombreNuevo, tipo: 'normal', orden, color });
    setNombreNuevo('');
  };

  const renombrar = async (etapa: EtapaVenta, nombre: string) => {
    await supabase.from('etapas_venta').update({ nombre }).eq('id', etapa.id);
  };

  const mover = async (etapa: EtapaVenta, direccion: -1 | 1) => {
    const ordenadas = [...etapas].sort((a, b) => a.orden - b.orden);
    const idx = ordenadas.findIndex((e) => e.id === etapa.id);
    const vecino = ordenadas[idx + direccion];
    if (!vecino) return;
    await supabase.from('etapas_venta').update({ orden: vecino.orden }).eq('id', etapa.id);
    await supabase.from('etapas_venta').update({ orden: etapa.orden }).eq('id', vecino.id);
  };

  const eliminar = async (etapa: EtapaVenta) => {
    setError('');
    if (etapa.tipo !== 'normal') {
      const otrasDelMismoTipo = etapas.filter((e) => e.tipo === etapa.tipo && e.id !== etapa.id);
      if (otrasDelMismoTipo.length === 0) {
        setError(`Tiene que quedar al menos una etapa de tipo "${etapa.tipo === 'ganada' ? 'Venta ganada' : 'Venta perdida'}" para que el Dashboard pueda calcular las métricas.`);
        return;
      }
    }
    await supabase.from('etapas_venta').delete().eq('id', etapa.id);
  };

  const ordenadas = [...etapas].sort((a, b) => a.orden - b.orden);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(10,15,25,0.4)' }}>
      <div className="w-full max-w-md rounded-2xl p-5 flex flex-col gap-3.5" style={{ backgroundColor: 'var(--surface)' }}>
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-bold tracking-tight" style={{ color: TEXTO_PRIMARIO }}>Etapas del pipeline <span className="text-[11px] font-normal" style={{ color: TEXTO_TERCIARIO }}>(% = probabilidad de cierre)</span></span>
          <button onClick={onClose} aria-label="Cerrar" className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ border: `1px solid ${BORDE}` }}><X size={14} color={TEXTO_SECUNDARIO} /></button>
        </div>

        <div className="flex flex-col gap-1.5 max-h-[50vh] overflow-y-auto">
          {ordenadas.map((etapa, idx) => (
            <div key={etapa.id} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5" style={{ border: `1px solid ${BORDE}` }}>
              <span className="rounded-full shrink-0" style={{ width: 8, height: 8, backgroundColor: colorEtiquetaWhatsapp(etapa.color) }} />
              <input
                defaultValue={etapa.nombre}
                onBlur={(e) => e.target.value.trim() && e.target.value !== etapa.nombre && renombrar(etapa, e.target.value.trim())}
                className="flex-1 min-w-0 outline-none text-[13px] font-medium bg-transparent"
                style={{ color: TEXTO_PRIMARIO }}
              />
              <input
                type="number"
                min={0}
                max={100}
                defaultValue={etapa.probabilidad ?? ''}
                onBlur={(e) => cambiarProbabilidad(etapa, e.target.value)}
                aria-label={`Probabilidad de cierre de ${etapa.nombre}`}
                title="Probabilidad de cierre (%) que recibe un contacto al entrar en esta etapa"
                placeholder="%"
                className="shrink-0 outline-none text-[12px] text-right rounded-md px-1"
                style={{ width: 44, height: 24, border: `1px solid ${BORDE}`, color: TEXTO_PRIMARIO }}
              />
              {etapa.tipo !== 'normal' && (
                <span className="text-[9.5px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 shrink-0" style={{ backgroundColor: 'var(--surface-2)', color: TEXTO_TERCIARIO }}>
                  {etapa.tipo === 'ganada' ? 'Ganada' : 'Perdida'}
                </span>
              )}
              <button onClick={() => mover(etapa, -1)} disabled={idx === 0} aria-label="Subir" className="shrink-0 disabled:opacity-30"><ArrowUp size={13} color={TEXTO_SECUNDARIO} /></button>
              <button onClick={() => mover(etapa, 1)} disabled={idx === ordenadas.length - 1} aria-label="Bajar" className="shrink-0 disabled:opacity-30"><ArrowDown size={13} color={TEXTO_SECUNDARIO} /></button>
              <button onClick={() => eliminar(etapa)} aria-label="Eliminar" className="shrink-0"><Trash2 size={13} color={TEXTO_TERCIARIO} /></button>
            </div>
          ))}
        </div>

        {error && <div className="text-[11px]" style={{ color: 'var(--bad)' }}>{error}</div>}

        <div className="flex items-center gap-1.5">
          <input
            value={nombreNuevo}
            onChange={(e) => setNombreNuevo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && agregar()}
            placeholder="Nueva etapa..."
            className="flex-1 rounded-lg px-2.5 outline-none text-[13px]"
            style={{ height: 36, border: `1px solid ${BORDE}`, color: TEXTO_PRIMARIO }}
          />
          <button onClick={agregar} className="rounded-lg px-3 flex items-center justify-center shrink-0" style={{ height: 36, backgroundColor: TEAL }}>
            <Plus size={14} color="white" />
          </button>
        </div>

        <div className="flex flex-col gap-1.5 pt-2" style={{ borderTop: `1px solid ${BORDE}` }}>
          <span className="text-[13px] font-bold" style={{ color: TEXTO_PRIMARIO }}>Motivos de venta perdida</span>
          <div className="flex flex-wrap gap-1.5">
            {motivos.map((m) => (
              <span key={m.id} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px]" style={{ border: `1px solid ${BORDE}`, color: TEXTO_PRIMARIO }}>
                {m.nombre}
                <button onClick={() => quitarMotivo(m.id)} aria-label={`Quitar ${m.nombre}`}><X size={11} color={TEXTO_TERCIARIO} /></button>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <input
              value={motivoNuevo}
              onChange={(e) => setMotivoNuevo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && agregarMotivo()}
              placeholder="Nuevo motivo..."
              className="flex-1 rounded-lg px-2.5 outline-none text-[13px]"
              style={{ height: 36, border: `1px solid ${BORDE}`, color: TEXTO_PRIMARIO }}
            />
            <button onClick={agregarMotivo} aria-label="Agregar motivo" className="rounded-lg px-3 flex items-center justify-center shrink-0" style={{ height: 36, backgroundColor: TEAL }}>
              <Plus size={14} color="white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
