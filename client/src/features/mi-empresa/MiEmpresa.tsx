import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../lib/AuthContext';
import { llamarBackend } from '../../lib/backend';
import { NAVY, TEAL, BORDE, SOMBRA_CARD, TEXTO_PRIMARIO, TEXTO_SECUNDARIO, TEXTO_TERCIARIO } from '../../lib/tema';
import LogoEmpresa from '../../components/LogoEmpresa';
import CamposPersonalizados from './CamposPersonalizados';

const PRIMARIO_DEFECTO = '#0B1B33';
const ACENTO_DEFECTO = 'var(--accent)';

export default function MiEmpresa() {
  const { empresa, recargarEmpresa } = useAuth();
  const [colorPrimario, setColorPrimario] = useState(empresa?.color_primario || PRIMARIO_DEFECTO);
  const [colorAcento, setColorAcento] = useState(empresa?.color_acento || ACENTO_DEFECTO);
  const [logoUrl, setLogoUrl] = useState(empresa?.logo_url || '');
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [cierreActivo, setCierreActivo] = useState(empresa?.cierre_auto_horas != null);
  const [cierreHoras, setCierreHoras] = useState(String(empresa?.cierre_auto_horas ?? 24));
  const [guardandoCierre, setGuardandoCierre] = useState(false);
  const [mensajeCierre, setMensajeCierre] = useState('');
  const [errorCierre, setErrorCierre] = useState('');
  const inputLogoRef = useRef<HTMLInputElement>(null);

  const subirLogo = async (file: File) => {
    if (!empresa) return;
    setSubiendoLogo(true);
    setError('');
    try {
      const ext = file.name.split('.').pop();
      const ruta = `logos/${empresa.id}.${ext}`;
      const { error: errorSubida } = await supabase.storage.from('media').upload(ruta, file, { upsert: true });
      if (errorSubida) throw errorSubida;
      const { data } = supabase.storage.from('media').getPublicUrl(ruta);
      // cache-bust para ver el logo nuevo al toque, sin esperar a que el navegador refresque el caché
      setLogoUrl(`${data.publicUrl}?v=${Date.now()}`);
    } catch (err) {
      setError('No se pudo subir el logo.');
    } finally {
      setSubiendoLogo(false);
    }
  };

  const guardar = async () => {
    setGuardando(true);
    setMensaje('');
    setError('');
    try {
      const { ok, error: errorApi } = await llamarBackend(
        '/empresas/mi-empresa',
        { color_primario: colorPrimario, color_acento: colorAcento, logo_url: logoUrl || null },
        'PATCH',
      );
      if (!ok) throw new Error(errorApi || 'No se pudo guardar');
      await recargarEmpresa();
      setMensaje('Guardado');
    } catch (err) {
      setError((err as Error).message || 'No se pudo guardar. Revisá que el backend esté corriendo.');
    } finally {
      setGuardando(false);
    }
  };

  const guardarCierre = async () => {
    setMensajeCierre('');
    setErrorCierre('');
    const horas = Number(cierreHoras);
    if (cierreActivo && (!Number.isInteger(horas) || horas < 1 || horas > 720)) {
      return setErrorCierre('Escribe un número entero de horas entre 1 y 720.');
    }
    setGuardandoCierre(true);
    try {
      const { ok, error: errorApi } = await llamarBackend('/empresas/mi-empresa', { cierre_auto_horas: cierreActivo ? horas : null }, 'PATCH');
      if (!ok) throw new Error(errorApi || 'No se pudo guardar');
      await recargarEmpresa();
      setMensajeCierre('Guardado');
    } catch (err) {
      setErrorCierre((err as Error).message || 'No se pudo guardar. Revisa que el backend esté corriendo.');
    } finally {
      setGuardandoCierre(false);
    }
  };

  return (
    <div className="flex-1 min-w-0 overflow-y-auto">
      <div className="px-4 md:px-8 py-4 md:py-6 flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[22px] font-bold tracking-tight" style={{ color: TEXTO_PRIMARIO }}>Mi empresa</h1>
          <p className="m-0 text-[13.5px]" style={{ color: TEXTO_SECUNDARIO }}>Marca blanca: así ven la bandeja tus agentes.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="rounded-2xl p-5 flex flex-col" style={{ gap: 18, backgroundColor: 'var(--surface)', border: `1px solid ${BORDE}`, boxShadow: SOMBRA_CARD }}>
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold" style={{ color: 'var(--fg-2)' }}>Logo</span>
              <div className="flex items-center gap-3.5">
                <LogoEmpresa logoUrl={logoUrl} nombre={empresa?.nombre} size={56} />
                <input
                  ref={inputLogoRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => e.target.files?.[0] && subirLogo(e.target.files[0])}
                />
                <button
                  onClick={() => inputLogoRef.current?.click()}
                  disabled={subiendoLogo}
                  className="flex-1 flex flex-col gap-0.5 rounded-lg px-3.5 py-3 text-left"
                  style={{ border: '2px dashed var(--line-2)', backgroundColor: '#F9FBFD' }}
                >
                  <span className="text-[13px] font-semibold flex items-center gap-1.5" style={{ color: 'var(--fg)' }}><Upload size={13} />{subiendoLogo ? 'Subiendo...' : 'Subir logo'}</span>
                  <span className="text-[11.5px]" style={{ color: TEXTO_TERCIARIO, fontFamily: 'ui-monospace, monospace' }}>PNG o SVG · mín. 256×256</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold" style={{ color: 'var(--fg-2)' }}>Color primario</span>
                <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2" style={{ border: `1px solid ${BORDE}` }}>
                  <input type="color" value={colorPrimario} onChange={(e) => setColorPrimario(e.target.value)} className="rounded-md cursor-pointer border-0" style={{ width: 26, height: 26 }} />
                  <span className="text-[13.5px]" style={{ color: TEXTO_PRIMARIO, fontFamily: 'ui-monospace, monospace' }}>{colorPrimario}</span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold" style={{ color: 'var(--fg-2)' }}>Color de acento</span>
                <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2" style={{ border: `1px solid ${BORDE}` }}>
                  <input type="color" value={colorAcento} onChange={(e) => setColorAcento(e.target.value)} className="rounded-md cursor-pointer border-0" style={{ width: 26, height: 26 }} />
                  <span className="text-[13.5px]" style={{ color: TEXTO_PRIMARIO, fontFamily: 'ui-monospace, monospace' }}>{colorAcento}</span>
                </div>
              </div>
            </div>

            {error && <div className="text-xs" style={{ color: 'var(--bad)' }}>{error}</div>}
            {mensaje && <div className="text-xs" style={{ color: TEAL }}>{mensaje}</div>}

            <button
              onClick={guardar}
              disabled={guardando}
              className="self-start text-[13.5px] font-semibold rounded-lg px-4"
              style={{ height: 40, backgroundColor: NAVY, color: 'white', opacity: guardando ? 0.6 : 1 }}
            >
              {guardando ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>

          <div className="rounded-2xl p-5 flex flex-col gap-3.5" style={{ backgroundColor: 'var(--surface)', border: `1px solid ${BORDE}`, boxShadow: SOMBRA_CARD }}>
            <span className="text-[11px] font-bold tracking-wider uppercase" style={{ color: TEXTO_TERCIARIO }}>Vista previa en vivo</span>
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${BORDE}` }}>
              <div className="flex items-center gap-2.5 px-4 py-3.5" style={{ backgroundColor: colorPrimario }}>
                <LogoEmpresa logoUrl={logoUrl} nombre={empresa?.nombre} size={28} />
                <span className="text-white text-sm font-semibold">Bandeja {empresa?.nombre}</span>
              </div>
              <div className="px-4 py-5 flex flex-col gap-3" style={{ backgroundColor: 'var(--surface-2)' }}>
                <span className="text-[13px]" style={{ color: 'var(--fg-2)' }}>Así se ve un botón principal con tu acento:</span>
                <button className="self-start text-[13.5px] font-semibold rounded-lg px-4" style={{ height: 38, backgroundColor: colorAcento, color: 'white' }}>Resolver conversación</button>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl p-5 flex flex-col gap-3.5 max-w-xl" style={{ backgroundColor: 'var(--surface)', border: `1px solid ${BORDE}`, boxShadow: SOMBRA_CARD }}>
          <span className="text-[15px] font-bold tracking-tight" style={{ color: TEXTO_PRIMARIO }}>Cierre automático de chats</span>
          <p className="m-0 text-[12.5px] leading-relaxed" style={{ color: TEXTO_SECUNDARIO }}>
            Si el último mensaje del chat fue de un vendedor y el cliente no contesta, el chat se cierra solo pasado este tiempo.
            Si el cliente vuelve a escribir, el chat se reabre.
          </p>
          <label className="flex items-center gap-2 text-[13.5px]" style={{ color: TEXTO_PRIMARIO }}>
            <input type="checkbox" checked={cierreActivo} onChange={(e) => setCierreActivo(e.target.checked)} />
            Cerrar chats sin respuesta del cliente
          </label>
          {cierreActivo && (
            <label className="flex items-center gap-2 text-[13.5px]" style={{ color: TEXTO_PRIMARIO }}>
              Después de
              <input
                type="number"
                min={1}
                max={720}
                value={cierreHoras}
                onChange={(e) => setCierreHoras(e.target.value)}
                className="rounded-lg px-2.5 outline-none text-[13.5px]"
                style={{ border: `1px solid ${BORDE}`, color: TEXTO_PRIMARIO, height: 40, width: 90 }}
              />
              horas
            </label>
          )}
          {errorCierre && <span className="text-xs" style={{ color: 'var(--bad)' }}>{errorCierre}</span>}
          {mensajeCierre && <span className="text-xs" style={{ color: TEAL }}>{mensajeCierre}</span>}
          <button onClick={guardarCierre} disabled={guardandoCierre} className="self-start text-[13.5px] font-semibold rounded-lg px-4" style={{ height: 40, backgroundColor: NAVY, color: 'white', opacity: guardandoCierre ? 0.6 : 1 }}>
            {guardandoCierre ? 'Guardando...' : 'Guardar'}
          </button>
        </div>

        <CamposPersonalizados />
      </div>
    </div>
  );
}
