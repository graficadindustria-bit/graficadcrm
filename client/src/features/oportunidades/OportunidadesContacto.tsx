import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { BORDE, TEAL, TEXTO_PRIMARIO, TEXTO_SECUNDARIO, TEXTO_TERCIARIO } from '../../lib/tema';
import type { Oportunidad } from '../../lib/tipos';
import TarjetaOportunidad from './TarjetaOportunidad';
import { useMotivoPerdida } from './useMotivoPerdida';
import { EVENTO_OPORTUNIDADES, actualizarOportunidad, cerrarOportunidad, crearOportunidad, eliminarOportunidad, reabrirOportunidad } from './oportunidadesApi';

interface OportunidadesContactoProps {
  contactoId: string;
  empresaId: string;
  usuarioId: string;
}

// Las oportunidades de un contacto: las abiertas se editan ahí mismo, se pueden
// agregar más, y las ganadas o perdidas quedan en el historial.
export default function OportunidadesContacto({ contactoId, empresaId, usuarioId }: OportunidadesContactoProps) {
  const [lista, setLista] = useState<Oportunidad[]>([]);
  const [verHistorial, setVerHistorial] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const [nuevoProducto, setNuevoProducto] = useState('');
  const [nuevoMonto, setNuevoMonto] = useState('');
  const [nuevaProb, setNuevaProb] = useState('');
  const [error, setError] = useState('');
  const { pedirMotivo, motivos, dialogo } = useMotivoPerdida();

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from('oportunidades')
      .select('*')
      .eq('contacto_id', contactoId)
      .order('creado_en', { ascending: false })
      .returns<Oportunidad[]>();
    setLista(data || []);
  }, [contactoId]);

  useEffect(() => {
    cargar();
    window.addEventListener(EVENTO_OPORTUNIDADES, cargar);
    return () => window.removeEventListener(EVENTO_OPORTUNIDADES, cargar);
  }, [cargar]);

  const abiertas = lista.filter((o) => o.estado === 'abierta');
  const historial = lista.filter((o) => o.estado !== 'abierta');

  const agregar = async () => {
    setError('');
    const ok = await crearOportunidad(empresaId, contactoId, usuarioId, { producto: nuevoProducto, monto: Number(nuevoMonto) || 0, probabilidad: Number(nuevaProb) || 0 });
    if (!ok) return setError('No se pudo crear la oportunidad.');
    setNuevoProducto('');
    setNuevoMonto('');
    setNuevaProb('');
    setAgregando(false);
  };

  const eliminar = async (o: Oportunidad) => {
    if (!window.confirm(`¿Eliminar la oportunidad «${o.producto || 'sin producto'}»? No se puede deshacer.`)) return;
    if (!(await eliminarOportunidad(o.id))) setError('No se pudo eliminar.');
  };

  const entrada = { border: `1px solid ${BORDE}`, color: TEXTO_PRIMARIO, height: 34 } as const;

  return (
    <div className="flex flex-col gap-2.5">
      {abiertas.length === 0 && !agregando && <div className="text-[11.5px]" style={{ color: TEXTO_TERCIARIO }}>Sin oportunidades abiertas.</div>}
      {abiertas.map((o) => (
        <TarjetaOportunidad
          key={o.id}
          oportunidad={o}
          motivos={motivos}
          onGuardar={(c) => actualizarOportunidad(o.id, c).then((ok) => !ok && setError('No se pudo guardar.'))}
          onGanada={() => cerrarOportunidad(o.id, 'ganada')}
          onPerdida={() => pedirMotivo((motivoId) => cerrarOportunidad(o.id, 'perdida', motivoId))}
          onReabrir={() => reabrirOportunidad(o.id)}
          onEliminar={() => eliminar(o)}
        />
      ))}

      {agregando ? (
        <div className="rounded-xl p-3 flex flex-col gap-2" style={{ border: `1.5px dashed ${TEAL}` }}>
          <input autoFocus value={nuevoProducto} onChange={(e) => setNuevoProducto(e.target.value)} placeholder="Producto o servicio" className="rounded-lg px-2.5 outline-none text-[13.5px]" style={entrada} />
          <div className="grid grid-cols-2 gap-2">
            <input type="number" min={0} value={nuevoMonto} onChange={(e) => setNuevoMonto(e.target.value)} placeholder="Monto (Bs.)" className="rounded-lg px-2.5 outline-none text-[13px] num" style={entrada} />
            <input type="number" min={0} max={100} value={nuevaProb} onChange={(e) => setNuevaProb(e.target.value)} placeholder="Cierre (%)" className="rounded-lg px-2.5 outline-none text-[13px] num" style={entrada} />
          </div>
          <div className="flex gap-2">
            <button onClick={agregar} className="rounded-lg px-3 text-[12.5px] font-semibold" style={{ height: 32, backgroundColor: TEAL, color: 'white' }}>Agregar</button>
            <button onClick={() => setAgregando(false)} className="rounded-lg px-3 text-[12.5px]" style={{ height: 32, color: TEXTO_SECUNDARIO }}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAgregando(true)} className="inline-flex items-center justify-center gap-1.5 rounded-lg text-[12.5px] font-semibold" style={{ height: 34, border: `1.5px dashed var(--line-2)`, color: TEAL }}>
          <Plus size={14} />Agregar oportunidad
        </button>
      )}

      {historial.length > 0 && (
        <div className="flex flex-col gap-2">
          <button onClick={() => setVerHistorial((v) => !v)} className="inline-flex items-center gap-1 text-[12px] font-semibold self-start" style={{ color: TEXTO_SECUNDARIO }}>
            {verHistorial ? <ChevronDown size={13} /> : <ChevronRight size={13} />}Historial ({historial.length})
          </button>
          {verHistorial && historial.map((o) => (
            <TarjetaOportunidad
              key={o.id}
              oportunidad={o}
              motivos={motivos}
              onGuardar={() => undefined}
              onGanada={() => undefined}
              onPerdida={() => undefined}
              onReabrir={() => reabrirOportunidad(o.id)}
              onEliminar={() => eliminar(o)}
            />
          ))}
        </div>
      )}
      {error && <span className="text-[11px]" style={{ color: 'var(--bad)' }}>{error}</span>}
      {dialogo}
    </div>
  );
}
