import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { BORDE, BORDE_FILA, NAVY, SOMBRA_CARD, TEAL, TEXTO_PRIMARIO, TEXTO_SECUNDARIO, TEXTO_TERCIARIO, colorAvatar } from '../../lib/tema';
import type { Tarea, TareaItem } from '../../lib/tipos';
import NuevaActividad from './NuevaActividad';

type Categoria = 'atrasada' | 'hoy' | 'semana' | 'mas_adelante' | 'sin_fecha';
type Alcance = 'todas' | 'atrasada' | 'hoy' | 'semana';
type Vista = 'agenda' | 'lista' | 'calendario';

function categoria(t: Tarea, ahora: Date): Categoria {
  if (!t.fecha) return 'sin_fecha';
  const f = new Date(t.fecha);
  if (f.getTime() < ahora.getTime()) return 'atrasada';
  if (f.toDateString() === ahora.toDateString()) return 'hoy';
  const diasHastaMedianoche = Math.round((new Date(f.toDateString()).getTime() - new Date(ahora.toDateString()).getTime()) / 86400000);
  return diasHastaMedianoche <= 7 ? 'semana' : 'mas_adelante';
}

function nombreContacto(t: Tarea) {
  return t.contactos?.nombre || t.contactos?.telefono || 'Actividad del equipo';
}

function inicialesContacto(t: Tarea) {
  const n = nombreContacto(t);
  if (n.startsWith('+') || /^\d/.test(n)) return '··';
  return n.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function formatoRelativo(fechaIso: string, ahora: Date) {
  const f = new Date(fechaIso);
  const hora = f.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
  const diasHastaMedianoche = Math.round((new Date(f.toDateString()).getTime() - new Date(ahora.toDateString()).getTime()) / 86400000);
  if (diasHastaMedianoche === 0) return `Hoy ${hora}`;
  if (diasHastaMedianoche === -1) return `Ayer ${hora}`;
  if (diasHastaMedianoche === 1) return `Mañana ${hora}`;
  if (diasHastaMedianoche > 1 && diasHastaMedianoche < 7) {
    const dia = f.toLocaleDateString('es-BO', { weekday: 'short' }).replace('.', '');
    return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} ${hora}`;
  }
  return `${f.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit' })} ${hora}`;
}

const GRUPO_META: Record<'atrasada' | 'hoy' | 'semana' | 'sin_fecha', { titulo: string; punto: string; colorTitulo: string; borde: string }> = {
  atrasada: { titulo: 'Atrasadas', punto: 'var(--bad)', colorTitulo: 'var(--bad)', borde: '#F6D9D5' },
  hoy: { titulo: 'Hoy', punto: TEAL, colorTitulo: 'var(--fg)', borde: BORDE },
  semana: { titulo: 'Esta semana', punto: '#B3C1D6', colorTitulo: 'var(--fg)', borde: BORDE },
  sin_fecha: { titulo: 'Sin fecha', punto: '#B3C1D6', colorTitulo: 'var(--fg)', borde: BORDE },
};

export default function Agenda() {
  const { usuario } = useAuth();
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [soloPendientes, setSoloPendientes] = useState(true);
  const [alcance, setAlcance] = useState<Alcance>('todas');
  const [responsable, setResponsable] = useState('todos');
  const [vista, setVista] = useState<Vista>('agenda');
  const [items, setItems] = useState<Record<string, TareaItem[]>>({});
  const [creando, setCreando] = useState(false);
  const esAdmin = usuario?.rol === 'supervisor' || usuario?.rol === 'dueno';
  const [mesVisto, setMesVisto] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });

  const cargar = async () => {
    const { data } = await supabase
      .from('tareas')
      .select('*, contactos(nombre, telefono), usuarios(nombre)')
      .order('fecha', { ascending: true })
      .returns<Tarea[]>();
    setTareas(data || []);
    const { data: filas } = await supabase.from('tarea_items').select('*').order('orden').returns<TareaItem[]>();
    const porTarea: Record<string, TareaItem[]> = {};
    (filas || []).forEach((i) => (porTarea[i.tarea_id] ||= []).push(i));
    setItems(porTarea);
  };

  useEffect(() => {
    cargar();
    const canal = supabase
      .channel(`tareas-cambios-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tareas' }, () => cargar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tarea_items' }, () => cargar())
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.empresa_id]);

  const alternar = async (t: Tarea) => {
    await supabase.from('tareas').update({ completada: !t.completada }).eq('id', t.id);
  };

  const alternarItem = async (item: TareaItem) => {
    setItems((prev) => ({ ...prev, [item.tarea_id]: (prev[item.tarea_id] || []).map((i) => (i.id === item.id ? { ...i, hecho: !i.hecho } : i)) }));
    await supabase.from('tarea_items').update({ hecho: !item.hecho }).eq('id', item.id);
  };

  const ahora = new Date();
  const responsables = useMemo(() => {
    const nombres = new Set<string>();
    tareas.forEach((t) => t.usuarios?.nombre && nombres.add(t.usuarios.nombre));
    return ['todos', ...Array.from(nombres).sort()];
  }, [tareas]);

  const pasaResponsable = (t: Tarea) => responsable === 'todos' || t.usuarios?.nombre === responsable;
  const pendientesDelResponsable = tareas.filter((t) => !t.completada && pasaResponsable(t));

  const contadores = {
    todas: pendientesDelResponsable.length,
    atrasada: pendientesDelResponsable.filter((t) => categoria(t, ahora) === 'atrasada').length,
    hoy: pendientesDelResponsable.filter((t) => categoria(t, ahora) === 'hoy').length,
    semana: pendientesDelResponsable.filter((t) => ['semana', 'mas_adelante'].includes(categoria(t, ahora))).length,
  };

  const pasaAlcance = (t: Tarea) => {
    if (alcance === 'todas') return true;
    const cat = categoria(t, ahora);
    if (alcance === 'semana') return cat === 'semana' || cat === 'mas_adelante';
    return cat === alcance;
  };

  const visibles = tareas
    .filter((t) => pasaResponsable(t) && (!soloPendientes || !t.completada) && pasaAlcance(t))
    .sort((a, b) => {
      if (!a.fecha) return 1;
      if (!b.fecha) return -1;
      return new Date(a.fecha).getTime() - new Date(b.fecha).getTime();
    });

  const grupos = (['atrasada', 'hoy', 'semana', 'sin_fecha'] as const)
    .map((clave) => {
      const items = visibles.filter((t) => (clave === 'semana' ? ['semana', 'mas_adelante'].includes(categoria(t, ahora)) : categoria(t, ahora) === clave));
      return { clave, items, meta: GRUPO_META[clave] };
    })
    .filter((g) => g.items.length > 0);

  // ---- Vista calendario: grilla real del mes visto, semanas de lunes a domingo ----
  const inicioGrilla = new Date(mesVisto);
  inicioGrilla.setDate(1 - ((mesVisto.getDay() + 6) % 7));
  const diasGrilla = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(inicioGrilla);
    d.setDate(inicioGrilla.getDate() + i);
    return d;
  });
  const tareasParaCalendario = tareas.filter((t) => pasaResponsable(t) && (!soloPendientes || !t.completada) && t.fecha);
  const nombreMes = mesVisto.toLocaleDateString('es-BO', { month: 'long', year: 'numeric' });
  const nombreMesCap = nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1);

  const filaTarea = (t: Tarea, variante: 'agrupada' | 'lista') => {
    const isDone = t.completada;
    const late = categoria(t, ahora) === 'atrasada' && !isDone;
    return (
      <div
        key={t.id}
        className={variante === 'agrupada' ? 'flex items-center gap-3.5 px-4 py-3' : 'grid items-center gap-3 px-4 py-3'}
        style={{
          borderBottom: `1px solid ${BORDE_FILA}`,
          backgroundColor: isDone ? 'var(--surface-2)' : late ? 'var(--bad-soft)' : 'var(--surface)',
          ...(variante === 'lista' ? { gridTemplateColumns: '26px 2fr 1.5fr 1.3fr 1fr 170px' } : {}),
        }}
      >
        <button
          onClick={() => alternar(t)}
          className="rounded-md flex items-center justify-center shrink-0"
          style={{ width: 19, height: 19, backgroundColor: isDone ? TEAL : 'var(--surface)', border: isDone ? 'none' : '1.5px solid var(--line-2)' }}
        >
          {isDone && <Check size={12} color="white" />}
        </button>
        {variante === 'agrupada' ? (
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <span className="text-[13.5px] font-semibold truncate" style={{ color: isDone ? 'var(--fg-3)' : TEXTO_PRIMARIO, textDecoration: isDone ? 'line-through' : 'none' }}>{t.titulo}</span>
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-[19px] h-[19px] rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0" style={{ backgroundColor: colorAvatar(t.contacto_id || t.id) }}>{inicialesContacto(t)}</div>
              <span className="text-xs truncate" style={{ color: TEXTO_SECUNDARIO }}>{nombreContacto(t)}</span>
            </div>
            {t.descripcion && <span className="text-xs" style={{ color: TEXTO_SECUNDARIO }}>{t.descripcion}</span>}
            {(items[t.id] || []).length > 0 && (
              <div className="flex flex-col gap-1 mt-1">
                <span className="text-[11px] font-semibold" style={{ color: TEXTO_TERCIARIO }}>Checklist {(items[t.id] || []).filter((i) => i.hecho).length}/{(items[t.id] || []).length}</span>
                {(items[t.id] || []).map((i) => (
                  <label key={i.id} className="flex items-center gap-2 text-[12.5px] cursor-pointer" style={{ color: i.hecho ? 'var(--fg-3)' : TEXTO_PRIMARIO, textDecoration: i.hecho ? 'line-through' : 'none' }}>
                    <input type="checkbox" checked={i.hecho} onChange={() => alternarItem(i)} />{i.texto}
                  </label>
                ))}
              </div>
            )}
          </div>
        ) : (
          <span className="text-[13.5px] font-semibold truncate" style={{ color: isDone ? 'var(--fg-3)' : TEXTO_PRIMARIO, textDecoration: isDone ? 'line-through' : 'none' }}>{t.titulo}</span>
        )}
        {variante === 'lista' && (
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[9.5px] font-bold text-white shrink-0" style={{ backgroundColor: colorAvatar(t.contacto_id || t.id) }}>{inicialesContacto(t)}</div>
            <span className="text-xs truncate" style={{ color: TEXTO_PRIMARIO }}>{nombreContacto(t)}</span>
          </div>
        )}
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          <span className="text-[12.5px] whitespace-nowrap" style={{ color: late ? 'var(--bad)' : 'var(--fg-2)', fontWeight: late ? 700 : 500 }}>{t.fecha ? formatoRelativo(t.fecha, ahora) : 'Sin fecha'}</span>
          {late && <span className="text-[11px] font-bold rounded-full px-2 py-0.5 whitespace-nowrap" style={{ color: 'var(--bad)', backgroundColor: 'var(--bad-soft)', border: '1px solid var(--bad-soft)' }}>Atrasada</span>}
        </div>
        <span className="text-xs whitespace-nowrap shrink-0" style={{ color: TEXTO_TERCIARIO }}>{t.usuarios?.nombre || 'Sin asignar'}</span>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-y-auto" style={{ background: 'var(--surface-2)' }}>
      <div className="px-4 md:px-8 py-4 md:py-6 flex flex-col gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex-1 flex flex-col gap-1 min-w-[220px]">
            <h1 className="m-0 text-[22px] font-bold tracking-tight" style={{ color: TEXTO_PRIMARIO }}>Agenda</h1>
            <p className="m-0 text-[13.5px]" style={{ color: TEXTO_SECUNDARIO }}>Tareas de seguimiento con clientes, agrupadas por urgencia.</p>
          </div>
          <div className="flex rounded-[9px] p-[3px]" style={{ backgroundColor: 'var(--line)' }}>
            {(['agenda', 'lista', 'calendario'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVista(v)}
                className="px-3.5 py-1.5 rounded-[7px] text-[12.5px] font-semibold whitespace-nowrap"
                style={vista === v ? { color: 'var(--fg)', backgroundColor: 'var(--surface)', boxShadow: '0 1px 2px rgba(16,24,40,.12)' } : { color: 'var(--fg-3)' }}
              >
                {v === 'agenda' ? 'Vista agenda' : v === 'lista' ? 'Vista lista' : 'Vista calendario'}
              </button>
            ))}
          </div>
          {esAdmin && (
            <button onClick={() => setCreando(true)} className="flex items-center gap-1.5 text-[13px] font-semibold rounded-lg px-3.5 shrink-0" style={{ height: 36, backgroundColor: TEAL, color: 'var(--accent-fg)' }}>
              <Plus size={14} />Nueva actividad
            </button>
          )}
          <button onClick={() => setSoloPendientes(!soloPendientes)} className="flex items-center gap-2.5 shrink-0">
            <span className="text-[13px] font-semibold" style={{ color: 'var(--fg)' }}>Solo pendientes</span>
            <span className="rounded-full relative transition-colors" style={{ width: 38, height: 22, backgroundColor: soloPendientes ? TEAL : 'var(--line-2)' }}>
              <span className="absolute rounded-full bg-[var(--surface)] transition-all" style={{ top: 2, left: soloPendientes ? 18 : 2, width: 18, height: 18, boxShadow: '0 1px 3px rgba(16,24,40,.3)' }} />
            </span>
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([
            { key: 'todas' as const, label: 'Todas las pendientes', tono: 'neutral' as const },
            { key: 'atrasada' as const, label: 'Atrasadas', tono: 'rojo' as const },
            { key: 'hoy' as const, label: 'Vencen hoy', tono: 'teal' as const },
            { key: 'semana' as const, label: 'Esta semana', tono: 'neutral' as const },
          ]).map((s) => {
            const activo = alcance === s.key;
            const acento = s.tono === 'rojo' ? 'var(--bad)' : s.tono === 'teal' ? 'var(--accent)' : NAVY;
            const fondoActivo = s.tono === 'rojo' ? 'var(--bad-soft)' : s.tono === 'teal' ? '#F2FAFB' : '#F5F8FC';
            const bordeActivo = s.tono === 'rojo' ? 'var(--bad-soft)' : s.tono === 'teal' ? 'var(--line-2)' : '#CBD8EA';
            return (
              <button
                key={s.key}
                onClick={() => setAlcance(s.key)}
                className="flex flex-col gap-1 rounded-xl px-3.5 py-3 text-left"
                style={{ backgroundColor: activo ? fondoActivo : 'var(--surface)', border: `1.5px solid ${activo ? bordeActivo : BORDE}` }}
              >
                <span className="text-[12.5px] font-semibold" style={{ color: activo ? acento : TEXTO_SECUNDARIO }}>{s.label}</span>
                <span className="text-[26px] font-bold tracking-tight" style={{ color: acento }}>{contadores[s.key]}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 flex-wrap" style={{ backgroundColor: 'var(--surface)', border: `1px solid ${BORDE}`, boxShadow: SOMBRA_CARD }}>
          <span className="text-[11px] font-bold tracking-wider uppercase" style={{ color: TEXTO_TERCIARIO }}>Responsable</span>
          <div className="flex gap-1.5 flex-wrap">
            {responsables.map((r) => {
              const activo = responsable === r;
              return (
                <button
                  key={r}
                  onClick={() => setResponsable(r)}
                  className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold"
                  style={activo ? { backgroundColor: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--line-2)' } : { backgroundColor: 'var(--surface)', color: 'var(--fg-3)', border: '1px solid var(--line)' }}
                >
                  {r === 'todos' ? 'Todos' : r}
                </button>
              );
            })}
          </div>
        </div>

        {vista === 'agenda' && (
          <div className="flex flex-col gap-4">
            {grupos.length === 0 && <ListaVacia onLimpiar={() => { setAlcance('todas'); setResponsable('todos'); }} />}
            {grupos.map((g) => (
              <div key={g.clave} className="flex flex-col gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: g.meta.punto }} />
                  <span className="text-[13px] font-bold" style={{ color: g.meta.colorTitulo }}>{g.meta.titulo}</span>
                  <span className="text-xs" style={{ color: TEXTO_TERCIARIO }}>{g.items.length} {g.items.length === 1 ? 'tarea' : 'tareas'}</span>
                  <span className="flex-1 h-px" style={{ backgroundColor: BORDE }} />
                </div>
                <div className="rounded-xl overflow-hidden shrink-0" style={{ backgroundColor: 'var(--surface)', border: `1px solid ${g.meta.borde}`, boxShadow: SOMBRA_CARD }}>
                  {g.items.map((t) => filaTarea(t, 'agrupada'))}
                </div>
              </div>
            ))}
          </div>
        )}

        {vista === 'lista' && (
          <div className="rounded-xl overflow-x-auto shrink-0" style={{ backgroundColor: 'var(--surface)', border: `1px solid ${BORDE}`, boxShadow: SOMBRA_CARD }}>
            <div style={{ minWidth: 720 }}>
              <div className="grid gap-3 px-4 py-2.5 text-[11px] font-bold tracking-wider uppercase" style={{ gridTemplateColumns: '26px 2fr 1.5fr 1.3fr 1fr 170px', backgroundColor: 'var(--surface-2)', borderBottom: `1px solid ${BORDE}`, color: TEXTO_TERCIARIO }}>
                <span /><span>Tarea</span><span>Cliente</span><span>Vencimiento</span><span>Responsable</span><span />
              </div>
              {visibles.length === 0 ? <ListaVacia onLimpiar={() => { setAlcance('todas'); setResponsable('todos'); }} /> : visibles.map((t) => filaTarea(t, 'lista'))}
            </div>
          </div>
        )}

        {vista === 'calendario' && (
          <div className="rounded-xl overflow-x-auto shrink-0" style={{ backgroundColor: 'var(--surface)', border: `1px solid ${BORDE}`, boxShadow: SOMBRA_CARD }}>
            <div style={{ minWidth: 640 }}>
            <div className="flex items-center gap-3 px-4 py-3 flex-wrap" style={{ borderBottom: `1px solid ${BORDE}` }}>
              <span className="text-[15px] font-bold tracking-tight" style={{ color: TEXTO_PRIMARIO }}>{nombreMesCap}</span>
              <div className="flex gap-1.5">
                <button onClick={() => setMesVisto((m) => { const d = new Date(m); d.setMonth(d.getMonth() - 1); return d; })} className="w-[30px] h-[30px] rounded-lg flex items-center justify-center" style={{ border: `1px solid ${BORDE}` }}>
                  <ChevronLeft size={14} color={TEXTO_SECUNDARIO} />
                </button>
                <button onClick={() => setMesVisto((m) => { const d = new Date(m); d.setMonth(d.getMonth() + 1); return d; })} className="w-[30px] h-[30px] rounded-lg flex items-center justify-center" style={{ border: `1px solid ${BORDE}` }}>
                  <ChevronRight size={14} color={TEXTO_SECUNDARIO} />
                </button>
              </div>
              <button onClick={() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); setMesVisto(d); }} className="text-[12.5px] font-semibold rounded-lg px-3 py-1.5" style={{ border: `1px solid ${BORDE}`, color: 'var(--fg)' }}>Hoy</button>
              <div className="flex-1" />
              <div className="flex items-center gap-3.5 text-[11.5px]" style={{ color: TEXTO_SECUNDARIO }}>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ backgroundColor: 'var(--bad)' }} />Atrasada</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ backgroundColor: TEAL }} />Hoy</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ backgroundColor: 'var(--accent-2)' }} />Próximas</span>
              </div>
            </div>
            <div className="grid grid-cols-7" style={{ backgroundColor: 'var(--surface-2)', borderBottom: `1px solid ${BORDE}` }}>
              {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => (
                <span key={d} className="px-3 py-2 text-[11px] font-bold tracking-wider uppercase" style={{ color: TEXTO_TERCIARIO }}>{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {diasGrilla.map((dia, i) => {
                const enMes = dia.getMonth() === mesVisto.getMonth();
                const esHoy = dia.toDateString() === ahora.toDateString();
                const itemsDia = tareasParaCalendario.filter((t) => t.fecha && new Date(t.fecha).toDateString() === dia.toDateString());
                return (
                  <div key={i} className="flex flex-col gap-1 p-2" style={{ minHeight: 106, borderRight: `1px solid ${BORDE_FILA}`, borderBottom: `1px solid ${BORDE_FILA}`, backgroundColor: esHoy ? '#F6FBFC' : enMes ? 'var(--surface)' : 'var(--surface-2)' }}>
                    <span
                      className="self-start text-xs rounded-full px-1.5"
                      style={{ minWidth: 22, textAlign: 'center', fontWeight: esHoy ? 700 : 600, color: esHoy ? 'var(--surface)' : enMes ? 'var(--fg)' : 'var(--fg-3)', backgroundColor: esHoy ? TEAL : 'transparent' }}
                    >
                      {dia.getDate()}
                    </span>
                    {itemsDia.map((t) => {
                      const cat = categoria(t, ahora);
                      const acento = cat === 'atrasada' ? 'var(--bad)' : cat === 'hoy' ? TEAL : 'var(--accent-2)';
                      return (
                        <div key={t.id} className="flex items-center gap-1.5 rounded px-1.5 py-1" style={{ backgroundColor: t.completada ? 'var(--surface-2)' : cat === 'atrasada' ? 'var(--bad-soft)' : cat === 'hoy' ? '#EAF5F8' : 'var(--surface-2)', borderLeft: `3px solid ${t.completada ? 'var(--line-2)' : acento}` }}>
                          <span className="text-[10.5px] font-bold whitespace-nowrap" style={{ color: t.completada ? 'var(--fg-3)' : acento }}>{new Date(t.fecha!).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}</span>
                          <span className="text-[11px] truncate" style={{ color: t.completada ? 'var(--fg-3)' : 'var(--fg)', textDecoration: t.completada ? 'line-through' : 'none' }}>{t.titulo}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            </div>
          </div>
        )}
      </div>
      {creando && <NuevaActividad onCerrar={() => setCreando(false)} onCreada={() => { setCreando(false); cargar(); }} />}
    </div>
  );
}

function ListaVacia({ onLimpiar }: { onLimpiar: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-11 px-6 text-center rounded-xl" style={{ backgroundColor: 'var(--surface)', border: `1px dashed var(--line-2)` }}>
      <div className="text-[15.5px] font-bold tracking-tight" style={{ color: TEXTO_PRIMARIO }}>Nada por acá</div>
      <div className="text-[13px] max-w-xs" style={{ color: TEXTO_SECUNDARIO }}>No hay tareas con este filtro. Probá con otro responsable o mirá todas las pendientes.</div>
      <button onClick={onLimpiar} className="text-[13.5px] font-semibold rounded-lg px-4 py-2" style={{ backgroundColor: TEAL, color: 'var(--accent-fg)' }}>Ver todas las tareas</button>
    </div>
  );
}
