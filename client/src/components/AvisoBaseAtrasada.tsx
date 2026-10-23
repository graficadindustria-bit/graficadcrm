import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { VERSION_BASE_ESPERADA } from '../lib/version';

// Avisa cuando la base de datos de Supabase es más vieja que el código: pasa si
// hiciste "Sync fork" y publicaste, pero todavía no corriste database/actualizar.sql.
// Sin ese archivo, las pantallas nuevas fallan al leer columnas o tablas que no existen.
export default function AvisoBaseAtrasada() {
  const [version, setVersion] = useState<number | null>(null);
  const [cerrado, setCerrado] = useState(false);

  useEffect(() => {
    let vivo = true;
    supabase
      .from('esquema_version')
      .select('version')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data, error }) => {
        // Si la tabla no existe (error) o está vacía, la base es anterior a las versiones.
        if (vivo) setVersion(error || !data ? 0 : (data as { version: number }).version);
      });
    return () => { vivo = false; };
  }, []);

  if (cerrado || version === null || version >= VERSION_BASE_ESPERADA) return null;

  return (
    <div
      role="alert"
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] w-[min(640px,calc(100vw-24px))] rounded-xl shadow-lg flex items-start gap-3 px-4 py-3"
      style={{ backgroundColor: '#FFF4E5', border: '1px solid #E8A33D', color: '#5A3A00' }}
    >
      <AlertTriangle size={20} className="shrink-0 mt-0.5" />
      <div className="text-[13px] leading-snug flex-1">
        <div className="font-bold text-[14px] mb-0.5">Tu base de datos está desactualizada</div>
        Tu CRM tiene mejoras nuevas que necesitan una actualización. Entrá a tu Supabase → <b>SQL Editor</b>, pegá
        todo el archivo <b>database/actualizar.sql</b> y apretá <b>Run</b>. Se hace una sola vez y es seguro repetirlo.
      </div>
      <button onClick={() => setCerrado(true)} aria-label="Cerrar aviso" className="shrink-0 opacity-70 hover:opacity-100">
        <X size={18} />
      </button>
    </div>
  );
}
