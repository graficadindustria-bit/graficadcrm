import { useEffect, useRef, useState } from 'react';
import { FileText, Trash2, Upload } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { BORDE, SOMBRA_CARD, TEAL, TEXTO_PRIMARIO, TEXTO_SECUNDARIO, TEXTO_TERCIARIO } from '../../lib/tema';
import type { CampoPersonalizado, Contacto, DocumentoContacto } from '../../lib/tipos';

const TOPE_DOCUMENTO_MB = 10;

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-3.5 flex flex-col gap-3" style={{ border: `1px solid ${BORDE}`, boxShadow: SOMBRA_CARD }}>
      <span className="text-[11px] font-bold tracking-wider uppercase" style={{ color: TEXTO_TERCIARIO }}>{titulo}</span>
      {children}
    </div>
  );
}

const estiloInput = { height: 36, border: `1px solid ${BORDE}`, color: TEXTO_PRIMARIO, backgroundColor: 'var(--surface)' } as const;

// Campos propios de la empresa, folio y documentos de un contacto. Se usa en
// la pestaña "Datos" del panel del chat.
export default function FichaExtra({ contacto, onFolio }: { contacto: Contacto; onFolio: (folio: string) => void }) {
  const { usuario } = useAuth();
  const [campos, setCampos] = useState<CampoPersonalizado[]>([]);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [documentos, setDocumentos] = useState<DocumentoContacto[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vigente = true;
    setValores({});
    setDocumentos([]);
    (async () => {
      const [{ data: cs }, { data: vs }, { data: ds }] = await Promise.all([
        supabase.from('campos_personalizados').select('*').order('orden').returns<CampoPersonalizado[]>(),
        supabase.from('contacto_campos').select('campo_id, valor').eq('contacto_id', contacto.id).returns<{ campo_id: string; valor: string | null }[]>(),
        supabase.from('contacto_documentos').select('*').eq('contacto_id', contacto.id).order('creado_en', { ascending: false }).returns<DocumentoContacto[]>(),
      ]);
      if (!vigente) return;
      setCampos(cs || []);
      setValores(Object.fromEntries((vs || []).map((v) => [v.campo_id, v.valor ?? ''])));
      setDocumentos(ds || []);
    })();
    return () => {
      vigente = false;
    };
  }, [contacto.id]);

  const guardarValor = async (campo: CampoPersonalizado, valor: string) => {
    if ((valores[campo.id] ?? '') === valor) return;
    setValores((prev) => ({ ...prev, [campo.id]: valor }));
    const { error: e } = await supabase.from('contacto_campos').upsert({ contacto_id: contacto.id, campo_id: campo.id, valor: valor || null });
    if (e) setError('No se pudo guardar un dato.');
  };

  const guardarFolio = async (folio: string) => {
    const limpio = folio.trim();
    if (limpio === (contacto.folio ?? '')) return;
    const { error: e } = await supabase.from('contactos').update({ folio: limpio || null }).eq('id', contacto.id);
    if (e) return setError('No se pudo guardar el folio.');
    onFolio(limpio);
  };

  const subir = async (file: File) => {
    setError('');
    if (file.size > TOPE_DOCUMENTO_MB * 1024 * 1024) return setError(`El archivo pesa más de ${TOPE_DOCUMENTO_MB} MB.`);
    setSubiendo(true);
    try {
      const limpio = file.name.replace(/[^\w.-]+/g, '_');
      const ruta = `documentos/${contacto.empresa_id}/${contacto.id}/${Date.now()}-${limpio}`;
      const { error: errorSubida } = await supabase.storage.from('media').upload(ruta, file);
      if (errorSubida) throw errorSubida;
      const { data: pub } = supabase.storage.from('media').getPublicUrl(ruta);
      const { data: fila, error: errorFila } = await supabase
        .from('contacto_documentos')
        .insert({ contacto_id: contacto.id, nombre: file.name, ruta, url: pub.publicUrl, tamano: file.size, subido_por: usuario?.id ?? null })
        .select('*')
        .single<DocumentoContacto>();
      if (errorFila) throw errorFila;
      setDocumentos((prev) => [fila, ...prev]);
    } catch {
      setError('No se pudo subir el documento.');
    } finally {
      setSubiendo(false);
    }
  };

  const quitar = async (d: DocumentoContacto) => {
    if (!window.confirm(`¿Borrar «${d.nombre}»?`)) return;
    await supabase.storage.from('media').remove([d.ruta]);
    await supabase.from('contacto_documentos').delete().eq('id', d.id);
    setDocumentos((prev) => prev.filter((x) => x.id !== d.id));
  };

  return (
    <>
      {campos.length > 0 && (
        <Seccion titulo="Datos del negocio">
          {campos.map((c) => (
            <label key={c.id} className="flex flex-col gap-1.5 text-xs font-semibold" style={{ color: 'var(--fg-2)' }}>
              {c.nombre}
              {c.tipo === 'seleccion' ? (
                <select value={valores[c.id] ?? ''} onChange={(e) => guardarValor(c, e.target.value)} className="rounded-lg px-2.5 outline-none font-normal text-[13.5px]" style={estiloInput}>
                  <option value="">—</option>
                  {c.opciones.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : c.tipo === 'casilla' ? (
                <span className="flex items-center gap-2 font-normal text-[13.5px]" style={{ color: TEXTO_PRIMARIO }}>
                  <input type="checkbox" checked={valores[c.id] === 'si'} onChange={(e) => guardarValor(c, e.target.checked ? 'si' : '')} />
                  Sí
                </span>
              ) : (
                <input
                  key={`${contacto.id}-${c.id}-${valores[c.id] === undefined ? 'n' : 'v'}`}
                  type={c.tipo === 'numero' ? 'number' : c.tipo === 'fecha' ? 'date' : 'text'}
                  defaultValue={valores[c.id] ?? ''}
                  onBlur={(e) => guardarValor(c, e.target.value)}
                  className="rounded-lg px-2.5 outline-none font-normal text-[13.5px]"
                  style={estiloInput}
                />
              )}
            </label>
          ))}
        </Seccion>
      )}

      <Seccion titulo="Folio y documentos">
        <label className="flex flex-col gap-1.5 text-xs font-semibold" style={{ color: 'var(--fg-2)' }}>
          Folio del cliente
          <input key={contacto.id} defaultValue={contacto.folio ?? ''} onBlur={(e) => guardarFolio(e.target.value)} placeholder="Ej: C-0042" className="rounded-lg px-2.5 outline-none font-normal text-[13.5px]" style={estiloInput} />
        </label>
        <input ref={inputRef} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) subir(f); }} />
        {documentos.map((d) => (
          <div key={d.id} className="flex items-center gap-2 rounded-lg px-2.5 py-2" style={{ border: `1px solid ${BORDE}` }}>
            <FileText size={15} color={TEAL} className="shrink-0" />
            <a href={d.url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 truncate text-[12.5px] font-medium" style={{ color: TEXTO_PRIMARIO }} title={d.nombre}>{d.nombre}</a>
            <button onClick={() => quitar(d)} aria-label={`Borrar ${d.nombre}`}><Trash2 size={13} color={TEXTO_TERCIARIO} /></button>
          </div>
        ))}
        <button onClick={() => inputRef.current?.click()} disabled={subiendo} className="flex items-center justify-center gap-1.5 rounded-lg text-[12.5px] font-semibold" style={{ height: 36, border: '1.5px dashed var(--line-2)', color: TEXTO_SECUNDARIO }}>
          <Upload size={13} />{subiendo ? 'Subiendo…' : `Subir documento (máx. ${TOPE_DOCUMENTO_MB} MB)`}
        </button>
        {error && <span className="text-[11.5px]" style={{ color: 'var(--bad)' }}>{error}</span>}
      </Seccion>
    </>
  );
}
