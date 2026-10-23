import { useEffect, useState } from 'react';
import { Check, RotateCcw, Trash2, X } from 'lucide-react';
import { BORDE, TEAL, TEXTO_PRIMARIO, TEXTO_SECUNDARIO, TEXTO_TERCIARIO } from '../../lib/tema';
import type { MotivoPerdida, Oportunidad } from '../../lib/tipos';
import { limitarProbabilidad } from './oportunidadesApi';

interface TarjetaOportunidadProps {
  oportunidad: Oportunidad;
  motivos: MotivoPerdida[];
  /** Encabezado extra (nombre del contacto, botones de chat...) para la pantalla Oportunidades. */
  cabecera?: React.ReactNode;
  /** Pie extra (responsable, etc.). */
  pie?: React.ReactNode;
  onGuardar: (cambios: { producto: string | null; monto: number; probabilidad: number }) => void;
  onGanada: () => void;
  onPerdida: () => void;
  onReabrir: () => void;
  onEliminar: () => void;
}

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });

const estiloCampo = { border: `1px solid ${BORDE}`, color: TEXTO_PRIMARIO, backgroundColor: 'var(--surface)', height: 34 } as const;

// Tarjeta de una oportunidad: abierta se edita directo (se guarda al salir del
// campo) y se cierra como ganada o perdida; cerrada queda de historial, con
// opción de reabrirla.
export default function TarjetaOportunidad({ oportunidad: o, motivos, cabecera, pie, onGuardar, onGanada, onPerdida, onReabrir, onEliminar }: TarjetaOportunidadProps) {
  const [producto, setProducto] = useState(o.producto ?? '');
  const [monto, setMonto] = useState(String(o.monto ?? 0));
  const [probabilidad, setProbabilidad] = useState(String(o.probabilidad ?? 0));

  // Si la oportunidad cambia desde afuera (otra pantalla, otro usuario), se refleja.
  useEffect(() => {
    setProducto(o.producto ?? '');
    setMonto(String(o.monto ?? 0));
    setProbabilidad(String(o.probabilidad ?? 0));
  }, [o.producto, o.monto, o.probabilidad]);

  const abierta = o.estado === 'abierta';
  const guardarSiCambio = () => {
    const nuevo = { producto: producto.trim() || null, monto: Math.max(0, Number(monto) || 0), probabilidad: limitarProbabilidad(Number(probabilidad)) };
    if (nuevo.producto !== (o.producto ?? null) || nuevo.monto !== Number(o.monto) || nuevo.probabilidad !== o.probabilidad) onGuardar(nuevo);
  };
  const motivo = motivos.find((m) => m.id === o.motivo_perdida_id)?.nombre;
  const colorEstado = o.estado === 'ganada' ? 'var(--ok)' : o.estado === 'perdida' ? 'var(--bad)' : 'var(--warn)';

  return (
    <div className="rounded-xl p-3 flex flex-col gap-2.5" style={{ border: `1px solid ${abierta ? BORDE : 'transparent'}`, backgroundColor: abierta ? 'var(--surface)' : 'var(--surface-2)' }}>
      {cabecera}
      {abierta ? (
        <>
          <input
            value={producto}
            onChange={(e) => setProducto(e.target.value)}
            onBlur={guardarSiCambio}
            placeholder="Producto o servicio"
            aria-label="Producto o servicio"
            className="rounded-lg px-2.5 outline-none text-[13.5px] font-semibold"
            style={estiloCampo}
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[11px] font-semibold" style={{ color: TEXTO_SECUNDARIO }}>
              Monto (Bs.)
              <input type="number" min={0} value={monto} onChange={(e) => setMonto(e.target.value)} onBlur={guardarSiCambio} className="rounded-lg px-2.5 outline-none text-[13px] font-normal num" style={estiloCampo} />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-semibold" style={{ color: TEXTO_SECUNDARIO }}>
              Cierre (%)
              <input type="number" min={0} max={100} value={probabilidad} onChange={(e) => setProbabilidad(e.target.value)} onBlur={guardarSiCambio} className="rounded-lg px-2.5 outline-none text-[13px] font-normal num" style={estiloCampo} />
            </label>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface-2)' }}>
            <div className="h-full rounded-full" style={{ width: `${limitarProbabilidad(Number(probabilidad))}%`, background: 'linear-gradient(90deg, var(--accent-2), var(--accent))' }} />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button onClick={onGanada} className="inline-flex items-center gap-1 rounded-lg px-2.5 text-[12px] font-semibold" style={{ height: 30, backgroundColor: 'var(--ok)', color: 'white' }}>
              <Check size={13} />Ganada
            </button>
            <button onClick={onPerdida} className="inline-flex items-center gap-1 rounded-lg px-2.5 text-[12px] font-semibold" style={{ height: 30, border: '1px solid var(--bad)', color: 'var(--bad)' }}>
              <X size={13} />Perdida
            </button>
            <span className="flex-1" />
            <button onClick={onEliminar} aria-label="Eliminar oportunidad" title="Eliminar" className="rounded-lg flex items-center justify-center" style={{ width: 30, height: 30, border: `1px solid ${BORDE}` }}>
              <Trash2 size={13} color={TEXTO_TERCIARIO} />
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold break-words" style={{ color: TEXTO_PRIMARIO }}>{o.producto || 'Sin producto'}</div>
              <div className="text-[11.5px]" style={{ color: TEXTO_SECUNDARIO }}>
                Creada {fecha(o.creado_en)}{o.cerrada_en ? ` · cerrada ${fecha(o.cerrada_en)}` : ''}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="num text-[14px] font-bold" style={{ color: TEXTO_PRIMARIO }}>Bs. {Number(o.monto).toLocaleString('es-BO')}</div>
              <span className="text-[11px] font-bold uppercase" style={{ color: colorEstado }}>{o.estado}</span>
            </div>
          </div>
          {o.estado === 'perdida' && motivo && <div className="text-[11.5px]" style={{ color: TEXTO_SECUNDARIO }}>Motivo: {motivo}</div>}
          <div className="flex items-center gap-1.5">
            <button onClick={onReabrir} className="inline-flex items-center gap-1 rounded-lg px-2.5 text-[12px] font-semibold" style={{ height: 28, border: `1px solid ${BORDE}`, color: TEAL }}>
              <RotateCcw size={12} />Reabrir
            </button>
            <span className="flex-1" />
            <button onClick={onEliminar} aria-label="Eliminar oportunidad" title="Eliminar" className="rounded-lg flex items-center justify-center" style={{ width: 28, height: 28 }}>
              <Trash2 size={13} color={TEXTO_TERCIARIO} />
            </button>
          </div>
        </>
      )}
      {pie}
    </div>
  );
}
