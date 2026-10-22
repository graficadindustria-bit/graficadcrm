import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Un solo .env en la raíz del proyecto, compartido con el cliente (lo crea
// `npm run configurar`). Desde src/config/ o dist/config/ son tres niveles arriba.
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
dotenv.config({ path: path.join(raiz, '.env') });

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY. En tu compu: corré `npm run configurar`. En el servidor: revisá los secretos de tu repo en GitHub.');
  process.exit(1);
}

export const env = {
  supabaseUrl: process.env.SUPABASE_URL as string,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY as string,
  port: Number(process.env.PORT) || 3001,
  // Carpeta donde se guardan las sesiones de WhatsApp. En el servidor apunta
  // fuera del código, para que publicar una versión nueva no obligue a
  // escanear el QR otra vez.
  authDir: process.env.AUTH_DIR || '.',
  // Sin definir: acepta cualquier origen (desarrollo). Definido: solo esos dominios.
  corsOrigin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
    : true,
};
