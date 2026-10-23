import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { BORDE, SOMBRA_CARD, TEAL, TEXTO_PRIMARIO, TEXTO_SECUNDARIO, TEXTO_TERCIARIO } from '../../lib/tema';
import type { CampoPersonalizado, TipoCampo } from '../../lib/tipos';

export const NOMBRE_TIPO_CAMPO: Record<TipoCampo, string> = {
  texto: 'Texto',
  numero: 'Número',
  fecha: 'Fecha',
  seleccion: 'Selección',
  casilla: 'Casilla (sí/no)',
};

// Define qué datos extra guarda cada empresa en la ficha de sus clientes
// (ej. una empresa de gas: placa, modelo, precio).
export default function CamposPersonalizados() {
  const { usuario } = useAuth();
  const [campos, setCampos] = useState<CampoPersonalizado[]>([]);
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoCampo>('texto');
  const [opciones, setOpciones] = useState('');
  const [error, setError] = useState('');

  const cargar = async () => {
    const { data } = await supabase.from('campos_personalizados').select('*').order('orden').returns<CampoPersonalizado[]>();
    setCampos(data || []);
  };
  useEffect(() => {
    cargar();
  }, []);

  const agregar = async () => {
    setError('');
    const lista = opciones.split(',').map((o) => o.trim()).filter(Boolean);
    if (!nombre.trim()) return;
    if (tipo === 'seleccion' && lista.length < 2) return setError('Escribe al menos 2 opciones separadas por coma.');
    const orden = Math.max(0, ...campos.map((c) => c.orden)) + 1;
    const { error: errorInsert } = await supabase
      .from('campos_personalizados')
      .insert({ empresa_id: usuario!.empresa_id, nombre: nombre.trim(), tipo, opciones: tipo === 'seleccion' ? lista : [], orden });
    if (errorInsert) return setError('No se pudo guardar el campo.');
    setNombre('');
    setOpciones('');
    cargar();
  };

  const quitar = async (c: CampoPersonalizado) => {
    if (!window.confirm(`¿Quitar el campo «${c.nombre}»? Se borran también los valores guardados en cada cliente.`)) return;
    await supabase.from('campos_personalizados').delete().eq('id', c.id);
    cargar();
  };

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3.5 max-w-xl" style={{ backgroundColor: 'var(--surface)', border: `1px solid ${BORDE}`, boxShadow: SOMBRA_CARD }}>
      <span className="text-[15px] font-bold tracking-tight" style={{ color: TEXTO_PRIMARIO }}>Campos de la ficha del cliente</span>
      <p className="m-0 text-[12.5px] leading-relaxed" style={{ color: TEXTO_SECUNDARIO }}>
        Datos propios de tu negocio que tu equipo completa en la ficha de cada cliente (por ejemplo placa, modelo o categoría de producto).
      </p>
      <div className="flex flex-col gap-1.5">
        {campos.length === 0 && <span className="text-[12.5px]" style={{ color: TEXTO_TERCIARIO }}>Todavía no hay campos propios.</span>}
        {campos.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ border: `1px solid ${BORDE}` }}>
            <span className="flex-1 min-w-0 truncate text-[13.5px] font-medium" style={{ color: TEXTO_PRIMARIO }}>{c.nombre}</span>
            <span className="text-[11.5px] shrink-0" style={{ color: TEXTO_TERCIARIO }}>
              {NOMBRE_TIPO_CAMPO[c.tipo]}{c.tipo === 'seleccion' ? ` · ${c.opciones.join(', ')}` : ''}
            </span>
            <button onClick={() => quitar(c)} aria-label={`Quitar ${c.nombre}`}><X size={14} color={TEXTO_TERCIARIO} /></button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && agregar()}
          placeholder="Nombre del campo (ej. Placa)"
          className="flex-1 min-w-[160px] rounded-lg px-2.5 outline-none text-[13px]"
          style={{ height: 38, border: `1px solid ${BORDE}`, color: TEXTO_PRIMARIO }}
        />
        <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoCampo)} aria-label="Tipo de campo" className="rounded-lg px-2 text-[13px] outline-none" style={{ height: 38, border: `1px solid ${BORDE}`, color: TEXTO_PRIMARIO, backgroundColor: 'var(--surface)' }}>
          {(Object.keys(NOMBRE_TIPO_CAMPO) as TipoCampo[]).map((t) => <option key={t} value={t}>{NOMBRE_TIPO_CAMPO[t]}</option>)}
        </select>
        <button onClick={agregar} aria-label="Agregar campo" className="rounded-lg px-3 flex items-center justify-center shrink-0" style={{ height: 38, backgroundColor: TEAL }}>
          <Plus size={14} color="white" />
        </button>
      </div>
      {tipo === 'seleccion' && (
        <input
          value={opciones}
          onChange={(e) => setOpciones(e.target.value)}
          placeholder="Opciones separadas por coma (ej. Sedán, Camioneta, Moto)"
          className="rounded-lg px-2.5 outline-none text-[13px]"
          style={{ height: 38, border: `1px solid ${BORDE}`, color: TEXTO_PRIMARIO }}
        />
      )}
      {error && <span className="text-xs" style={{ color: 'var(--bad)' }}>{error}</span>}
    </div>
  );
}
