import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Columns3, Flame, LayoutGrid, List, MessageSquare, Plus, Search, Target, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { colorAvatar, TEMPERATURA_STYLE } from '../../lib/tema';
import { Boton, Chip, EncabezadoPagina, EstadoVacio, Tarjeta } from '../../components/ui';
import type { Contacto, EtapaVenta, Oportunidad, Temperatura } from '../../lib/tipos';
import TarjetaOportunidad from './TarjetaOportunidad';
import { useMotivoPerdida } from './useMotivoPerdida';
import { EVENTO_OPORTUNIDADES, actualizarOportunidad, cerrarOportunidad, crearOportunidad, eliminarOportunidad, reabrirOportunidad } from './oportunidadesApi';

interface OportunidadesProps {
  onAbrirChat: (telefono: string) => void;
}

interface ContactoResumen {
  nombre: string | null;
  telefono: string;
  temperatura: Temperatura | null;
  etapa_id: string | null;
  actualizado_en: string;
}
type Fila = Oportunidad & { contactos: ContactoResumen | null };

interface ConversacionResumen {
  contacto_telefono: string;
  agente_asignado_id: string | null;
  ultima_actividad: string;
}

type FiltroFecha = 'todas' | 'hoy' | '7' | '30';
type FiltroHistorial = 'todas' | 'ganada' | 'perdida';

// Una oportunidad con esta probabilidad o más está "cerca de cerrar".
const UMBRAL_POR_CERRAR = 90;

// Rangos de probabilidad de cierre para el filtro (mínimo y máximo, ambos incluidos).
const RANGOS_CIERRE: Record<string, { texto: string; min: number; max: number }> = {
  todos: { texto: 'Cierre: todos', min: 0, max: 100 },
  alta: { texto: 'Cierre: 70% o más', min: 70, max: 100 },
  media: { texto: 'Cierre: 30% a 69%', min: 30, max: 69 },
  baja: { texto: 'Cierre: menos de 30%', min: 0, max: 29 },
};

function tiempoRelativo(fecha: string | null): string {
  if (!fecha) return 'sin conversación';
  const min = Math.floor((Date.now() - new Date(fecha).getTime()) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  if (min < 1440) return `hace ${Math.floor(min / 60)} h`;
  return `hace ${Math.floor(min / 1440)} d`;
}

const dinero = (n: number) => `Bs. ${Math.round(n).toLocaleString('es-BO')}`;
const selector = { height: 36, border: '1px solid var(--line)', backgroundColor: 'var(--surface)', color: 'var(--fg)' } as const;

// Las ventas posibles de la empresa: cada tarjeta es una oportunidad (un
// contacto puede tener varias), se edita ahí mismo y se cierra como ganada o
// perdida. Las cerradas quedan en el historial.
export default function Oportunidades({ onAbrirChat }: OportunidadesProps) {
  const { usuario } = useAuth();
  const [filas, setFilas] = useState<Fila[]>([]);
  const [etapas, setEtapas] = useState<EtapaVenta[]>([]);
  const [conversaciones, setConversaciones] = useState<Record<string, ConversacionResumen>>({});
  const [usuarios, setUsuarios] = useState<{ id: string; nombre: string }[]>([]);
  const [cargando, setCargando] = useState(true);
  const [pestana, setPestana] = useState<'abiertas' | 'historial'>('abiertas');
  const [vista, setVista] = useState<'tarjetas' | 'lista' | 'etapas'>('tarjetas');
  const [busqueda, setBusqueda] = useState('');
  const [filtroFecha, setFiltroFecha] = useState<FiltroFecha>('todas');
  const [filtroSeguimiento, setFiltroSeguimiento] = useState(0);
  const [filtroCierre, setFiltroCierre] = useState('todos');
  const [soloPorCerrar, setSoloPorCerrar] = useState(false);
  const [filtroHistorial, setFiltroHistorial] = useState<FiltroHistorial>('todas');
  const [agregando, setAgregando] = useState(false);
  const { pedirMotivo, motivos, dialogo } = useMotivoPerdida();

  const cargar = useCallback(async () => {
    const [{ data: ops }, { data: etp }, { data: conv }, { data: usu }] = await Promise.all([
      supabase.from('oportunidades').select('*, contactos(nombre, telefono, temperatura, etapa_id, actualizado_en)').order('creado_en', { ascending: false }).returns<Fila[]>(),
      supabase.from('etapas_venta').select('*').order('orden').returns<EtapaVenta[]>(),
      supabase.from('conversaciones').select('contacto_telefono, agente_asignado_id, ultima_actividad').order('ultima_actividad', { ascending: false }).returns<ConversacionResumen[]>(),
      supabase.from('usuarios').select('id, nombre').returns<{ id: string; nombre: string }[]>(),
    ]);
    setFilas(ops || []);
    setEtapas(etp || []);
    const mapa: Record<string, ConversacionResumen> = {};
    (conv || []).forEach((c) => { if (!mapa[c.contacto_telefono]) mapa[c.contacto_telefono] = c; });
    setConversaciones(mapa);
    setUsuarios(usu || []);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
    window.addEventListener(EVENTO_OPORTUNIDADES, cargar);
    const canal = supabase
      .channel(`oportunidades-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'oportunidades' }, () => cargar())
      .subscribe();
    return () => {
      window.removeEventListener(EVENTO_OPORTUNIDADES, cargar);
      supabase.removeChannel(canal);
    };
  }, [cargar, usuario?.empresa_id]);

  const nombreUsuario = (id: string | null | undefined) => usuarios.find((u) => u.id === id)?.nombre || 'Sin asignar';
  const diasSinSeguimiento = (f: Fila) => {
    const tel = f.contactos?.telefono;
    const ultima = (tel && conversaciones[tel]?.ultima_actividad) || f.contactos?.actualizado_en || f.actualizado_en;
    return Math.max(0, Math.floor((Date.now() - new Date(ultima).getTime()) / 86400000));
  };

  const abiertas = useMemo(() => filas.filter((f) => f.estado === 'abierta'), [filas]);
  const cerradas = useMemo(() => filas.filter((f) => f.estado !== 'abierta'), [filas]);
  const sinSeguimiento3 = abiertas.filter((f) => diasSinSeguimiento(f) >= 3).length;
  const porCerrar = abiertas.filter((f) => f.probabilidad >= UMBRAL_POR_CERRAR).length;

  const coincideBusqueda = (f: Fila) => {
    const q = busqueda.trim().toLowerCase();
    return !q || (f.contactos?.nombre || '').toLowerCase().includes(q) || (f.contactos?.telefono || '').includes(q) || (f.producto || '').toLowerCase().includes(q);
  };

  const lista = useMemo(() => {
    const desde = filtroFecha === 'todas' ? 0 : filtroFecha === 'hoy' ? new Date().setHours(0, 0, 0, 0) : Date.now() - Number(filtroFecha) * 86400000;
    const { min, max } = RANGOS_CIERRE[filtroCierre];
    return abiertas
      .filter(coincideBusqueda)
      .filter((f) => new Date(f.creado_en).getTime() >= desde)
      .filter((f) => !filtroSeguimiento || diasSinSeguimiento(f) >= filtroSeguimiento)
      .filter((f) => !soloPorCerrar || f.probabilidad >= UMBRAL_POR_CERRAR)
      .filter((f) => f.probabilidad >= min && f.probabilidad <= max)
      .sort((a, b) => (b.contactos?.temperatura === 'caliente' ? 1000 : 0) + b.probabilidad - ((a.contactos?.temperatura === 'caliente' ? 1000 : 0) + a.probabilidad));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abiertas, conversaciones, busqueda, filtroFecha, filtroSeguimiento, filtroCierre, soloPorCerrar]);

  const historial = useMemo(
    () => cerradas.filter(coincideBusqueda).filter((f) => filtroHistorial === 'todas' || f.estado === filtroHistorial).sort((a, b) => (b.cerrada_en || '').localeCompare(a.cerrada_en || '')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cerradas, busqueda, filtroHistorial],
  );

  const valorAbierto = lista.reduce((t, f) => t + Number(f.monto), 0);
  const ponderado = lista.reduce((t, f) => t + Number(f.monto) * (f.probabilidad / 100), 0);
  const ganadas = cerradas.filter((f) => f.estado === 'ganada');
  const perdidas = cerradas.filter((f) => f.estado === 'perdida');

  const eliminar = async (f: Fila) => {
    if (window.confirm(`¿Eliminar la oportunidad «${f.producto || 'sin producto'}»? No se puede deshacer.`)) await eliminarOportunidad(f.id);
  };

  const tarjeta = (f: Fila, enHistorial = false) => {
    const nombre = f.contactos?.nombre || f.contactos?.telefono || 'Contacto';
    const tel = f.contactos?.telefono || '';
    const conv = conversaciones[tel];
    return (
      <TarjetaOportunidad
        key={f.id}
        oportunidad={f}
        motivos={motivos}
        cabecera={
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0 disp" style={{ backgroundColor: colorAvatar(tel || f.id) }}>{nombre.slice(-2)}</div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-[14px] truncate" style={{ color: 'var(--fg)' }}>{nombre}</div>
              <div className="num text-[11.5px] truncate" style={{ color: 'var(--fg-3)' }}>{tel}</div>
            </div>
            {f.contactos?.temperatura && !enHistorial && <Chip color={TEMPERATURA_STYLE[f.contactos.temperatura].color}>{TEMPERATURA_STYLE[f.contactos.temperatura].label}</Chip>}
          </div>
        }
        pie={
          <div className="flex items-center justify-between gap-2 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
            <div className="text-[12px] min-w-0 truncate" style={{ color: 'var(--fg-2)' }}>
              {nombreUsuario(conv?.agente_asignado_id)} · {tiempoRelativo(conv?.ultima_actividad ?? null)}
            </div>
            <Boton tamano="sm" icono={MessageSquare} onClick={() => onAbrirChat(tel)}>Abrir chat</Boton>
          </div>
        }
        onGuardar={(c) => actualizarOportunidad(f.id, c)}
        onGanada={() => cerrarOportunidad(f.id, 'ganada')}
        onPerdida={() => pedirMotivo((motivoId) => cerrarOportunidad(f.id, 'perdida', motivoId))}
        onReabrir={() => reabrirOportunidad(f.id)}
        onEliminar={() => eliminar(f)}
      />
    );
  };

  return (
    <div className="flex-1 min-w-0 overflow-y-auto">
      <div className="aparecer px-4 md:px-7 py-5 md:py-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <EncabezadoPagina titulo="Oportunidades" subtitulo="Las ventas posibles con tus contactos. Edítalas aquí mismo y ciérralas como ganadas o perdidas." />
          <Boton variante="primario" icono={Plus} onClick={() => setAgregando(true)}>Agregar oportunidad</Boton>
        </div>

        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
          {pestana === 'abiertas' ? (
            <>
              <Tarjeta className="px-5 py-4 flex flex-col gap-0.5">
                <span className="text-[13px]" style={{ color: 'var(--fg-2)' }}>Oportunidades abiertas</span>
                <span className="disp font-extrabold text-[38px] leading-[1.1]" style={{ color: 'var(--warn)', letterSpacing: '-.03em' }}>{lista.length}</span>
              </Tarjeta>
              <Tarjeta className="px-5 py-4 flex flex-col gap-0.5">
                <span className="text-[13px]" style={{ color: 'var(--fg-2)' }}>Valor en juego</span>
                <span className="disp font-extrabold text-[38px] leading-[1.1]" style={{ color: 'var(--fg)', letterSpacing: '-.03em' }}>{dinero(valorAbierto)}</span>
              </Tarjeta>
              <Tarjeta className="px-5 py-4 flex flex-col gap-0.5">
                <span className="text-[13px]" style={{ color: 'var(--fg-2)' }}>Pronóstico ponderado</span>
                <span className="disp font-extrabold text-[38px] leading-[1.1]" style={{ color: 'var(--ok)', letterSpacing: '-.03em' }}>{dinero(ponderado)}</span>
              </Tarjeta>
            </>
          ) : (
            <>
              <Tarjeta className="px-5 py-4 flex flex-col gap-0.5">
                <span className="text-[13px]" style={{ color: 'var(--fg-2)' }}>Ganadas</span>
                <span className="disp font-extrabold text-[38px] leading-[1.1]" style={{ color: 'var(--ok)', letterSpacing: '-.03em' }}>{ganadas.length}</span>
                <span className="num text-[12px]" style={{ color: 'var(--fg-3)' }}>{dinero(ganadas.reduce((t, f) => t + Number(f.monto), 0))}</span>
              </Tarjeta>
              <Tarjeta className="px-5 py-4 flex flex-col gap-0.5">
                <span className="text-[13px]" style={{ color: 'var(--fg-2)' }}>Perdidas</span>
                <span className="disp font-extrabold text-[38px] leading-[1.1]" style={{ color: 'var(--bad)', letterSpacing: '-.03em' }}>{perdidas.length}</span>
                <span className="num text-[12px]" style={{ color: 'var(--fg-3)' }}>{dinero(perdidas.reduce((t, f) => t + Number(f.monto), 0))}</span>
              </Tarjeta>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center rounded-lg p-1" style={{ border: '1px solid var(--line)', backgroundColor: 'var(--surface)' }}>
            {([['abiertas', `Abiertas (${abiertas.length})`], ['historial', `Historial (${cerradas.length})`]] as const).map(([id, nombre]) => (
              <button key={id} onClick={() => setPestana(id)} aria-pressed={pestana === id} className="text-[12.5px] font-semibold rounded-md px-3 py-1.5" style={pestana === id ? { backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' } : { color: 'var(--fg-2)' }}>
                {nombre}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 rounded-xl px-3 py-2 flex-1" style={{ minWidth: 220, maxWidth: 420, backgroundColor: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--fg-3)' }}>
            <Search size={15} className="shrink-0" />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre, número o producto" aria-label="Buscar oportunidad" className="bg-transparent outline-none w-full min-w-0 text-[13.5px]" style={{ color: 'var(--fg)' }} />
          </label>
        </div>

        {pestana === 'abiertas' && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded-lg p-1" style={{ border: '1px solid var(--line)', backgroundColor: 'var(--surface)' }}>
                {([['tarjetas', 'Tarjetas', LayoutGrid], ['lista', 'Lista', List], ['etapas', 'Por etapa', Columns3]] as const).map(([id, nombre, Icono]) => (
                  <button key={id} onClick={() => setVista(id)} aria-pressed={vista === id} className="flex items-center gap-1.5 text-[12.5px] font-semibold rounded-md px-2.5 py-1.5" style={vista === id ? { backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' } : { color: 'var(--fg-2)' }}>
                    <Icono size={14} />{nombre}
                  </button>
                ))}
              </div>
              <select value={filtroFecha} onChange={(e) => setFiltroFecha(e.target.value as FiltroFecha)} aria-label="Filtrar por fecha de creación" className="rounded-lg px-2.5 text-[12.5px] outline-none cursor-pointer" style={selector}>
                <option value="todas">Creada: cualquier fecha</option>
                <option value="hoy">Creada: hoy</option>
                <option value="7">Creada: últimos 7 días</option>
                <option value="30">Creada: últimos 30 días</option>
              </select>
              <select value={filtroCierre} onChange={(e) => setFiltroCierre(e.target.value)} aria-label="Filtrar por porcentaje de cierre" className="rounded-lg px-2.5 text-[12.5px] outline-none cursor-pointer" style={{ ...selector, border: `1px solid ${filtroCierre !== 'todos' ? 'var(--accent)' : 'var(--line)'}` }}>
                {Object.entries(RANGOS_CIERRE).map(([id, r]) => <option key={id} value={id}>{r.texto}</option>)}
              </select>
              <select value={filtroSeguimiento} onChange={(e) => setFiltroSeguimiento(Number(e.target.value))} aria-label="Filtrar por días sin seguimiento" className="rounded-lg px-2.5 text-[12.5px] outline-none cursor-pointer" style={{ ...selector, border: `1px solid ${filtroSeguimiento ? 'var(--warn)' : 'var(--line)'}` }}>
                <option value={0}>Seguimiento: todos</option>
                <option value={3}>Sin seguimiento 3+ días</option>
                <option value={7}>Sin seguimiento 7+ días</option>
                <option value={14}>Sin seguimiento 14+ días</option>
              </select>
            </div>

            {!cargando && (sinSeguimiento3 > 0 || porCerrar > 0) && (
              <div className="flex flex-wrap gap-2">
                {porCerrar > 0 && (
                  <button onClick={() => setSoloPorCerrar((v) => !v)} aria-pressed={soloPorCerrar} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-semibold" style={{ backgroundColor: 'var(--surface-2)', color: 'var(--ok)', border: `1px solid ${soloPorCerrar ? 'var(--ok)' : 'transparent'}` }}>
                    <Target size={14} />{porCerrar} cerca de cerrar (≥ {UMBRAL_POR_CERRAR}%)
                  </button>
                )}
                {sinSeguimiento3 > 0 && (
                  <button onClick={() => setFiltroSeguimiento(filtroSeguimiento === 3 ? 0 : 3)} aria-pressed={filtroSeguimiento === 3} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-semibold" style={{ backgroundColor: 'var(--warn-soft)', color: 'var(--warn)', border: `1px solid ${filtroSeguimiento === 3 ? 'var(--warn)' : 'transparent'}` }}>
                    <AlertTriangle size={14} />{sinSeguimiento3} sin seguimiento hace 3+ días
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {pestana === 'historial' && (
          <div className="flex gap-1.5">
            {([['todas', 'Todas'], ['ganada', 'Ganadas'], ['perdida', 'Perdidas']] as const).map(([id, nombre]) => (
              <button key={id} onClick={() => setFiltroHistorial(id)} aria-pressed={filtroHistorial === id} className="rounded-full px-3 py-1 text-[12.5px] font-semibold" style={filtroHistorial === id ? { backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' } : { border: '1px solid var(--line)', color: 'var(--fg-2)' }}>
                {nombre}
              </button>
            ))}
          </div>
        )}

        {cargando ? (
          <div className="text-[13px]" style={{ color: 'var(--fg-3)' }}>Cargando…</div>
        ) : pestana === 'historial' ? (
          historial.length === 0 ? (
            <Tarjeta className="flex"><EstadoVacio icono={Flame} titulo="Todavía no hay oportunidades cerradas" texto="Cuando marques una oportunidad como ganada o perdida, quedará aquí." /></Tarjeta>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>{historial.map((f) => tarjeta(f, true))}</div>
          )
        ) : lista.length === 0 ? (
          <Tarjeta className="flex">
            <EstadoVacio
              icono={Flame}
              titulo={abiertas.length === 0 ? 'Aún no hay oportunidades' : 'Ninguna oportunidad coincide con los filtros'}
              texto={abiertas.length === 0 ? 'Usa «Agregar oportunidad» o créalas desde la pestaña Venta de la ficha de un contacto.' : 'Cambia o quita algún filtro para verlas.'}
            />
          </Tarjeta>
        ) : vista === 'tarjetas' ? (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>{lista.map((f) => tarjeta(f))}</div>
        ) : vista === 'lista' ? (
          <Tarjeta className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px]" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'var(--fg-3)', borderBottom: '1px solid var(--line)' }}>
                  {['Contacto', 'Producto', 'Etapa', 'Monto', 'Cierre', 'Sin seguimiento', 'Responsable', ''].map((t) => <th key={t} className="font-semibold px-3 py-2.5 whitespace-nowrap">{t}</th>)}
                </tr>
              </thead>
              <tbody>
                {lista.map((f) => {
                  const dias = diasSinSeguimiento(f);
                  const tel = f.contactos?.telefono || '';
                  return (
                    <tr key={f.id} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td className="px-3 py-2.5 font-semibold" style={{ color: 'var(--fg)' }}>{f.contactos?.nombre || tel}<div className="num text-[11.5px] font-normal" style={{ color: 'var(--fg-3)' }}>{tel}</div></td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--fg-2)' }}>{f.producto || '—'}</td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--fg-2)' }}>{etapas.find((e) => e.id === f.contactos?.etapa_id)?.nombre || '—'}</td>
                      <td className="px-3 py-2.5 num whitespace-nowrap" style={{ color: 'var(--fg)' }}>{dinero(Number(f.monto))}</td>
                      <td className="px-3 py-2.5 num font-bold" style={{ color: 'var(--warn)' }}>{f.probabilidad}%</td>
                      <td className="px-3 py-2.5 num whitespace-nowrap" style={{ color: dias >= 3 ? 'var(--warn)' : 'var(--fg-2)', fontWeight: dias >= 3 ? 700 : 400 }}>{dias} d</td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--fg-2)' }}>{nombreUsuario(conversaciones[tel]?.agente_asignado_id)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <Boton tamano="sm" onClick={() => cerrarOportunidad(f.id, 'ganada')}>Ganada</Boton>
                          <Boton tamano="sm" variante="peligro" onClick={() => pedirMotivo((motivoId) => cerrarOportunidad(f.id, 'perdida', motivoId))}>Perdida</Boton>
                          <Boton tamano="sm" icono={MessageSquare} onClick={() => onAbrirChat(tel)}>Chat</Boton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Tarjeta>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 items-start">
            {[...etapas].filter((e) => e.tipo === 'normal').sort((a, b) => a.orden - b.orden).map((e) => {
              const deEtapa = lista.filter((f) => f.contactos?.etapa_id === e.id);
              return (
                <div key={e.id} className="shrink-0 flex flex-col gap-2.5" style={{ width: 310 }}>
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[13px] font-bold" style={{ color: 'var(--fg)' }}>{e.nombre}</span>
                    <span className="num text-[12px]" style={{ color: 'var(--fg-3)' }}>{deEtapa.length} · {dinero(deEtapa.reduce((t, f) => t + Number(f.monto), 0))}</span>
                  </div>
                  {deEtapa.length === 0 ? <div className="text-[12px] px-1" style={{ color: 'var(--fg-3)' }}>Sin oportunidades</div> : deEtapa.map((f) => tarjeta(f))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {agregando && usuario && <NuevaOportunidad empresaId={usuario.empresa_id} usuarioId={usuario.id} onCerrar={() => setAgregando(false)} />}
      {dialogo}
    </div>
  );
}

// Elegir un contacto y crearle una oportunidad.
function NuevaOportunidad({ empresaId, usuarioId, onCerrar }: { empresaId: string; usuarioId: string; onCerrar: () => void }) {
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [elegido, setElegido] = useState<Contacto | null>(null);
  const [producto, setProducto] = useState('');
  const [monto, setMonto] = useState('');
  const [prob, setProb] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('contactos').select('*').order('actualizado_en', { ascending: false }).limit(500).returns<Contacto[]>().then(({ data }) => setContactos(data || []));
  }, []);

  const crear = async () => {
    if (!elegido) return;
    const ok = await crearOportunidad(empresaId, elegido.id, usuarioId, { producto, monto: Number(monto) || 0, probabilidad: Number(prob) || 0 });
    if (!ok) return setError('No se pudo crear la oportunidad.');
    onCerrar();
  };

  const q = busqueda.trim().toLowerCase();
  const entrada = { border: '1px solid var(--line)', color: 'var(--fg)', height: 38 } as const;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(10,15,25,0.4)' }}>
      <div className="w-full max-w-md rounded-2xl p-5 flex flex-col gap-3" style={{ backgroundColor: 'var(--surface)' }}>
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-bold tracking-tight" style={{ color: 'var(--fg)' }}>Agregar oportunidad</span>
          <button onClick={onCerrar} aria-label="Cerrar"><X size={16} color="var(--fg-2)" /></button>
        </div>
        {!elegido ? (
          <>
            <input autoFocus value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar contacto por nombre o número" className="rounded-lg px-2.5 outline-none text-[13.5px]" style={entrada} />
            <div className="flex flex-col max-h-[50vh] overflow-y-auto">
              {contactos
                .filter((c) => !q || (c.nombre || '').toLowerCase().includes(q) || c.telefono.includes(q))
                .slice(0, 50)
                .map((c) => (
                  <button key={c.id} onClick={() => setElegido(c)} className="flex items-center justify-between gap-2 text-left rounded-lg px-2.5 py-2" style={{ color: 'var(--fg)' }}>
                    <span className="text-[13.5px] font-medium truncate">{c.nombre || c.telefono}</span>
                    <span className="num text-[12px] shrink-0" style={{ color: 'var(--fg-3)' }}>{c.telefono}</span>
                  </button>
                ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--surface-2)' }}>
              <span className="text-[13.5px] font-semibold truncate" style={{ color: 'var(--fg)' }}>{elegido.nombre || elegido.telefono}</span>
              <button onClick={() => setElegido(null)} className="text-[12px] font-semibold" style={{ color: 'var(--accent)' }}>Cambiar</button>
            </div>
            <input autoFocus value={producto} onChange={(e) => setProducto(e.target.value)} placeholder="Producto o servicio" className="rounded-lg px-2.5 outline-none text-[13.5px]" style={entrada} />
            <div className="grid grid-cols-2 gap-2">
              <input type="number" min={0} value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="Monto (Bs.)" className="rounded-lg px-2.5 outline-none text-[13px] num" style={entrada} />
              <input type="number" min={0} max={100} value={prob} onChange={(e) => setProb(e.target.value)} placeholder="Cierre (%)" className="rounded-lg px-2.5 outline-none text-[13px] num" style={entrada} />
            </div>
            {error && <span className="text-xs" style={{ color: 'var(--bad)' }}>{error}</span>}
            <Boton variante="primario" onClick={crear} className="self-start">Crear oportunidad</Boton>
          </>
        )}
      </div>
    </div>
  );
}
