import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { TARIFAS_POR_DEFECTO, type Tarifas } from './tarifas';

// true cuando la tabla no existe todavía: falta correr
// database/graficad/01-cotizador.sql en Supabase.
export const faltaInstalar = (error: { code?: string; message?: string } | null) =>
  !!error && (error.code === '42P01' || error.code === 'PGRST205' || /graficad_/.test(error.message || ''));

// Lee las tarifas guardadas de la empresa; si no hay, usa las por defecto.
export function useTarifas() {
  const { usuario } = useAuth();
  const [tarifas, setTarifas] = useState<Tarifas>(TARIFAS_POR_DEFECTO);
  const [guardadas, setGuardadas] = useState(false);
  const [sinInstalar, setSinInstalar] = useState(false);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    if (!usuario) return;
    const { data, error } = await supabase.from('graficad_tarifas').select('datos').eq('empresa_id', usuario.empresa_id).maybeSingle<{ datos: Tarifas }>();
    setSinInstalar(faltaInstalar(error));
    if (data?.datos) {
      // Campos nuevos que todavía no estén en lo guardado salen del defecto.
      setTarifas({ ...TARIFAS_POR_DEFECTO, ...data.datos });
      setGuardadas(true);
    } else {
      setTarifas(TARIFAS_POR_DEFECTO);
      setGuardadas(false);
    }
    setCargando(false);
  }, [usuario]);

  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async (nuevas: Tarifas) => {
    if (!usuario) return 'Sin sesión';
    const { error } = await supabase
      .from('graficad_tarifas')
      .upsert({ empresa_id: usuario.empresa_id, datos: nuevas, actualizado_en: new Date().toISOString() });
    if (error) return faltaInstalar(error) ? 'Falta instalar la tabla de tarifas en Supabase.' : 'No se pudo guardar.';
    setTarifas(nuevas);
    setGuardadas(true);
    return null;
  };

  return { tarifas, guardadas, sinInstalar, cargando, guardar, recargar: cargar };
}
