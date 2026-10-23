import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Clock, FileText, MessageCircle, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { useContacto } from '../bandeja/hooks/useContacto';
import { useEtapasVenta } from '../bandeja/hooks/useEtapasVenta';
import { useCambioEtapa } from '../pipeline/useCambioEtapa';
import { tinte, AMBER, BLUE, BORDE, FONDO_CONTENIDO, SOMBRA_CARD, TEAL, TEMPERATURA_STYLE, TEXTO_PRIMARIO, TEXTO_SECUNDARIO, TEXTO_TERCIARIO, colorAvatar, colorEtiquetaWhatsapp } from '../../lib/tema';
import { FormWhatsapp } from './EscribirWhatsapp';
import type { Contacto, EtiquetaWhatsapp, Nota, RespuestaRapida, Tarea, Temperatura } from '../../lib/tipos';

interface DetalleLeadProps {
  telefono: string;
  // contacto_telefono de su conversación más reciente (puede traer el @lid)
  // y la línea por la que habló, para responder por el mismo lado.
  telefonoChat?: string;
  lineaSugerida?: string | null;
  onVolver: () => void;
  onAbrirChat?: (telefono: string) => void;
}

function Card({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4 flex flex-col gap-3" style={{ backgroundColor: 'var(--surface)', border: `1px solid ${BORDE}`, boxShadow: SOMBRA_CARD }}>
      <span className="text-[11px] font-bold tracking-wider uppercase" style={{ color: TEXTO_TERCIARIO }}>{titulo}</span>
      {children}
    </div>
  );
}

function Campo({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[12px]" style={{ color: TEXTO_TERCIARIO }}>{etiqueta}</span>
      <span className="text-[12.5px] font-semibold text-right truncate" style={{ color: TEXTO_PRIMARIO }}>{valor}</span>
    </div>
  );
}

type EventoTimeline = { id: string; tipo: 'nota' | 'tarea'; fecha: string; nota?: Nota; tarea?: Tarea };

export default function DetalleLead({ telefono: telefonoCrudo, telefonoChat, lineaSugerida, onVolver, onAbrirChat }: DetalleLeadProps) {
  const telefono = telefonoCrudo.split('@')[0];
  const { usuario } = useAuth();
  const { contacto, cargando, setContacto } = useContacto(telefono, usuario?.empresa_id);
  const etapas = useEtapasVenta(usuario?.empresa_id);
  const { cambiarEtapa, dialogo: dialogoEtapa } = useCambioEtapa(etapas);
  const [notas, setNotas] = useState<Nota[]>([]);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [etiquetas, setEtiquetas] = useState<EtiquetaWhatsapp[]>([]);
  const [respuestasRapidas, setRespuestasRapidas] = useState<RespuestaRapida[]>([]);
  const [notaBorrador, setNotaBorrador] = useState('');
  const [mensajeWhatsapp, setMensajeWhatsapp] = useState('');
  const [valorEstimado, setValorEstimado] = useState('');
  const [probabilidadCierre, setProbabilidadCierre] = useState('');
  const [oportunidadGuardada, setOportunidadGuardada] = useState(false);
  const [errorOportunidad, setErrorOportunidad] = useState('');
  const [nombreBorrador, setNombreBorrador] = useState('');
  const [nombreGuardado, setNombreGuardado] = useState(false);
  const [errorNombre, setErrorNombre] = useState('');

  const cargarNotas = async (contactoId: string) => {
    const { data } = await supabase.from('notas').select('*, usuarios(nombre)').eq('contacto_id', contactoId).order('creado_en', { ascending: false }).returns<Nota[]>();
    setNotas(data || []);
  };
  const cargarTareas = async (contactoId: string) => {
    const { data } = await supabase.from('tareas').select('*').eq('contacto_id', contactoId).order('fecha', { ascending: false }).returns<Tarea[]>();
    setTareas(data || []);
  };
  const cargarEtiquetas = async (contactoId: string) => {
    const { data } = await supabase
      .from('contacto_etiquetas')
      .select('etiquetas_whatsapp(id, nombre, color, eliminada)')
      .eq('contacto_id', contactoId)
      .returns<{ etiquetas_whatsapp: EtiquetaWhatsapp & { eliminada: boolean } }[]>();
    setEtiquetas((data || []).map((fila) => fila.etiquetas_whatsapp).filter((e) => e && !e.eliminada));
  };

  useEffect(() => {
    if (!contacto?.id) return;
    cargarNotas(contacto.id);
    cargarTareas(contacto.id);
    cargarEtiquetas(contacto.id);
    setValorEstimado(contacto.valor_estimado != null ? String(contacto.valor_estimado) : '');
    setProbabilidadCierre(contacto.probabilidad_cierre != null ? String(contacto.probabilidad_cierre) : '');
    setNombreBorrador(contacto.nombre || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacto?.id]);

  useEffect(() => {
    const cargar = async () => {
      const { data } = await supabase.from('respuestas_rapidas').select('*').order('titulo').limit(3).returns<RespuestaRapida[]>();
      setRespuestasRapidas(data || []);
    };
    cargar();
  }, [usuario?.empresa_id]);

  // Devuelve si el update realmente tocó una fila — ver el mismo comentario
  // en PanelContacto.tsx: un vendedor solo puede editar contactos de su
  // propia línea (database/instalar.sql) y RLS bloquea
  // el resto sin tirar error, así que hay que confirmar con `.select()`.
  const actualizarCampo = async (campo: keyof Contacto, valor: string | null): Promise<boolean> => {
    const { data, error } = await supabase
      .from('contactos')
      .update({ [campo]: valor, actualizado_en: new Date().toISOString() })
      .eq('id', contacto!.id)
      .select('id');
    if (error || !data || data.length === 0) return false;
    setContacto((prev) => (prev ? { ...prev, [campo]: valor } : prev));
    // Igual que en PanelContacto.tsx: el header del chat y la lista de
    // conversaciones leen conversaciones.contacto_nombre, no contactos.nombre.
    if (campo === 'nombre') {
      await supabase.from('conversaciones').update({ contacto_nombre: valor || null }).eq('contacto_telefono', telefono);
    }
    return true;
  };

  const guardarNombre = async () => {
    setErrorNombre('');
    const ok = await actualizarCampo('nombre', nombreBorrador || null);
    if (!ok) {
      setErrorNombre('No se pudo guardar — no tenés permiso para editar este contacto.');
      return;
    }
    setNombreGuardado(true);
    setTimeout(() => setNombreGuardado(false), 1800);
  };

  const guardarOportunidad = async () => {
    setErrorOportunidad('');
    const okValor = await actualizarCampo('valor_estimado', valorEstimado.trim() === '' ? null : String(Number(valorEstimado)));
    const okProbabilidad = await actualizarCampo('probabilidad_cierre', probabilidadCierre.trim() === '' ? null : String(Math.min(100, Math.max(0, Number(probabilidadCierre)))));
    if (!okValor || !okProbabilidad) {
      setErrorOportunidad('No se pudo guardar — no tenés permiso para editar este contacto.');
      return;
    }
    setOportunidadGuardada(true);
    setTimeout(() => setOportunidadGuardada(false), 1800);
  };

  const agregarNota = async () => {
    if (!notaBorrador.trim() || !contacto) return;
    await supabase.from('notas').insert({ contacto_id: contacto.id, autor_id: usuario!.id, texto: notaBorrador });
    setNotaBorrador('');
    cargarNotas(contacto.id);
  };

  const alternarTarea = async (tarea: Tarea) => {
    await supabase.from('tareas').update({ completada: !tarea.completada }).eq('id', tarea.id);
    if (contacto) cargarTareas(contacto.id);
  };

  if (cargando || !contacto) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs" style={{ color: TEXTO_TERCIARIO, background: FONDO_CONTENIDO }}>Cargando...</div>
    );
  }

  const etapa = etapas.find((e) => e.id === contacto.etapa_id) || null;
  const proximaTarea = tareas.filter((t) => !t.completada).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''))[0] || null;
  const timeline: EventoTimeline[] = [
    ...notas.map((n): EventoTimeline => ({ id: `nota-${n.id}`, tipo: 'nota', fecha: n.creado_en, nota: n })),
    ...tareas.map((t): EventoTimeline => ({ id: `tarea-${t.id}`, tipo: 'tarea', fecha: t.fecha || t.id, tarea: t })),
  ].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden" style={{ background: FONDO_CONTENIDO }}>
      <div className="flex items-center gap-3 px-5 py-3.5 shrink-0" style={{ backgroundColor: 'var(--surface)', borderBottom: `1px solid ${BORDE}` }}>
        <button onClick={onVolver} className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: TEXTO_SECUNDARIO }}>
          <ArrowLeft size={15} /> Contactos
        </button>
        <span className="text-[15px] font-bold flex-1 truncate" style={{ color: TEXTO_PRIMARIO }}>{contacto.nombre || contacto.telefono}</span>
        {onAbrirChat && telefonoChat && (
          <button
            onClick={() => onAbrirChat(telefonoCrudo)}
            className="flex items-center gap-1.5 text-[12.5px] font-semibold rounded-lg px-3 py-1.5"
            style={{ border: '1px solid #BFE9CF', backgroundColor: '#E7F8EE', color: '#128C4B' }}
          >
            <MessageCircle size={14} /> Abrir chat
          </button>
        )}
        <button
          onClick={() => {
            const perdida = etapas.find((e) => e.tipo === 'perdida');
            if (perdida) cambiarEtapa(contacto.id, perdida.id, (cambios) => setContacto((prev) => (prev ? { ...prev, ...cambios } : prev)));
          }}
          className="text-[12.5px] font-semibold rounded-lg px-3 py-1.5"
          style={{ border: `1px solid ${BORDE}`, color: TEXTO_SECUNDARIO }}
        >
          Marcar perdido
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden">
        <div className="w-full md:w-[300px] shrink-0 md:overflow-y-auto p-4 flex flex-col gap-4 border-b md:border-b-0 md:border-r" style={{ borderColor: BORDE }}>
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-semibold shrink-0" style={{ backgroundColor: colorAvatar(telefono), color: 'white' }}>
              {(contacto.nombre || telefono).slice(-2)}
            </div>
            <div className="min-w-0 flex flex-col gap-1">
              <span className="text-[15px] font-bold truncate" style={{ color: TEXTO_PRIMARIO }}>{contacto.nombre || telefono}</span>
              <span className="text-xs truncate" style={{ color: TEXTO_SECUNDARIO, fontFamily: 'var(--fuente-mono)' }}>{telefono}</span>
            </div>
          </div>
          {contacto.temperatura && (
            <span className="self-start text-xs font-bold rounded-full px-2.5 py-1" style={{ backgroundColor: TEMPERATURA_STYLE[contacto.temperatura].bg, color: TEMPERATURA_STYLE[contacto.temperatura].color, border: `1px solid ${TEMPERATURA_STYLE[contacto.temperatura].border}` }}>
              {TEMPERATURA_STYLE[contacto.temperatura].label}
            </span>
          )}

          <label className="flex flex-col gap-1.5 text-xs font-semibold" style={{ color: 'var(--fg-2)' }}>
            Nombre
            <div className="flex items-center gap-1.5">
              <input
                value={nombreBorrador}
                onChange={(e) => setNombreBorrador(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && guardarNombre()}
                placeholder="Nombre del cliente"
                className="flex-1 min-w-0 rounded-lg px-2.5 outline-none font-normal text-[13.5px]"
                style={{ height: 36, border: `1px solid ${nombreBorrador !== (contacto.nombre || '') ? TEAL : BORDE}`, color: TEXTO_PRIMARIO, backgroundColor: 'var(--surface)' }}
              />
              <button
                onClick={guardarNombre}
                disabled={nombreBorrador === (contacto.nombre || '')}
                aria-label="Guardar nombre"
                className="shrink-0 rounded-lg flex items-center justify-center"
                style={{
                  width: 36,
                  height: 36,
                  backgroundColor: nombreGuardado ? 'var(--ok)' : nombreBorrador !== (contacto.nombre || '') ? TEAL : 'var(--line)',
                  color: nombreBorrador !== (contacto.nombre || '') || nombreGuardado ? 'white' : TEXTO_TERCIARIO,
                }}
              >
                <Check size={14} />
              </button>
            </div>
            {errorNombre && <span className="font-normal" style={{ color: 'var(--bad)' }}>{errorNombre}</span>}
          </label>

          <Card titulo="Datos del lead">
            <Campo etiqueta="Producto de interés" valor={contacto.producto_interes || '—'} />
            <Campo etiqueta="Origen" valor={contacto.origen || '—'} />
            <Campo etiqueta="Primer contacto" valor={new Date(contacto.creado_en).toLocaleDateString('es-BO', { day: '2-digit', month: 'short' })} />
            <Campo etiqueta="Etapa" valor={etapa?.nombre || '—'} />
          </Card>

          <Card titulo="Estado del lead">
            <div className="flex gap-1.5">
              {(Object.entries(TEMPERATURA_STYLE) as [Temperatura, { label: string; color: string; bg: string; border: string }][]).map(([valor, cfg]) => {
                const activo = contacto.temperatura === valor;
                return (
                  <button
                    key={valor}
                    onClick={() => actualizarCampo('temperatura', valor)}
                    className="flex-1 text-[12px] font-bold rounded-lg py-1.5"
                    style={activo ? { backgroundColor: cfg.bg, color: cfg.color, border: `1.5px solid ${cfg.border}` } : { backgroundColor: 'var(--surface)', color: TEXTO_SECUNDARIO, border: '1.5px solid var(--line)' }}
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card titulo="Etiquetas">
            {etiquetas.length === 0 ? (
              <span className="text-[11px]" style={{ color: TEXTO_TERCIARIO }}>Sin etiquetas todavía.</span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {etiquetas.map((e) => (
                  <span key={e.id} className="text-[11.5px] font-semibold rounded-full px-2.5 py-1" style={{ backgroundColor: tinte(colorEtiquetaWhatsapp(e.color)), color: colorEtiquetaWhatsapp(e.color) }}>
                    {e.nombre}
                  </span>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="flex-1 min-w-0 md:overflow-y-auto p-5 flex flex-col gap-4">
          <Card titulo="Escribir por WhatsApp">
            <FormWhatsapp telefono={telefonoChat || telefono} lineaSugerida={lineaSugerida} texto={mensajeWhatsapp} onTexto={setMensajeWhatsapp} />
          </Card>

          <span className="text-[15px] font-bold" style={{ color: TEXTO_PRIMARIO }}>Historial completo</span>
          <div className="flex flex-col gap-4">
            {timeline.length === 0 && <div className="text-xs" style={{ color: TEXTO_TERCIARIO }}>Sin actividad registrada todavía.</div>}
            {timeline.map((ev) => (
              <div key={ev.id} className="flex items-start gap-3">
                <span
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                  style={ev.tipo === 'nota' ? { backgroundColor: 'var(--warn-soft)', color: AMBER } : { backgroundColor: ev.tarea?.completada ? '#EAF7F0' : '#E4EFFA', color: ev.tarea?.completada ? TEAL : BLUE }}
                >
                  {ev.tipo === 'nota' ? <FileText size={13} /> : ev.tarea?.completada ? <Check size={13} /> : <Clock size={13} />}
                </span>
                <div className="flex-1 min-w-0 rounded-lg p-3" style={{ backgroundColor: 'var(--surface)', border: `1px solid ${BORDE}` }}>
                  {ev.tipo === 'nota' ? (
                    <span className="text-[13px] leading-snug" style={{ color: 'var(--fg)' }}>{ev.nota?.texto}</span>
                  ) : (
                    <span className="text-[13px] font-medium" style={{ color: TEXTO_PRIMARIO, textDecoration: ev.tarea?.completada ? 'line-through' : 'none' }}>{ev.tarea?.titulo}</span>
                  )}
                  <div className="text-[11px] mt-1" style={{ color: TEXTO_TERCIARIO }}>
                    {ev.tipo === 'nota' ? ev.nota?.usuarios?.nombre || 'Agente' : 'Tarea'} · {ev.fecha ? new Date(ev.fecha).toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'sin fecha'}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-1">
            <input
              value={notaBorrador}
              onChange={(e) => setNotaBorrador(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && agregarNota()}
              placeholder="Agregar una nota al historial..."
              className="flex-1 rounded-lg px-3 outline-none text-[13px]"
              style={{ height: 38, border: `1px solid ${BORDE}`, color: TEXTO_PRIMARIO, backgroundColor: 'var(--surface)' }}
            />
            <button onClick={agregarNota} className="rounded-lg px-3 flex items-center justify-center shrink-0" style={{ backgroundColor: AMBER }}>
              <Plus size={14} color="white" />
            </button>
          </div>
        </div>

        <div className="w-full md:w-[320px] shrink-0 md:overflow-y-auto p-4 flex flex-col gap-4 border-t md:border-t-0 md:border-l" style={{ borderColor: BORDE }}>
          {proximaTarea && (
            <div className="rounded-xl p-3.5 flex flex-col gap-2.5" style={{ backgroundColor: 'var(--warn-soft)', border: '1px solid #F3D9A8' }}>
              <span className="text-[11px] font-bold tracking-wider uppercase" style={{ color: AMBER }}>Próxima acción</span>
              <span className="text-[13px] font-semibold" style={{ color: '#5C3A0A' }}>{proximaTarea.titulo}</span>
              {proximaTarea.fecha && <span className="text-[11.5px]" style={{ color: '#8A6423' }}>{new Date(proximaTarea.fecha).toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
              <button onClick={() => alternarTarea(proximaTarea)} className="self-start text-[12px] font-semibold rounded-lg px-3 py-1.5" style={{ backgroundColor: AMBER, color: 'white' }}>Marcar hecha</button>
            </div>
          )}

          <Card titulo="Cerrar la venta">
            <div className="grid grid-cols-2 gap-2.5">
              <label className="flex flex-col gap-1.5 text-xs font-semibold" style={{ color: 'var(--fg-2)' }}>
                Valor estimado (Bs.)
                <input
                  type="number"
                  value={valorEstimado}
                  onChange={(e) => setValorEstimado(e.target.value)}
                  placeholder="0"
                  className="rounded-lg px-2.5 outline-none font-normal text-[13.5px]"
                  style={{ height: 36, border: `1px solid ${BORDE}`, color: TEXTO_PRIMARIO, fontFamily: 'var(--fuente-mono)' }}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold" style={{ color: 'var(--fg-2)' }}>
                Prob. de cierre (%)
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={probabilidadCierre}
                  onChange={(e) => setProbabilidadCierre(e.target.value)}
                  placeholder="0"
                  className="rounded-lg px-2.5 outline-none font-normal text-[13.5px]"
                  style={{ height: 36, border: `1px solid ${BORDE}`, color: TEXTO_PRIMARIO, fontFamily: 'var(--fuente-mono)' }}
                />
              </label>
            </div>
            <button
              onClick={guardarOportunidad}
              className="self-start text-[12.5px] font-semibold rounded-lg px-3.5"
              style={{ height: 32, backgroundColor: oportunidadGuardada ? 'var(--ok)' : TEAL, color: 'white' }}
            >
              {oportunidadGuardada ? 'Guardado ✓' : 'Guardar oportunidad'}
            </button>
            {errorOportunidad && <span className="text-[11px]" style={{ color: 'var(--bad)' }}>{errorOportunidad}</span>}
            <Campo etiqueta="Etapa actual" valor={etapa?.nombre || '—'} />
          </Card>

          {respuestasRapidas.length > 0 && (
            <Card titulo="Respuestas sugeridas">
              <div className="flex flex-col gap-1.5">
                {respuestasRapidas.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setMensajeWhatsapp(r.contenido)}
                    title="Usar en el mensaje de WhatsApp"
                    className="rounded-lg px-3 py-2 text-[12.5px] leading-snug text-left"
                    style={{ backgroundColor: 'var(--surface-2)', color: TEXTO_SECUNDARIO }}
                  >
                    "{r.contenido}"
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
      {dialogoEtapa}
    </div>
  );
}
