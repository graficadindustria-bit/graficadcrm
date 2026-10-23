import type { WAMessage } from '@whiskeysockets/baileys';
import { supabase } from '../supabase/client.js';
import { buscarOCrearContacto } from './contactos.js';
import { obtenerEmpresaIdDeLinea } from './empresa.js';

// Cuando alguien escribe desde un anuncio "Click to WhatsApp" de Meta, el
// primer mensaje trae `contextInfo.externalAdReply` con el enlace del anuncio.
// El enlace dice si salió de Facebook o de Instagram. TikTok no manda este dato
// a WhatsApp: ahí el origen se sigue cargando a mano (o con UTM, a evaluar).
export function detectarOrigenAnuncio(msg: WAMessage): string | null {
  const m = msg.message || {};
  const contexto =
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.documentMessage?.contextInfo ||
    m.audioMessage?.contextInfo ||
    m.videoMessage?.contextInfo;
  const anuncio = contexto?.externalAdReply;
  if (!anuncio) return null;

  const enlace = `${anuncio.sourceUrl || ''} ${anuncio.mediaUrl || ''}`.toLowerCase();
  if (enlace.includes('instagram.com')) return 'Instagram Ads';
  if (enlace.includes('tiktok.com')) return 'TikTok Ads';
  if (enlace.includes('facebook.com') || enlace.includes('fb.me') || enlace.includes('fb.com')) return 'Facebook Ads';
  // Hay anuncio pero el enlace no dice de qué red: es de Meta (único que usa este campo).
  return 'Facebook Ads';
}

// Guarda el origen solo si el contacto todavía no tiene uno: lo que el equipo
// escribió a mano en la ficha nunca se pisa.
export async function guardarOrigenDeAnuncio(lineaId: string, telefono: string, msg: WAMessage): Promise<void> {
  const origen = detectarOrigenAnuncio(msg);
  if (!origen || msg.key.fromMe) return;
  try {
    const empresaId = await obtenerEmpresaIdDeLinea(lineaId);
    if (!empresaId) return;
    await buscarOCrearContacto(empresaId, telefono);
    const { error } = await supabase.from('contactos').update({ origen }).eq('empresa_id', empresaId).eq('telefono', telefono).is('origen', null);
    if (error) throw error;
  } catch (err) {
    console.error(`[${lineaId}] No se pudo guardar el origen del anuncio:`, (err as Error).message);
  }
}
