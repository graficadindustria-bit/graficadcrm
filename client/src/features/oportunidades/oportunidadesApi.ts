import { supabase } from '../../lib/supabaseClient';
import type { Oportunidad } from '../../lib/tipos';

// Aviso interno para que la ficha del chat y la pantalla Oportunidades se
// refresquen entre sí cuando una de las dos cambia algo.
export const EVENTO_OPORTUNIDADES = 'oportunidades-cambio';
const avisar = () => window.dispatchEvent(new Event(EVENTO_OPORTUNIDADES));

export const limitarProbabilidad = (n: number) => Math.min(100, Math.max(0, Math.round(Number.isFinite(n) ? n : 0)));

export async function crearOportunidad(
  empresaId: string,
  contactoId: string,
  usuarioId: string,
  datos: { producto: string; monto: number; probabilidad: number },
): Promise<boolean> {
  const { error } = await supabase.from('oportunidades').insert({
    empresa_id: empresaId,
    contacto_id: contactoId,
    creado_por: usuarioId,
    producto: datos.producto.trim() || null,
    monto: Math.max(0, datos.monto || 0),
    probabilidad: limitarProbabilidad(datos.probabilidad),
  });
  if (!error) avisar();
  return !error;
}

export async function actualizarOportunidad(id: string, cambios: Partial<Pick<Oportunidad, 'producto' | 'monto' | 'probabilidad' | 'nota'>>): Promise<boolean> {
  const { error } = await supabase.from('oportunidades').update({ ...cambios, actualizado_en: new Date().toISOString() }).eq('id', id);
  if (!error) avisar();
  return !error;
}

export async function cerrarOportunidad(id: string, estado: 'ganada' | 'perdida', motivoId: string | null = null): Promise<boolean> {
  const { error } = await supabase
    .from('oportunidades')
    .update({
      estado,
      motivo_perdida_id: estado === 'perdida' ? motivoId : null,
      probabilidad: estado === 'ganada' ? 100 : 0,
      cerrada_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    })
    .eq('id', id);
  if (!error) avisar();
  return !error;
}

export async function reabrirOportunidad(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('oportunidades')
    .update({ estado: 'abierta', motivo_perdida_id: null, cerrada_en: null, actualizado_en: new Date().toISOString() })
    .eq('id', id);
  if (!error) avisar();
  return !error;
}

export async function eliminarOportunidad(id: string): Promise<boolean> {
  const { error } = await supabase.from('oportunidades').delete().eq('id', id);
  if (!error) avisar();
  return !error;
}
