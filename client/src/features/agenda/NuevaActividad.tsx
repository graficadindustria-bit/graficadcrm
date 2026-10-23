import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { BORDE, TEAL, TEXTO_PRIMARIO, TEXTO_SECUNDARIO, TEXTO_TERCIARIO } from '../../lib/tema';

interface NuevaActividadProps {
  onCerrar: () => void;
  onCreada: () => void;
}

const estiloInput = { border: `1px solid ${BORDE}`, color: TEXTO_PRIMARIO, backgroundColor: 'var(--surface)' } as const;

// El dueño o un supervisor le deja una actividad al vendedor: título, nota,
// fecha y un checklist (un ítem por línea). No hace falta que esté ligada a un
// cliente.
export default function NuevaActividad({ onCerrar, onCreada }: NuevaActividadProps) {
  const { usuario } = useAuth();
  const [equipo, setEquipo] = useState<{ id: string; nombre: string }[]>([]);
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fecha, setFecha] = useState('');
  const [responsable, setResponsable] = useState(usuario?.id ?? '');
  const [checklist, setChecklist] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase
      .from('usuarios')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre')
      .returns<{ id: string; nombre: string }[]>()
      .then(({ data }) => setEquipo(data || []));
  }, []);

  const crear = async () => {
    setError('');
    if (!titulo.trim()) return setError('Escribe un título.');
    if (!responsable) return setError('Elige a quién se le asigna.');
    setGuardando(true);
    try {
      const { data: tarea, error: errorTarea } = await supabase
        .from('tareas')
        .insert({
          empresa_id: usuario!.empresa_id,
          contacto_id: null,
          titulo: titulo.trim(),
          descripcion: descripcion.trim() || null,
          fecha: fecha || null,
          asignado_a: responsable,
          creado_por: usuario!.id,
        })
        .select('id')
        .single<{ id: string }>();
      if (errorTarea) throw errorTarea;
      const items = checklist.split('\n').map((l) => l.trim()).filter(Boolean);
      if (items.length > 0) {
        const { error: errorItems } = await supabase.from('tarea_items').insert(items.map((texto, orden) => ({ tarea_id: tarea.id, texto, orden })));
        if (errorItems) throw errorItems;
      }
      onCreada();
    } catch {
      setError('No se pudo crear la actividad.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(10,15,25,0.4)' }}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl p-5 flex flex-col gap-3" style={{ backgroundColor: 'var(--surface)' }}>
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-bold tracking-tight" style={{ color: TEXTO_PRIMARIO }}>Nueva actividad para el equipo</span>
          <button onClick={onCerrar} aria-label="Cerrar"><X size={16} color={TEXTO_SECUNDARIO} /></button>
        </div>
        <label className="flex flex-col gap-1.5 text-xs font-semibold" style={{ color: 'var(--fg-2)' }}>
          Título
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej: Llamar a los clientes de la semana pasada" className="rounded-lg px-2.5 outline-none font-normal text-[13.5px]" style={{ ...estiloInput, height: 38 }} />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold" style={{ color: 'var(--fg-2)' }}>
          Nota para el vendedor (opcional)
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} className="rounded-lg px-2.5 py-2 outline-none font-normal text-[13.5px] resize-none" style={estiloInput} />
        </label>
        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1.5 text-xs font-semibold" style={{ color: 'var(--fg-2)' }}>
            Fecha y hora
            <input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} className="rounded-lg px-2 outline-none font-normal text-[13px]" style={{ ...estiloInput, height: 38 }} />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold" style={{ color: 'var(--fg-2)' }}>
            Responsable
            <select value={responsable} onChange={(e) => setResponsable(e.target.value)} className="rounded-lg px-2 outline-none font-normal text-[13px]" style={{ ...estiloInput, height: 38 }}>
              {equipo.map((u) => <option key={u.id} value={u.id}>{u.id === usuario?.id ? `${u.nombre} (yo)` : u.nombre}</option>)}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-xs font-semibold" style={{ color: 'var(--fg-2)' }}>
          Checklist (un ítem por línea)
          <textarea value={checklist} onChange={(e) => setChecklist(e.target.value)} rows={4} placeholder={'Revisar pendientes\nResponder consultas nuevas\nActualizar el embudo'} className="rounded-lg px-2.5 py-2 outline-none font-normal text-[13.5px] resize-none" style={estiloInput} />
          <span className="font-normal text-[11px]" style={{ color: TEXTO_TERCIARIO }}>El vendedor va marcando cada ítem desde su Agenda.</span>
        </label>
        {error && <span className="text-xs" style={{ color: 'var(--bad)' }}>{error}</span>}
        <button onClick={crear} disabled={guardando} className="self-start text-[13.5px] font-semibold rounded-lg px-4" style={{ height: 38, backgroundColor: TEAL, color: 'var(--accent-fg)', opacity: guardando ? 0.6 : 1 }}>
          {guardando ? 'Creando…' : 'Crear actividad'}
        </button>
      </div>
    </div>
  );
}
