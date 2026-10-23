import { supabase } from '../supabase/client.js';

const CADA_MS = 10 * 60 * 1000;
const POR_VUELTA = 200;

let corriendo = false;

// Cierra los chats abiertos de una empresa donde el último en hablar fue un
// vendedor y ya pasaron `horas` sin que el cliente conteste.
async function cerrarSinRespuesta(empresaId: string, horas: number): Promise<number> {
  const limite = new Date(Date.now() - horas * 3600_000).toISOString();

  const { data: lineas } = await supabase.from('lineas_whatsapp').select('id').eq('empresa_id', empresaId);
  const lineaIds = (lineas || []).map((l) => l.id);
  if (!lineaIds.length) return 0;

  const { data: candidatas } = await supabase
    .from('conversaciones')
    .select('id')
    .in('linea_id', lineaIds)
    .eq('estado', 'abierto')
    .lt('ultima_actividad', limite)
    .order('ultima_actividad')
    .limit(POR_VUELTA);

  let cerradas = 0;
  for (const c of candidatas || []) {
    // La actividad de la conversación no siempre se actualiza (p. ej. un mensaje
    // programado), así que el último mensaje real manda.
    const { data: ultimo } = await supabase
      .from('mensajes')
      .select('remitente, creado_en')
      .eq('conversacion_id', c.id)
      .order('creado_en', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!ultimo || ultimo.remitente !== 'agente' || ultimo.creado_en >= limite) continue;

    const { error } = await supabase.from('conversaciones').update({ estado: 'cerrado' }).eq('id', c.id).eq('estado', 'abierto');
    if (!error) cerradas++;
  }
  return cerradas;
}

async function revisar(): Promise<void> {
  const { data: empresas } = await supabase.from('empresas').select('id, cierre_auto_horas').not('cierre_auto_horas', 'is', null);
  for (const e of empresas || []) {
    const cerradas = await cerrarSinRespuesta(e.id, e.cierre_auto_horas as number);
    if (cerradas > 0) console.log(`🔒 Cierre automático: ${cerradas} chat(s) cerrados en la empresa ${e.id}`);
  }
}

// Revisa cada 10 minutos las empresas que activaron el cierre automático.
export function iniciarCierreAutomatico(): void {
  setInterval(async () => {
    if (corriendo) return;
    corriendo = true;
    try {
      await revisar();
    } catch (err) {
      console.error('Error en el cierre automático de chats:', (err as Error).message);
    } finally {
      corriendo = false;
    }
  }, CADA_MS);
}
