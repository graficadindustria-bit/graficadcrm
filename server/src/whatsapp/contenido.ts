import type { AnyMessageContent } from '@whiskeysockets/baileys';
import { convertirAOggOpus } from './audio.js';

export const TIPOS_ENVIABLES = ['texto', 'imagen', 'pdf', 'documento', 'audio'] as const;

interface DatosContenido {
  tipo: string;
  texto?: string | null;
  media_url?: string | null;
  mimetype?: string | null;
}

// Arma el mensaje de Baileys según el tipo. Lo usan el envío inmediato
// (routes/enviar.ts) y el de mensajes programados (programados.ts) para que
// los dos mandan exactamente lo mismo.
export async function construirContenidoWA({ tipo, texto, media_url, mimetype }: DatosContenido): Promise<AnyMessageContent> {
  if (tipo === 'texto') return { text: texto || '' };
  if (!media_url) throw new Error('Falta media_url');
  if (tipo === 'imagen') return { image: { url: media_url }, caption: texto || undefined };
  if (tipo === 'pdf') return { document: { url: media_url }, mimetype: 'application/pdf', fileName: texto || 'documento.pdf' };
  if (tipo === 'documento') {
    // Cualquier archivo (zip, Excel, Word, PPT...), no solo PDF — a
    // diferencia de 'pdf', acá el mimetype real viene del navegador
    // (input.files[0].type) porque puede ser cualquier cosa.
    return { document: { url: media_url }, mimetype: mimetype || 'application/octet-stream', fileName: texto || 'archivo' };
  }
  if (tipo === 'audio') {
    // El navegador graba en el contenedor que soporte (WebM/Opus, MP4/AAC en
    // Safari, etc.) — para que WhatsApp lo muestre como nota de voz de verdad
    // hay que mandarlo como OGG/Opus. Lo que queda guardado en `mensajes`
    // sigue siendo el archivo original; esta conversión es solo para el envío.
    const original = await fetch(media_url);
    if (!original.ok) throw new Error('No se pudo descargar el audio');
    const bufferOgg = await convertirAOggOpus(Buffer.from(await original.arrayBuffer()));
    return { audio: bufferOgg, mimetype: 'audio/ogg; codecs=opus', ptt: true };
  }
  throw new Error('Tipo no soportado');
}
