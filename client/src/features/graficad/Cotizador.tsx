import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calculator, Check, Copy, FileDown, ImagePlus, MessageSquare, Plus, Send, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { useEtapasVenta } from '../bandeja/hooks/useEtapasVenta';
import { AMBER, TEXTO_PRIMARIO, TEXTO_SECUNDARIO, TEXTO_TERCIARIO } from '../../lib/tema';
import { Boton, Chip, EncabezadoPagina, EstadoVacio, Tarjeta, useToast } from '../../components/ui';
import type { Conversacion } from '../../lib/tipos';
import {
  LAMINAS, calcularCotizacion, datosNuevos, datosPdf, formatoBs, formatoNumero, itemNuevo, nombreMaterial, numeroCotizacion,
  textoOrdenCorte, textoParaCliente, type DatosCotizacion, type ItemCotizacion, type Lamina, type Tarifas,
} from './tarifas';
import { faltaInstalar, useTarifas } from './useTarifas';
import { nombreArchivoPdf, pdfCotizacion } from './pdfCotizacion';
import { MEDIDAS_HOJA, acomodarPiezas } from './plancha';
import VistaPlancha from './VistaPlancha';

const backendUrl = import.meta.env.VITE_BACKEND_URL;

type Estado = 'borrador' | 'enviada' | 'aprobada' | 'rechazada';
interface Cotizacion {
  id: string;
  numero: number;
  conversacion_id: string | null;
  contacto_telefono: string | null;
  cliente: string;
  datos: DatosCotizacion;
  total: number;
  estado: Estado;
  creado_en: string;
}

const ESTADO: Record<Estado, { texto: string; color: string }> = {
  borrador: { texto: 'Borrador', color: TEXTO_TERCIARIO },
  enviada: { texto: 'Enviada', color: AMBER },
  aprobada: { texto: 'Aprobada', color: 'var(--c-exito, var(--ok))' },
  rechazada: { texto: 'Rechazada', color: 'var(--c-peligro, var(--bad))' },
};

const campo = 'w-full rounded-lg px-2.5 py-2 text-[13.5px] outline-none';
const campoStyle = { border: '1px solid var(--line-2)', backgroundColor: 'var(--surface-2)', color: 'var(--fg)' } as const;
const etiqueta = 'block text-[11.5px] font-semibold mb-1';

function CampoNumero({ id, label, valor, onCambiar, paso = 1, vacioEsNulo = false, placeholder }: { id: string; label: string; valor: number | null; onCambiar: (v: number | null) => void; paso?: number; vacioEsNulo?: boolean; placeholder?: string }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={etiqueta} style={{ color: TEXTO_SECUNDARIO }}>{label}</label>
      <input
        id={id}
        type="number"
        min={0}
        step={paso}
        inputMode="decimal"
        value={valor ?? ''}
        placeholder={placeholder}
        onChange={(e) => {
          const t = e.target.value;
          if (t === '') return onCambiar(vacioEsNulo ? null : 0);
          onCambiar(Math.max(0, Number(t) || 0));
        }}
        className={campo}
        style={campoStyle}
      />
    </div>
  );
}

const copiar = async (texto: string, toast: ReturnType<typeof useToast>, que: string) => {
  try {
    await navigator.clipboard.writeText(texto);
    toast(`${que} copiada`, 'ok');
  } catch {
    toast('No se pudo copiar. Seleccioná el texto a mano.', 'error');
  }
};

interface CotizadorProps {
  conversaciones: Conversacion[];
  /** Chat desde el que se abrió el cotizador (botón "Cotizar" del chat). */
  conversacionInicial: Conversacion | null;
  onAbrirChat: (telefono: string) => void;
}

// Cotizador de Graficad: un formulario, dos documentos. La cotización para el
// cliente (solo precios) se envía a su chat de WhatsApp; la orden de corte
// (material, lámina, metros, minutos, máquina) es para el taller.
export default function Cotizador({ conversaciones, conversacionInicial, onAbrirChat }: CotizadorProps) {
  const { usuario } = useAuth();
  const toast = useToast();
  const { tarifas, sinInstalar: tarifasSinInstalar, cargando } = useTarifas();
  const etapas = useEtapasVenta(usuario?.empresa_id);

  const [lista, setLista] = useState<Cotizacion[]>([]);
  const [sinInstalar, setSinInstalar] = useState(false);
  const [editando, setEditando] = useState<Cotizacion | null>(null);
  const [conversacionId, setConversacionId] = useState<string>(conversacionInicial?.id || '');
  const [cliente, setCliente] = useState(conversacionInicial?.contacto_nombre || '');
  const [datos, setDatos] = useState<DatosCotizacion>(() => datosNuevos(tarifas));
  const [ocupado, setOcupado] = useState(false);
  const [enPdf, setEnPdf] = useState(true);
  const [subiendoImagen, setSubiendoImagen] = useState<string | null>(null);
  const [lineas, setLineas] = useState<{ id: string; nombre: string; numero: string | null; estado: string }[]>([]);
  const [lineaEnvio, setLineaEnvio] = useState('');

  const conversacion = conversaciones.find((c) => c.id === conversacionId) || null;

  // Por defecto sale por la línea corporativa elegida en "Catálogo y tarifas";
  // si no hay, por la línea donde escribió el cliente.
  const lineaPreferida = lineas.some((l) => l.id === tarifas.lineaCotizaciones) ? tarifas.lineaCotizaciones! : null;
  useEffect(() => {
    setLineaEnvio(lineaPreferida || conversacion?.linea_id || '');
  }, [lineaPreferida, conversacion?.linea_id]);

  const cargarLista = useCallback(async () => {
    const { data, error } = await supabase.from('graficad_cotizaciones').select('*').order('creado_en', { ascending: false }).limit(30).returns<Cotizacion[]>();
    setSinInstalar(faltaInstalar(error));
    setLista(data || []);
  }, []);
  useEffect(() => { cargarLista(); }, [cargarLista]);
  useEffect(() => {
    supabase.from('lineas_whatsapp').select('id, nombre, numero, estado').order('nombre').then(({ data }) => setLineas(data || []));
  }, []);

  // Cuando terminan de cargar las tarifas guardadas, el ítem vacío inicial
  // apunta a un material que existe.
  useEffect(() => {
    if (!cargando && !editando) setDatos((d) => (d.items.every((i) => tarifas.materiales.some((m) => m.id === i.materialId)) ? d : datosNuevos(tarifas)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargando]);

  // Abrir el cotizador desde otro chat arranca una cotización nueva para ese chat.
  useEffect(() => {
    if (!conversacionInicial) return;
    setEditando(null);
    setConversacionId(conversacionInicial.id);
    setCliente(conversacionInicial.contacto_nombre || conversacionInicial.contacto_telefono.split('@')[0]);
    setDatos(datosNuevos(tarifas));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversacionInicial?.id]);

  const calculo = useMemo(() => calcularCotizacion(datos, tarifas), [datos, tarifas]);
  const numero = editando ? numeroCotizacion(editando.numero) : 'COT-nueva';
  const nombreCliente = cliente.trim() || conversacion?.contacto_nombre || 'Cliente';

  const cambiarItem = (id: string, cambios: Partial<ItemCotizacion>) =>
    setDatos((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...cambios } : i)) }));

  // Imagen de referencia del ítem: va al bucket `media` y su URL queda en el ítem.
  const subirImagen = async (itemId: string, archivo: File) => {
    if (!usuario) return;
    setSubiendoImagen(itemId);
    const ext = archivo.name.split('.').pop() || 'jpg';
    const ruta = `cotizaciones/${usuario.empresa_id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('media').upload(ruta, archivo);
    setSubiendoImagen(null);
    if (error) return toast('No se pudo subir la imagen.', 'error');
    cambiarItem(itemId, { imagen: supabase.storage.from('media').getPublicUrl(ruta).data.publicUrl });
  };

  const armarPdf = (num: string) => pdfCotizacion({ numero: num, cliente: nombreCliente, datos, tarifas });

  const descargarPdf = async () => {
    const doc = await armarPdf(numero);
    doc.save(nombreArchivoPdf(numero, nombreCliente));
  };

  const nueva = () => {
    setEditando(null);
    setConversacionId('');
    setCliente('');
    setDatos(datosNuevos(tarifas));
  };

  const abrir = (c: Cotizacion) => {
    setEditando(c);
    setConversacionId(c.conversacion_id || '');
    setCliente(c.cliente);
    setDatos(c.datos);
  };

  // Guarda (crea o actualiza) y devuelve la fila guardada.
  const guardar = async (estado?: Estado): Promise<Cotizacion | null> => {
    if (!usuario) return null;
    if (!datos.items.length) { toast('Agregá al menos un ítem.', 'error'); return null; }
    const fila = {
      conversacion_id: conversacion?.id || null,
      contacto_telefono: conversacion?.contacto_telefono || null,
      cliente: nombreCliente,
      datos,
      total: calculo.total,
      estado: estado || editando?.estado || 'borrador',
      actualizado_en: new Date().toISOString(),
    };
    const { data, error } = editando
      ? await supabase.from('graficad_cotizaciones').update(fila).eq('id', editando.id).select().single<Cotizacion>()
      : await supabase.from('graficad_cotizaciones').insert({ ...fila, empresa_id: usuario.empresa_id, creado_por: usuario.id }).select().single<Cotizacion>();
    if (error || !data) {
      toast(faltaInstalar(error) ? 'Falta instalar las tablas del cotizador en Supabase.' : 'No se pudo guardar la cotización.', 'error');
      return null;
    }
    setEditando(data);
    cargarLista();
    return data;
  };

  // Pasa la tarjeta del contacto a la etapa indicada y lleva la cotización como
  // una oportunidad del contacto ("COT-0001 · ..."), que es lo que suma el monto
  // en Oportunidades, el Embudo y los reportes.
  const moverContacto = async (
    telefono: string | null,
    buscarEtapa: (nombre: string, tipo: string) => boolean,
    cot: { numero: number; total: number; cliente: string },
    cierre?: 'ganada' | 'perdida',
  ) => {
    if (!telefono || !usuario) return;
    const tel = telefono.split('@')[0];
    const ahora = new Date().toISOString();
    const etapa = etapas.find((e) => buscarEtapa(e.nombre.toLowerCase(), e.tipo));
    const { data: contacto } = await supabase.from('contactos').select('id').eq('telefono', tel).limit(1).maybeSingle<{ id: string }>();
    if (!contacto) return;
    if (etapa) await supabase.from('contactos').update({ etapa_id: etapa.id, etapa_actualizada_en: ahora }).eq('id', contacto.id);

    const num = numeroCotizacion(cot.numero);
    const { data: existente, error } = await supabase
      .from('oportunidades')
      .select('id')
      .eq('contacto_id', contacto.id)
      .like('producto', `${num} ·%`)
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (error) {
      // Base sin la tabla de oportunidades (falta correr actualizar.sql): el monto va al contacto.
      await supabase.from('contactos').update({ valor_estimado: cot.total }).eq('id', contacto.id);
      return;
    }
    const cambios = {
      monto: cot.total,
      actualizado_en: ahora,
      ...(cierre
        ? { estado: cierre, probabilidad: cierre === 'ganada' ? 100 : 0, cerrada_en: ahora }
        : { estado: 'abierta', cerrada_en: null, ...(etapa?.probabilidad != null ? { probabilidad: etapa.probabilidad } : {}) }),
    };
    if (existente) await supabase.from('oportunidades').update(cambios).eq('id', existente.id);
    else
      await supabase.from('oportunidades').insert({
        empresa_id: usuario.empresa_id,
        contacto_id: contacto.id,
        creado_por: usuario.id,
        producto: `${num} · ${cot.cliente || 'Cotización'}`,
        probabilidad: etapa?.probabilidad ?? 50,
        ...cambios,
      });
  };

  const enviar = async () => {
    if (!conversacion) return;
    setOcupado(true);
    try {
      const guardada = await guardar();
      if (!guardada) return;
      const num = numeroCotizacion(guardada.numero);
      const mandar = async (cuerpo: Record<string, string>) => {
        const resp = await fetch(`${backendUrl}/enviar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telefono: conversacion.contacto_telefono, agente_id: usuario!.id, linea_id: lineaEnvio || conversacion.linea_id, ...cuerpo }),
        });
        if (resp.ok) return true;
        const error = await resp.json().catch(() => ({}));
        toast(error.error || 'No se pudo enviar por WhatsApp.', 'error');
        return false;
      };
      if (enPdf) {
        // El PDF se sube a `media` y se manda como documento, después de un
        // mensaje corto que lo presenta.
        const blob = (await armarPdf(num)).output('blob');
        const ruta = `cotizaciones/${usuario!.empresa_id}/${num}-${Date.now()}.pdf`;
        const { error } = await supabase.storage.from('media').upload(ruta, blob, { contentType: 'application/pdf' });
        if (error) return toast('No se pudo preparar el PDF.', 'error');
        const url = supabase.storage.from('media').getPublicUrl(ruta).data.publicUrl;
        const saludo = `Hola ${nombreCliente}, te enviamos la cotización ${num} de Graficad por ${formatoBs(calculo.total)}. Cualquier consulta, estamos a tu disposición.`;
        if (!(await mandar({ tipo: 'texto', texto: saludo }))) return;
        if (!(await mandar({ tipo: 'pdf', media_url: url, texto: nombreArchivoPdf(num, nombreCliente) }))) return;
      } else if (!(await mandar({ tipo: 'texto', texto: textoParaCliente(num, nombreCliente, datos, tarifas) }))) return;
      await supabase.from('conversaciones').update({ ultima_actividad: new Date().toISOString() }).eq('id', conversacion.id);
      await supabase.from('graficad_cotizaciones').update({ estado: 'enviada' }).eq('id', guardada.id);
      setEditando({ ...guardada, estado: 'enviada' });
      await moverContacto(conversacion.contacto_telefono, (n, tipo) => tipo === 'normal' && n.includes('negoci'), { numero: guardada.numero, total: calculo.total, cliente: nombreCliente });
      toast('Cotización enviada al chat', 'ok');
      cargarLista();
    } finally {
      setOcupado(false);
    }
  };

  const cambiarEstado = async (c: Cotizacion, estado: Estado) => {
    const { error } = await supabase.from('graficad_cotizaciones').update({ estado, actualizado_en: new Date().toISOString() }).eq('id', c.id);
    if (error) return toast('No se pudo cambiar el estado.', 'error');
    const cot = { numero: c.numero, total: c.total, cliente: c.cliente };
    if (estado === 'aprobada') await moverContacto(c.contacto_telefono, (_, tipo) => tipo === 'ganada', cot, 'ganada');
    if (estado === 'rechazada') await moverContacto(c.contacto_telefono, (_, tipo) => tipo === 'perdida', cot, 'perdida');
    if (editando?.id === c.id) setEditando({ ...editando, estado });
    toast(estado === 'aprobada' ? 'Aprobada: el contacto pasó a venta ganada' : estado === 'rechazada' ? 'Marcada como rechazada' : 'Estado actualizado', 'ok');
    cargarLista();
  };

  // Los materiales agrupados para el selector (Acrílico, PVC foam, ...).
  const grupos = useMemo(() => {
    const g = new Map<string, Tarifas['materiales']>();
    tarifas.materiales.forEach((m) => g.set(m.nombre, [...(g.get(m.nombre) || []), m]));
    return [...g.entries()];
  }, [tarifas]);

  return (
    <div className="flex-1 min-w-0 overflow-y-auto">
      <div className="p-4 md:p-6 flex flex-col gap-4">
      <EncabezadoPagina
        titulo="Cotizador"
        subtitulo="Un formulario, dos documentos: la cotización para el cliente y la orden de corte para el taller."
        accion={<Boton variante="secundario" icono={Plus} onClick={nueva}>Nueva cotización</Boton>}
      />

      {(sinInstalar || tarifasSinInstalar) && (
        <Tarjeta className="px-4 py-3 text-[13px]" style={{ borderColor: AMBER, color: TEXTO_PRIMARIO }}>
          <b>Falta un paso en Supabase.</b> Para guardar y enviar cotizaciones, pegá el archivo <code>database/graficad/01-cotizador.sql</code> en el SQL Editor de Supabase y apretá Run. Mientras tanto podés calcular y copiar.
        </Tarjeta>
      )}

      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))' }}>
        {/* ---------- Formulario ---------- */}
        <div className="flex flex-col gap-3 min-w-0">
          <Tarjeta className="p-4 flex flex-col gap-3">
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              <div className="min-w-0">
                <label htmlFor="cot-chat" className={etiqueta} style={{ color: TEXTO_SECUNDARIO }}>Chat del cliente</label>
                <select
                  id="cot-chat"
                  value={conversacionId}
                  onChange={(e) => {
                    setConversacionId(e.target.value);
                    const c = conversaciones.find((x) => x.id === e.target.value);
                    if (c && !cliente.trim()) setCliente(c.contacto_nombre || c.contacto_telefono.split('@')[0]);
                  }}
                  className={campo}
                  style={campoStyle}
                >
                  <option value="">Sin chat (solo calcular)</option>
                  {conversaciones.slice(0, 200).map((c) => (
                    <option key={c.id} value={c.id}>{c.contacto_nombre || c.contacto_telefono.split('@')[0]}</option>
                  ))}
                </select>
              </div>
              <div className="min-w-0">
                <label htmlFor="cot-cliente" className={etiqueta} style={{ color: TEXTO_SECUNDARIO }}>Nombre en la cotización</label>
                <input id="cot-cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Ej. Cafetería Aroma" className={campo} style={campoStyle} />
              </div>
            </div>
          </Tarjeta>

          {datos.items.map((item, idx) => {
            const ci = calculo.items[idx];
            const m = ci?.material;
            return (
              <Tarjeta key={item.id} className="p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="eyebrow">Ítem {idx + 1}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold tabular-nums" style={{ color: TEXTO_PRIMARIO }}>{formatoBs(ci?.total || 0)}</span>
                    {datos.items.length > 1 && (
                      <button aria-label={`Quitar ítem ${idx + 1}`} onClick={() => setDatos((d) => ({ ...d, items: d.items.filter((i) => i.id !== item.id) }))} className="p-1 rounded-md" style={{ color: TEXTO_TERCIARIO }}>
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label htmlFor={`d-${item.id}`} className={etiqueta} style={{ color: TEXTO_SECUNDARIO }}>Qué es (lo ve el cliente)</label>
                  <textarea id={`d-${item.id}`} value={item.descripcion} onChange={(e) => cambiarItem(item.id, { descripcion: e.target.value })} rows={2} placeholder='Ej. Letras "AROMA" de 1,20 × 0,40 m en acrílico blanco, con instalación' className={campo} style={{ ...campoStyle, resize: 'vertical' }} />
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {item.imagen && <img src={item.imagen} alt="Imagen de referencia" className="rounded-md object-cover" style={{ width: 72, height: 54, border: '1px solid var(--line)' }} />}
                  <label className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold cursor-pointer rounded-lg px-2.5 py-1.5" style={{ border: '1px solid var(--line-2)', color: TEXTO_SECUNDARIO }}>
                    <ImagePlus size={14} />
                    {subiendoImagen === item.id ? 'Subiendo…' : item.imagen ? 'Cambiar imagen' : 'Imagen de referencia (va en el PDF)'}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) subirImagen(item.id, f); e.target.value = ''; }} />
                  </label>
                  {item.imagen && <button onClick={() => cambiarItem(item.id, { imagen: null })} className="text-[12px]" style={{ color: TEXTO_TERCIARIO }}>Quitar</button>}
                </div>
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                  <div className="min-w-0">
                    <label htmlFor={`m-${item.id}`} className={etiqueta} style={{ color: TEXTO_SECUNDARIO }}>Material</label>
                    <select id={`m-${item.id}`} value={item.materialId} onChange={(e) => cambiarItem(item.id, { materialId: e.target.value, minutosRdworks: null })} className={campo} style={campoStyle}>
                      {grupos.map(([g, ms]) => (
                        <optgroup key={g} label={g}>
                          {ms.map((x) => <option key={x.id} value={x.id}>{x.color} · {String(x.espesor).replace('.', ',')} mm</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-0">
                    <label htmlFor={`l-${item.id}`} className={etiqueta} style={{ color: TEXTO_SECUNDARIO }}>Lámina</label>
                    <select id={`l-${item.id}`} value={item.lamina} onChange={(e) => cambiarItem(item.id, { lamina: e.target.value as Lamina })} className={campo} style={campoStyle}>
                      {(Object.keys(LAMINAS) as Lamina[]).map((l) => <option key={l} value={l}>{LAMINAS[l].nombre}{LAMINAS[l].medida ? ` (${LAMINAS[l].medida})` : ''}</option>)}
                    </select>
                  </div>
                  {item.lamina !== 'ninguna' && <CampoNumero id={`n-${item.id}`} label="Cantidad de láminas" valor={item.laminas} onCambiar={(v) => cambiarItem(item.id, { laminas: v ?? 0 })} />}
                </div>
                {m && item.lamina !== 'ninguna' && m.entera === null && (
                  <p className="text-[12px]" style={{ color: AMBER }}>Este material todavía no tiene precio de lámina en "Catálogo y tarifas": solo se cobra el corte.</p>
                )}
                <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Máquina">
                  {(['laser', 'router'] as const).map((q) => (
                    <button key={q} aria-pressed={item.maquina === q} onClick={() => cambiarItem(item.id, { maquina: q })} className="rounded-full px-3 py-1 text-[12.5px] font-semibold" style={item.maquina === q ? { backgroundColor: 'var(--fg)', color: 'var(--surface)' } : { backgroundColor: 'var(--surface-2)', color: TEXTO_SECUNDARIO }}>
                      {q === 'laser' ? 'Láser' : 'CNC router'}
                    </button>
                  ))}
                </div>
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
                  <CampoNumero id={`me-${item.id}`} label="Metros de corte" valor={item.metros} paso={0.5} onCambiar={(v) => cambiarItem(item.id, { metros: v ?? 0 })} />
                  {m?.corte === 'minuto' && (
                    <CampoNumero id={`mi-${item.id}`} label="Minutos RDWorks" valor={item.minutosRdworks} paso={0.5} vacioEsNulo placeholder={ci?.minutos !== null && ci ? `≈ ${formatoNumero(ci.minutos ?? 0, 1)}` : ''} onCambiar={(v) => cambiarItem(item.id, { minutosRdworks: v })} />
                  )}
                  {m?.corte === 'minuto' && <CampoNumero id={`g-${item.id}`} label="Min. de grabado" valor={item.grabadoMin} onCambiar={(v) => cambiarItem(item.id, { grabadoMin: v ?? 0 })} />}
                  <CampoNumero id={`p-${item.id}`} label="Piezas" valor={item.piezas} onCambiar={(v) => cambiarItem(item.id, { piezas: v ?? 0 })} />
                </div>
                {m?.corte === 'minuto' && item.minutosRdworks === null && (
                  <p className="text-[12px]" style={{ color: TEXTO_TERCIARIO }}>
                    Tiempo estimado a {m.velocidad} mm/s{m.supuesto ? ' (velocidad supuesta, conviene poner los minutos de RDWorks)' : ''}.
                  </p>
                )}
                <PiezasPlancha item={item} separacion={tarifas.separacionCorte} onCambiar={(cambios) => cambiarItem(item.id, cambios)} />
              </Tarjeta>
            );
          })}
          <Boton variante="secundario" icono={Plus} onClick={() => setDatos((d) => ({ ...d, items: [...d.items, itemNuevo(tarifas)] }))}>Agregar ítem</Boton>

          <Tarjeta className="p-4 flex flex-col gap-3">
            <span className="eyebrow">Extras</span>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
              <CampoNumero id="x-dis" label="Diseño (Bs)" valor={datos.diseno} onCambiar={(v) => setDatos((d) => ({ ...d, diseno: v ?? 0 }))} />
              <CampoNumero id="x-arm" label="Armado (Bs)" valor={datos.armado} onCambiar={(v) => setDatos((d) => ({ ...d, armado: v ?? 0 }))} />
              <CampoNumero id="x-ins" label="Instalación (Bs)" valor={datos.instalacion} onCambiar={(v) => setDatos((d) => ({ ...d, instalacion: v ?? 0 }))} />
              <CampoNumero id="x-otr" label="Otros (Bs)" valor={datos.otros} onCambiar={(v) => setDatos((d) => ({ ...d, otros: v ?? 0 }))} />
            </div>
            <label className="flex items-center gap-2 text-[13.5px] font-semibold" style={{ color: TEXTO_PRIMARIO }}>
              <input type="checkbox" checked={datos.conFactura} onChange={(e) => setDatos((d) => ({ ...d, conFactura: e.target.checked }))} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
              Con factura (+{tarifas.factura} %)
            </label>
            <div>
              <label htmlFor="x-terminos" className={etiqueta} style={{ color: TEXTO_SECUNDARIO }}>Términos y condiciones (van en el PDF)</label>
              <textarea id="x-terminos" value={datos.terminos ?? ''} onChange={(e) => setDatos((d) => ({ ...d, terminos: e.target.value }))} rows={2} placeholder={datosPdf(tarifas).terminos} className={campo} style={{ ...campoStyle, resize: 'vertical' }} />
            </div>
            <div>
              <label htmlFor="x-notas" className={etiqueta} style={{ color: TEXTO_SECUNDARIO }}>Notas para el taller (no las ve el cliente)</label>
              <textarea id="x-notas" value={datos.notas} onChange={(e) => setDatos((d) => ({ ...d, notas: e.target.value }))} rows={2} placeholder="Archivo, fecha de entrega, detalles de armado…" className={campo} style={{ ...campoStyle, resize: 'vertical' }} />
            </div>
          </Tarjeta>
        </div>

        {/* ---------- Los dos documentos ---------- */}
        <div className="flex flex-col gap-3 min-w-0">
          <Tarjeta className="overflow-hidden">
            <div className="px-4 py-2.5 flex items-center justify-between gap-2 flex-wrap" style={{ backgroundColor: 'var(--accent-soft)', borderBottom: '1px solid var(--line)' }}>
              <span className="text-[13.5px] font-bold" style={{ color: TEXTO_PRIMARIO }}>Para el cliente · {numero}</span>
              {editando && <Chip color={ESTADO[editando.estado].color}>{ESTADO[editando.estado].texto}</Chip>}
            </div>
            <div className="p-4">
              <div className="text-[13px] mb-2" style={{ color: TEXTO_SECUNDARIO }}>{nombreCliente}</div>
              <table className="w-full text-[13.5px] tabular-nums">
                <tbody>
                  {datos.items.map((item, i) => {
                    const ci = calculo.items[i];
                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--line)' }}>
                        <td className="py-1.5 pr-3" style={{ color: TEXTO_PRIMARIO }}>{item.descripcion.trim() || (ci.material ? nombreMaterial(ci.material) : 'Trabajo')}</td>
                        <td className="py-1.5 text-right whitespace-nowrap" style={{ color: TEXTO_PRIMARIO }}>{formatoBs(ci.total)}</td>
                      </tr>
                    );
                  })}
                  {([['Diseño', datos.diseno], ['Armado', datos.armado], ['Instalación', datos.instalacion], ['Otros', datos.otros], [`Factura (${tarifas.factura} %)`, calculo.factura]] as const).filter(([, v]) => v > 0).map(([t, v]) => (
                    <tr key={t} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td className="py-1.5 pr-3" style={{ color: TEXTO_PRIMARIO }}>{t}</td>
                      <td className="py-1.5 text-right whitespace-nowrap" style={{ color: TEXTO_PRIMARIO }}>{formatoBs(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-end justify-between gap-3 mt-3 flex-wrap">
                <span className="text-[12px]" style={{ color: TEXTO_TERCIARIO }}>Anticipo {tarifas.anticipo} %: {formatoBs(calculo.anticipo)} · válida {tarifas.validezDias} días</span>
                <span className="disp text-[26px] font-bold tabular-nums" style={{ color: TEXTO_PRIMARIO }}>{formatoBs(calculo.total)}</span>
              </div>
              {conversacion && lineas.length > 1 && (
                <div className="mt-3">
                  <label htmlFor="cot-linea" className={etiqueta} style={{ color: TEXTO_SECUNDARIO }}>Enviar desde</label>
                  <select id="cot-linea" value={lineaEnvio} onChange={(e) => setLineaEnvio(e.target.value)} className={campo} style={campoStyle}>
                    {lineas.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nombre}{l.numero ? ` · ${l.numero}` : ''}{l.id === conversacion.linea_id ? ' (donde escribió el cliente)' : ''}{l.estado !== 'activo' ? ' · desconectada' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <label className="flex items-center gap-2 text-[13px] font-semibold mt-3" style={{ color: TEXTO_PRIMARIO }}>
                <input type="checkbox" checked={enPdf} onChange={(e) => setEnPdf(e.target.checked)} style={{ width: 15, height: 15, accentColor: 'var(--accent)' }} />
                Enviar en PDF con el formato de Graficad
              </label>
              <div className="flex gap-2 flex-wrap mt-3">
                <Boton variante="primario" icono={Send} disabled={!conversacion || ocupado || sinInstalar} onClick={enviar} title={!conversacion ? 'Elegí el chat del cliente arriba' : undefined}>
                  {editando?.estado === 'enviada' ? 'Reenviar al chat' : 'Enviar al chat'}
                </Boton>
                <Boton variante="secundario" disabled={ocupado || sinInstalar} onClick={async () => { if (await guardar()) toast('Cotización guardada', 'ok'); }}>Guardar</Boton>
                <Boton variante="fantasma" icono={FileDown} onClick={descargarPdf}>Descargar PDF</Boton>
                <Boton variante="fantasma" icono={Copy} onClick={() => copiar(textoParaCliente(numero, nombreCliente, datos, tarifas), toast, 'Cotización')}>Copiar</Boton>
              </div>
              {!conversacion && <p className="text-[12px] mt-2" style={{ color: TEXTO_TERCIARIO }}>Para enviarla, elegí el chat del cliente o abrí el cotizador con el botón "Cotizar" del chat.</p>}
            </div>
          </Tarjeta>

          <Tarjeta className="overflow-hidden">
            <div className="px-4 py-2.5 flex items-center justify-between gap-2 flex-wrap" style={{ backgroundColor: 'var(--warn-soft)', borderBottom: '1px solid var(--line)' }}>
              <span className="text-[13.5px] font-bold" style={{ color: TEXTO_PRIMARIO }}>Para el taller · Orden de corte {numero.replace('COT', 'OC')}</span>
              <span className="text-[11.5px]" style={{ color: TEXTO_SECUNDARIO }}>interna</span>
            </div>
            <div className="p-4 flex flex-col gap-3">
              {datos.items.map((item, i) => {
                const ci = calculo.items[i];
                const m = ci.material;
                const datosCorte: [string, string][] = [
                  ['Material', m ? nombreMaterial(m) : '—'],
                  ['Lámina', item.lamina === 'ninguna' ? 'Del cliente' : `${formatoNumero(item.laminas, 0)} × ${LAMINAS[item.lamina].nombre.toLowerCase()}`],
                  ['Máquina', item.maquina === 'laser' ? 'Láser' : 'CNC router'],
                  ['Corte', `${formatoNumero(item.metros, 1)} m`],
                  ...(ci.minutos !== null ? [['Tiempo', `${formatoNumero(ci.minutos, 1)} min${item.minutosRdworks !== null ? ' (RDWorks)' : ''}`] as [string, string]] : []),
                  ...(item.grabadoMin ? [['Grabado', `${item.grabadoMin} min`] as [string, string]] : []),
                  ['Piezas', String(item.piezas)],
                ];
                return (
                  <div key={item.id}>
                    <div className="text-[13px] font-semibold mb-1.5" style={{ color: TEXTO_PRIMARIO }}>{i + 1}. {item.descripcion.trim() || 'Pieza'}</div>
                    <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
                      {datosCorte.map(([k, v]) => (
                        <div key={k} className="rounded-lg px-2.5 py-1.5" style={{ backgroundColor: 'var(--surface-2)' }}>
                          <div className="eyebrow" style={{ fontSize: 10 }}>{k}</div>
                          <div className="text-[13px] font-semibold break-words" style={{ color: TEXTO_PRIMARIO }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    {item.cortes?.length ? (
                      <div className="mt-2">
                        <VistaPlancha piezas={item.cortes} hoja={hojaDe(item.lamina)} separacion={tarifas.separacionCorte} alto={150} />
                      </div>
                    ) : null}
                    <div className="text-[12px] mt-1.5 tabular-nums" style={{ color: TEXTO_TERCIARIO }}>
                      Lámina {formatoBs(ci.precioMaterial)} · Corte {ci.detalleCorte} = {formatoBs(ci.corte)}
                      {ci.descuentoRouter ? ` · Router −${formatoBs(ci.descuentoRouter)}` : ''}
                      {ci.grabado ? ` · Grabado ${formatoBs(ci.grabado)}` : ''}
                    </div>
                  </div>
                );
              })}
              {datos.notas.trim() && <div className="text-[13px]" style={{ color: TEXTO_SECUNDARIO }}><b>Notas:</b> {datos.notas.trim()}</div>}
              <div><Boton variante="fantasma" icono={Copy} onClick={() => copiar(textoOrdenCorte(numero, nombreCliente, datos, tarifas), toast, 'Orden de corte')}>Copiar orden de corte</Boton></div>
            </div>
          </Tarjeta>
        </div>
      </div>

      {/* ---------- Últimas cotizaciones ---------- */}
      <div className="flex flex-col gap-2">
        <span className="eyebrow">Últimas cotizaciones</span>
        {lista.length === 0 ? (
          <Tarjeta className="flex">
            <EstadoVacio icono={Calculator} titulo="Todavía no hay cotizaciones guardadas" texto="Las que guardes o envíes aparecen acá para seguirlas." />
          </Tarjeta>
        ) : (
          lista.map((c) => (
            <Tarjeta key={c.id} className="px-4 py-2.5 flex items-center gap-3 flex-wrap">
              <button onClick={() => abrir(c)} className="flex-1 min-w-[180px] text-left">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13.5px] font-semibold" style={{ color: TEXTO_PRIMARIO }}>{numeroCotizacion(c.numero)} · {c.cliente}</span>
                  <Chip color={ESTADO[c.estado].color}>{ESTADO[c.estado].texto}</Chip>
                </div>
                <div className="text-[12px] tabular-nums" style={{ color: TEXTO_SECUNDARIO }}>{formatoBs(Number(c.total))} · {new Date(c.creado_en).toLocaleDateString('es-BO', { day: 'numeric', month: 'short' })}</div>
              </button>
              {c.contacto_telefono && <Boton tamano="sm" variante="fantasma" icono={MessageSquare} onClick={() => onAbrirChat(c.contacto_telefono!)}>Chat</Boton>}
              {c.estado === 'enviada' && (
                <>
                  <Boton tamano="sm" variante="secundario" icono={Check} onClick={() => cambiarEstado(c, 'aprobada')}>Pagó anticipo</Boton>
                  <Boton tamano="sm" variante="fantasma" icono={X} onClick={() => cambiarEstado(c, 'rechazada')}>Rechazada</Boton>
                </>
              )}
            </Tarjeta>
          ))
        )}
      </div>
      </div>
    </div>
  );
}

const hojaDe = (l: Lamina) => MEDIDAS_HOJA[l === 'ninguna' ? 'entera' : l];

// Piezas a cortar de un ítem y su vista previa en la plancha, con atajos para
// pasar al ítem las láminas y los metros de corte que salen del acomodo.
function PiezasPlancha({ item, separacion, onCambiar }: { item: ItemCotizacion; separacion: number; onCambiar: (cambios: Partial<ItemCotizacion>) => void }) {
  const cortes = item.cortes || [];
  const cambiar = (i: number, cambios: Partial<(typeof cortes)[number]>) => onCambiar({ cortes: cortes.map((p, j) => (j === i ? { ...p, ...cambios } : p)) });
  const hoja = hojaDe(item.lamina);
  const r = useMemo(() => acomodarPiezas(cortes, hoja, separacion), [cortes, hoja, separacion]);
  const celdaN = `${campo} tabular-nums`;
  return (
    <div className="flex flex-col gap-2 pt-2" style={{ borderTop: '1px dashed var(--line-2)' }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[12.5px] font-semibold" style={{ color: TEXTO_PRIMARIO }}>Piezas a cortar (cm) · vista de la plancha</span>
        <Boton tamano="sm" variante="secundario" icono={Plus} onClick={() => onCambiar({ cortes: [...cortes, { ancho: 0, alto: 0, cantidad: 1 }] })}>Agregar medida</Boton>
      </div>
      {cortes.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <input aria-label="Ancho en cm" type="number" min={0} step={0.5} value={p.ancho || ''} placeholder="Ancho" onChange={(e) => cambiar(i, { ancho: Math.max(0, Number(e.target.value) || 0) })} className={celdaN} style={{ ...campoStyle, maxWidth: 90 }} />
          <span style={{ color: TEXTO_TERCIARIO }}>×</span>
          <input aria-label="Alto en cm" type="number" min={0} step={0.5} value={p.alto || ''} placeholder="Alto" onChange={(e) => cambiar(i, { alto: Math.max(0, Number(e.target.value) || 0) })} className={celdaN} style={{ ...campoStyle, maxWidth: 90 }} />
          <span className="text-[12px]" style={{ color: TEXTO_TERCIARIO }}>cant.</span>
          <input aria-label="Cantidad" type="number" min={1} step={1} value={p.cantidad || ''} onChange={(e) => cambiar(i, { cantidad: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} className={celdaN} style={{ ...campoStyle, maxWidth: 70 }} />
          <button aria-label="Quitar medida" onClick={() => onCambiar({ cortes: cortes.filter((_, j) => j !== i) })} className="p-1 rounded-md" style={{ color: TEXTO_TERCIARIO }}><Trash2 size={14} /></button>
        </div>
      ))}
      {cortes.length > 0 && (
        <>
          <VistaPlancha piezas={cortes} hoja={hoja} separacion={separacion} />
          <div className="flex gap-2 flex-wrap">
            {item.lamina !== 'ninguna' && r.planchas.length > 0 && r.planchas.length !== item.laminas && (
              <Boton tamano="sm" variante="secundario" onClick={() => onCambiar({ laminas: r.planchas.length })}>Usar {r.planchas.length} lámina{r.planchas.length === 1 ? '' : 's'}</Boton>
            )}
            {r.perimetroM > 0 && Math.abs(r.perimetroM - item.metros) > 0.05 && (
              <Boton tamano="sm" variante="secundario" onClick={() => onCambiar({ metros: r.perimetroM })}>Usar {String(r.perimetroM).replace('.', ',')} m de corte</Boton>
            )}
            {(() => {
              const total = cortes.reduce((t, p) => t + (p.ancho > 0 && p.alto > 0 ? p.cantidad : 0), 0);
              return total > 0 && total !== item.piezas ? <Boton tamano="sm" variante="secundario" onClick={() => onCambiar({ piezas: total })}>Usar {total} piezas</Boton> : null;
            })()}
          </div>
        </>
      )}
    </div>
  );
}
