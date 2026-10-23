import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Columns3, Flame, LayoutGrid, List, MessageSquare, Plus, Search, Target, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { colorAvatar, colorEtiquetaWhatsapp, TEMPERATURA_STYLE, tinte } from '../../lib/tema';
import { Boton, Chip, EncabezadoPagina, EstadoVacio, Tarjeta } from '../../components/ui';
import type { Contacto, EtapaVenta, EtiquetaWhatsapp } from '../../lib/tipos';

interface OportunidadesProps {
  onAbrirChat: (telefono: string) => void;
}

type FiltroFecha = 'todas' | 'hoy' | '7' | '30';

// Rangos de probabilidad de cierre para el filtro (mínimo y máximo, ambos incluidos).
const RANGOS_CIERRE: Record<string, { texto: string; min: number; max: number }> = {
  todos: { texto: 'Cierre: todos', min: 0, max: 100 },
  alta: { texto: 'Cierre: 70% o más', min: 70, max: 100 },
  media: { texto: 'Cierre: 30% a 69%', min: 30, max: 69 },
  baja: { texto: 'Cierre: menos de 30%', min: 0, max: 29 },
};

// Una oportunidad con esta probabilidad o más está "cerca de cerrar".
const UMBRAL_POR_CERRAR = 90;

// Una oportunidad es un contacto con algo de venta en marcha: caliente, con
// probabilidad de cierre o con un monto cargado. Así aparecen también las que se
// crean desde la ficha o al mover un contacto de etapa, no solo las muy calientes.
const FILTRO_OPORTUNIDAD = 'temperatura.eq.caliente,probabilidad_cierre.gt.0,valor_estimado.gt.0';
const esOportunidadAbierta = (c: Contacto) =>
  c.temperatura === 'caliente' || (c.probabilidad_cierre ?? 0) > 0 || (c.valor_estimado ?? 0) > 0;

interface ConversacionResumen {
  contacto_telefono: string;
  agente_asignado_id: string | null;
  ultima_actividad: string;
}

function tiempoRelativo(fecha: string | null): string {
  if (!fecha) return 'sin conversación';
  const min = Math.floor((Date.now() - new Date(fecha).getTime()) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  if (min < 1440) return `hace ${Math.floor(min / 60)} h`;
  return `hace ${Math.floor(min / 1440)} d`;
}

// Una oportunidad es un lead abierto (ni ganado ni perdido) que está caliente
// o con 70% o más de probabilidad de cierre: lo que conviene atender primero.
export default function Oportunidades({ onAbrirChat }: OportunidadesProps) {
  const { usuario } = useAuth();
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [etapas, setEtapas] = useState<EtapaVenta[]>([]);
  const [conversaciones, setConversaciones] = useState<Record<string, ConversacionResumen>>({});
  const [usuarios, setUsuarios] = useState<{ id: string; nombre: string }[]>([]);
  const [etiquetas, setEtiquetas] = useState<Record<string, EtiquetaWhatsapp[]>>({});
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [recarga, setRecarga] = useState(0);
  const [vista, setVista] = useState<'tarjetas' | 'lista' | 'etapas'>('tarjetas');
  const [filtroFecha, setFiltroFecha] = useState<FiltroFecha>('todas');
  const [filtroSeguimiento, setFiltroSeguimiento] = useState(0);
  const [filtroCierre, setFiltroCierre] = useState('todos');
  const [soloPorCerrar, setSoloPorCerrar] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const [candidatos, setCandidatos] = useState<Contacto[]>([]);
  const [busquedaCandidato, setBusquedaCandidato] = useState('');

  useEffect(() => {
    const cargar = async () => {
      const [{ data: cont }, { data: etp }, { data: conv }, { data: usu }, { data: asoc }] = await Promise.all([
        supabase.from('contactos').select('*').or(FILTRO_OPORTUNIDAD).returns<Contacto[]>(),
        supabase.from('etapas_venta').select('*').order('orden').returns<EtapaVenta[]>(),
        supabase.from('conversaciones').select('contacto_telefono, agente_asignado_id, ultima_actividad').order('ultima_actividad', { ascending: false }).returns<ConversacionResumen[]>(),
        supabase.from('usuarios').select('id, nombre').returns<{ id: string; nombre: string }[]>(),
        supabase.from('contacto_etiquetas').select('contacto_id, etiquetas_whatsapp(id, nombre, color, eliminada)').returns<{ contacto_id: string; etiquetas_whatsapp: (EtiquetaWhatsapp & { eliminada: boolean }) | null }[]>(),
      ]);
      setContactos(cont || []);
      setEtapas(etp || []);
      const mapa: Record<string, ConversacionResumen> = {};
      (conv || []).forEach((c) => { if (!mapa[c.contacto_telefono]) mapa[c.contacto_telefono] = c; });
      setConversaciones(mapa);
      setUsuarios(usu || []);
      const et: Record<string, EtiquetaWhatsapp[]> = {};
      (asoc || []).forEach((a) => {
        if (a.etiquetas_whatsapp && !a.etiquetas_whatsapp.eliminada) (et[a.contacto_id] ||= []).push(a.etiquetas_whatsapp);
      });
      setEtiquetas(et);
      setCargando(false);
    };
    cargar();
  }, [usuario?.empresa_id, recarga]);

  // Contactos que todavía no son oportunidad, para sumarlos a mano.
  const abrirAgregar = async () => {
    setAgregando(true);
    setBusquedaCandidato('');
    const { data } = await supabase.from('contactos').select('*').order('actualizado_en', { ascending: false }).limit(500).returns<Contacto[]>();
    setCandidatos((data || []).filter((c) => !esOportunidadAbierta(c)));
  };

  const agregarOportunidad = async (c: Contacto) => {
    await supabase.from('contactos').update({ temperatura: 'caliente', actualizado_en: new Date().toISOString() }).eq('id', c.id);
    setAgregando(false);
    setRecarga((n) => n + 1);
  };

  const tipoEtapa = (c: Contacto) => etapas.find((e) => e.id === c.etapa_id)?.tipo;
  // Días desde la última señal de seguimiento: la última actividad del chat o,
  // si no hay conversación, la última edición de la ficha.
  const diasSinSeguimiento = (c: Contacto) => {
    const ultima = conversaciones[c.telefono]?.ultima_actividad ?? c.actualizado_en;
    return Math.max(0, Math.floor((Date.now() - new Date(ultima).getTime()) / 86400000));
  };
  const abiertas = useMemo(
    () => contactos.filter((c) => tipoEtapa(c) !== 'ganada' && tipoEtapa(c) !== 'perdida'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contactos, etapas],
  );
  const sinSeguimiento3 = abiertas.filter((c) => diasSinSeguimiento(c) >= 3).length;
  const porCerrar = abiertas.filter((c) => (c.probabilidad_cierre ?? 0) >= UMBRAL_POR_CERRAR).length;
  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const desde = filtroFecha === 'todas' ? 0 : filtroFecha === 'hoy' ? new Date().setHours(0, 0, 0, 0) : Date.now() - Number(filtroFecha) * 86400000;
    return abiertas
      .filter((c) => new Date(c.creado_en).getTime() >= desde)
      .filter((c) => !filtroSeguimiento || diasSinSeguimiento(c) >= filtroSeguimiento)
      .filter((c) => !soloPorCerrar || (c.probabilidad_cierre ?? 0) >= UMBRAL_POR_CERRAR)
      .filter((c) => {
        const { min, max } = RANGOS_CIERRE[filtroCierre];
        const p = c.probabilidad_cierre ?? 0;
        return p >= min && p <= max;
      })
      .filter((c) => !q || (c.nombre || '').toLowerCase().includes(q) || c.telefono.includes(q) || (c.producto_interes || '').toLowerCase().includes(q))
      .sort((a, b) => (b.temperatura === 'caliente' ? 1000 : 0) + (b.probabilidad_cierre ?? 0) - ((a.temperatura === 'caliente' ? 1000 : 0) + (a.probabilidad_cierre ?? 0)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abiertas, conversaciones, busqueda, filtroFecha, filtroSeguimiento, filtroCierre, soloPorCerrar]);

  const tarjeta = (c: Contacto) => {
      const conv = conversaciones[c.telefono];
      const etapa = etapas.find((e) => e.id === c.etapa_id);
      const tags = etiquetas[c.id] || [];
      const nombre = c.nombre || c.telefono;
      return (
        <Tarjeta key={c.id} className="p-4 flex flex-col gap-2.5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold text-white shrink-0 disp" style={{ backgroundColor: colorAvatar(c.telefono) }}>{nombre.slice(-2)}</div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-[14.5px] truncate" style={{ color: 'var(--fg)' }}>{nombre}</div>
              <div className="num text-[12px] truncate" style={{ color: 'var(--fg-3)' }}>{c.telefono}</div>
            </div>
            {c.temperatura && <Chip color={TEMPERATURA_STYLE[c.temperatura].color}>{TEMPERATURA_STYLE[c.temperatura].label}</Chip>}
          </div>
          <div className="flex items-end justify-between gap-2">
            <div>
              <div className="disp font-extrabold text-[24px] leading-none" style={{ color: 'var(--fg)' }}>Bs. {(c.valor_estimado || 0).toLocaleString('es-BO')}</div>
              <div className="text-[12px] mt-1" style={{ color: 'var(--fg-2)' }}>{c.producto_interes || 'Sin producto de interés'}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="num font-bold text-[20px]" style={{ color: 'var(--warn)' }}>{c.probabilidad_cierre ?? 0}%</div>
              <div className="text-[11px]" style={{ color: 'var(--fg-3)' }}>de cierre</div>
            </div>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface-2)' }}>
            <div className="h-full rounded-full" style={{ width: `${c.probabilidad_cierre ?? 0}%`, background: 'linear-gradient(90deg, var(--accent-2), var(--accent))' }} />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {etapa && <Chip color={colorEtiquetaWhatsapp(etapa.color)}>{etapa.nombre}</Chip>}
            {tags.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1 rounded-md px-1.5 py-px text-[11px] font-semibold" style={{ backgroundColor: tinte(colorEtiquetaWhatsapp(t.color), 20), color: 'var(--fg)' }}>
                <span className="rounded-full" style={{ width: 7, height: 7, backgroundColor: colorEtiquetaWhatsapp(t.color) }} />{t.nombre}
              </span>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
            <div className="text-[12px] min-w-0 truncate" style={{ color: 'var(--fg-2)' }}>
              {nombreUsuario(conv?.agente_asignado_id)} · {tiempoRelativo(conv?.ultima_actividad ?? null)}
            </div>
            <Boton tamano="sm" icono={MessageSquare} onClick={() => onAbrirChat(c.telefono)}>Abrir chat</Boton>
          </div>
        </Tarjeta>
      );
  };

  const total = lista.reduce((t, c) => t + (c.valor_estimado || 0), 0);
  const ponderado = lista.reduce((t, c) => t + (c.valor_estimado || 0) * ((c.probabilidad_cierre ?? 0) / 100), 0);
  const nombreUsuario = (id: string | null | undefined) => usuarios.find((u) => u.id === id)?.nombre || 'Sin asignar';

  return (
    <div className="flex-1 min-w-0 overflow-y-auto">
      <div className="aparecer px-4 md:px-7 py-5 md:py-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <EncabezadoPagina titulo="Oportunidades" subtitulo="Contactos con una venta en marcha: calientes, con probabilidad de cierre o con un monto. Atiéndelos primero." />
          <Boton variante="primario" icono={Plus} onClick={abrirAgregar}>Agregar contacto</Boton>
        </div>

        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
          <Tarjeta className="px-5 py-4 flex flex-col gap-0.5">
            <span className="text-[13px]" style={{ color: 'var(--fg-2)' }}>Oportunidades abiertas</span>
            <span className="disp font-extrabold text-[38px] leading-[1.1]" style={{ color: 'var(--warn)', letterSpacing: '-.03em' }}>{lista.length}</span>
          </Tarjeta>
          <Tarjeta className="px-5 py-4 flex flex-col gap-0.5">
            <span className="text-[13px]" style={{ color: 'var(--fg-2)' }}>Valor en juego</span>
            <span className="disp font-extrabold text-[38px] leading-[1.1]" style={{ color: 'var(--fg)', letterSpacing: '-.03em' }}>Bs. {total.toLocaleString('es-BO')}</span>
          </Tarjeta>
          <Tarjeta className="px-5 py-4 flex flex-col gap-0.5">
            <span className="text-[13px]" style={{ color: 'var(--fg-2)' }}>Pronóstico ponderado</span>
            <span className="disp font-extrabold text-[38px] leading-[1.1]" style={{ color: 'var(--ok)', letterSpacing: '-.03em' }}>Bs. {Math.round(ponderado).toLocaleString('es-BO')}</span>
          </Tarjeta>
        </div>

        <label className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ maxWidth: 420, backgroundColor: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--fg-3)' }}>
          <Search size={15} className="shrink-0" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre, número o producto" aria-label="Buscar oportunidad" className="bg-transparent outline-none w-full min-w-0 text-[13.5px]" style={{ color: 'var(--fg)' }} />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg p-1" style={{ border: '1px solid var(--line)', backgroundColor: 'var(--surface)' }}>
            {([['tarjetas', 'Tarjetas', LayoutGrid], ['lista', 'Lista', List], ['etapas', 'Por etapa', Columns3]] as const).map(([id, nombre, Icono]) => (
              <button key={id} onClick={() => setVista(id)} aria-pressed={vista === id} className="flex items-center gap-1.5 text-[12.5px] font-semibold rounded-md px-2.5 py-1.5" style={vista === id ? { backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' } : { color: 'var(--fg-2)' }}>
                <Icono size={14} />{nombre}
              </button>
            ))}
          </div>
          <select value={filtroFecha} onChange={(e) => setFiltroFecha(e.target.value as FiltroFecha)} aria-label="Filtrar por fecha de creación" className="rounded-lg px-2.5 text-[12.5px] outline-none cursor-pointer" style={{ height: 36, border: '1px solid var(--line)', backgroundColor: 'var(--surface)', color: 'var(--fg)' }}>
            <option value="todas">Creado: cualquier fecha</option>
            <option value="hoy">Creado: hoy</option>
            <option value="7">Creado: últimos 7 días</option>
            <option value="30">Creado: últimos 30 días</option>
          </select>
          <select value={filtroCierre} onChange={(e) => setFiltroCierre(e.target.value)} aria-label="Filtrar por porcentaje de cierre" className="rounded-lg px-2.5 text-[12.5px] outline-none cursor-pointer" style={{ height: 36, border: `1px solid ${filtroCierre !== 'todos' ? 'var(--accent)' : 'var(--line)'}`, backgroundColor: 'var(--surface)', color: 'var(--fg)' }}>
            {Object.entries(RANGOS_CIERRE).map(([id, r]) => <option key={id} value={id}>{r.texto}</option>)}
          </select>
          <select value={filtroSeguimiento} onChange={(e) => setFiltroSeguimiento(Number(e.target.value))} aria-label="Filtrar por días sin seguimiento" className="rounded-lg px-2.5 text-[12.5px] outline-none cursor-pointer" style={{ height: 36, border: `1px solid ${filtroSeguimiento ? 'var(--warn)' : 'var(--line)'}`, backgroundColor: 'var(--surface)', color: 'var(--fg)' }}>
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

        {cargando ? (
          <div className="text-[13px]" style={{ color: 'var(--fg-3)' }}>Cargando…</div>
        ) : lista.length === 0 ? (
          <Tarjeta className="flex">
            <EstadoVacio icono={Flame} titulo={abiertas.length === 0 ? 'Aún no hay oportunidades' : 'Ninguna oportunidad coincide con los filtros'} texto={abiertas.length === 0 ? 'Carga un monto o una probabilidad de cierre en la pestaña Venta de su ficha, márcalo como "Caliente" o usa «Agregar contacto», y aparecerá aquí.' : 'Cambia o quita algún filtro para verlas.'} />
          </Tarjeta>
        ) : vista === 'tarjetas' ? (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
            {lista.map((c) => tarjeta(c))}
          </div>
        ) : vista === 'lista' ? (
          <Tarjeta className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px]" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'var(--fg-3)', borderBottom: '1px solid var(--line)' }}>
                  {['Contacto', 'Producto', 'Etapa', 'Valor', 'Cierre', 'Sin seguimiento', 'Responsable', ''].map((t) => <th key={t} className="font-semibold px-3 py-2.5 whitespace-nowrap">{t}</th>)}
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => {
                  const dias = diasSinSeguimiento(c);
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td className="px-3 py-2.5 font-semibold" style={{ color: 'var(--fg)' }}>{c.nombre || c.telefono}<div className="num text-[11.5px] font-normal" style={{ color: 'var(--fg-3)' }}>{c.telefono}</div></td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--fg-2)' }}>{c.producto_interes || '—'}</td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--fg-2)' }}>{etapas.find((e) => e.id === c.etapa_id)?.nombre || '—'}</td>
                      <td className="px-3 py-2.5 num whitespace-nowrap" style={{ color: 'var(--fg)' }}>Bs. {(c.valor_estimado || 0).toLocaleString('es-BO')}</td>
                      <td className="px-3 py-2.5 num font-bold" style={{ color: 'var(--warn)' }}>{c.probabilidad_cierre ?? 0}%</td>
                      <td className="px-3 py-2.5 num whitespace-nowrap" style={{ color: dias >= 3 ? 'var(--warn)' : 'var(--fg-2)', fontWeight: dias >= 3 ? 700 : 400 }}>{dias} d</td>
                      <td className="px-3 py-2.5" style={{ color: 'var(--fg-2)' }}>{nombreUsuario(conversaciones[c.telefono]?.agente_asignado_id)}</td>
                      <td className="px-3 py-2.5"><Boton tamano="sm" icono={MessageSquare} onClick={() => onAbrirChat(c.telefono)}>Abrir chat</Boton></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Tarjeta>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 items-start">
            {[...etapas].filter((e) => e.tipo === 'normal').sort((a, b) => a.orden - b.orden).map((e) => {
              const deEtapa = lista.filter((c) => c.etapa_id === e.id);
              return (
                <div key={e.id} className="shrink-0 flex flex-col gap-2.5" style={{ width: 310 }}>
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[13px] font-bold" style={{ color: 'var(--fg)' }}>{e.nombre}</span>
                    <span className="num text-[12px]" style={{ color: 'var(--fg-3)' }}>{deEtapa.length} · Bs. {deEtapa.reduce((t, c) => t + (c.valor_estimado || 0), 0).toLocaleString('es-BO')}</span>
                  </div>
                  {deEtapa.length === 0 ? <div className="text-[12px] px-1" style={{ color: 'var(--fg-3)' }}>Sin oportunidades</div> : deEtapa.map((c) => tarjeta(c))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {agregando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(10,15,25,0.4)' }}>
          <div className="w-full max-w-md rounded-2xl p-5 flex flex-col gap-3" style={{ backgroundColor: 'var(--surface)' }}>
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-bold tracking-tight" style={{ color: 'var(--fg)' }}>Agregar a oportunidades</span>
              <button onClick={() => setAgregando(false)} aria-label="Cerrar"><X size={16} color="var(--fg-2)" /></button>
            </div>
            <p className="m-0 text-[12.5px]" style={{ color: 'var(--fg-2)' }}>Elige un contacto: se marcará como «Caliente» y aparecerá aquí.</p>
            <input
              autoFocus
              value={busquedaCandidato}
              onChange={(e) => setBusquedaCandidato(e.target.value)}
              placeholder="Buscar por nombre o número"
              className="rounded-lg px-2.5 outline-none text-[13.5px]"
              style={{ height: 38, border: '1px solid var(--line)', color: 'var(--fg)' }}
            />
            <div className="flex flex-col max-h-[50vh] overflow-y-auto">
              {candidatos
                .filter((c) => {
                  const q = busquedaCandidato.trim().toLowerCase();
                  return !q || (c.nombre || '').toLowerCase().includes(q) || c.telefono.includes(q);
                })
                .slice(0, 50)
                .map((c) => (
                  <button key={c.id} onClick={() => agregarOportunidad(c)} className="flex items-center justify-between gap-2 text-left rounded-lg px-2.5 py-2" style={{ color: 'var(--fg)' }}>
                    <span className="text-[13.5px] font-medium truncate">{c.nombre || c.telefono}</span>
                    <span className="num text-[12px] shrink-0" style={{ color: 'var(--fg-3)' }}>{c.telefono}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
