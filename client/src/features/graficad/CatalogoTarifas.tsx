import { useEffect, useState } from 'react';
import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { AMBER, TEXTO_PRIMARIO, TEXTO_SECUNDARIO, TEXTO_TERCIARIO } from '../../lib/tema';
import { Boton, EncabezadoPagina, Tarjeta, useToast } from '../../components/ui';
import { TARIFAS_POR_DEFECTO, type Material, type ModoCorte, type Tarifas } from './tarifas';
import { useTarifas } from './useTarifas';

const celda = 'w-full rounded-md px-2 py-1.5 text-[13px] outline-none tabular-nums';
const celdaStyle = { border: '1px solid var(--line-2)', backgroundColor: 'var(--surface-2)', color: 'var(--fg)' } as const;

const MODO: Record<ModoCorte, string> = {
  minuto: 'Por minuto (láser)',
  espesor: 'Bs/m = espesor',
  metro: 'Bs por metro fijo',
};

const GENERALES: { k: keyof Omit<Tarifas, 'materiales'>; label: string; unidad: string }[] = [
  { k: 'laserMinuto', label: 'Láser en acrílico, PET y PAI', unidad: 'Bs por minuto' },
  { k: 'grabadoMinuto', label: 'Grabado relleno', unidad: 'Bs por minuto' },
  { k: 'descuentoRouter', label: 'Descuento en CNC router', unidad: '% sobre el corte' },
  { k: 'factura', label: 'Recargo con factura', unidad: '%' },
  { k: 'factorMedia', label: 'Media lámina sin precio propio', unidad: 'fracción de la entera' },
  { k: 'anticipo', label: 'Anticipo para iniciar', unidad: '%' },
  { k: 'validezDias', label: 'Validez de la cotización', unidad: 'días' },
];

const num = (t: string): number | null => (t.trim() === '' ? null : Math.max(0, Number(t) || 0));

// Catálogo y tarifas: lo que usa el cotizador para calcular. Lo ve todo el
// equipo; solo supervisor y dueño pueden guardar (lo hace cumplir la base).
export default function CatalogoTarifas() {
  const toast = useToast();
  const { tarifas, guardadas, sinInstalar, cargando, guardar } = useTarifas();
  const [borrador, setBorrador] = useState<Tarifas>(tarifas);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { setBorrador(tarifas); }, [tarifas]);

  const cambiado = JSON.stringify(borrador) !== JSON.stringify(tarifas);
  const cambiarMaterial = (id: string, cambios: Partial<Material>) =>
    setBorrador((b) => ({ ...b, materiales: b.materiales.map((m) => (m.id === id ? { ...m, ...cambios } : m)) }));

  const agregar = () =>
    setBorrador((b) => ({ ...b, materiales: [...b.materiales, { id: crypto.randomUUID(), nombre: 'Nuevo material', color: 'Color', espesor: 3, entera: null, media: null, corte: 'espesor' }] }));

  const onGuardar = async () => {
    setGuardando(true);
    const error = await guardar(borrador);
    setGuardando(false);
    toast(error || 'Tarifas guardadas. Las cotizaciones nuevas ya las usan.', error ? 'error' : 'ok');
  };

  if (cargando) return <div className="p-6 text-xs" style={{ color: TEXTO_TERCIARIO }}>Cargando…</div>;

  return (
    <div className="flex-1 min-w-0 overflow-y-auto">
      <div className="p-4 md:p-6 flex flex-col gap-4">
      <EncabezadoPagina
        titulo="Catálogo y tarifas"
        subtitulo={guardadas ? 'Lo que usa el cotizador para calcular. Un cambio aquí vale para todas las cotizaciones nuevas.' : 'Todavía se usan las tarifas por defecto (Excel de corte y lista de la página web). Guardá para fijarlas.'}
        accion={
          <div className="flex gap-2 flex-wrap">
            <Boton variante="fantasma" icono={RotateCcw} onClick={() => setBorrador(TARIFAS_POR_DEFECTO)}>Valores por defecto</Boton>
            <Boton variante="primario" icono={Save} disabled={(!cambiado && guardadas) || guardando || sinInstalar} onClick={onGuardar}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>
          </div>
        }
      />

      {sinInstalar && (
        <Tarjeta className="px-4 py-3 text-[13px]" style={{ borderColor: AMBER, color: TEXTO_PRIMARIO }}>
          <b>Falta un paso en Supabase.</b> Para guardar tarifas, pegá <code>database/graficad/01-cotizador.sql</code> en el SQL Editor de Supabase y apretá Run.
        </Tarjeta>
      )}

      <Tarjeta className="p-4">
        <span className="eyebrow">Tarifas generales</span>
        <div className="grid gap-3 mt-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {GENERALES.map(({ k, label, unidad }) => (
            <div key={k} className="min-w-0">
              <label htmlFor={`g-${k}`} className="block text-[12px] font-semibold" style={{ color: TEXTO_PRIMARIO }}>{label}</label>
              <span className="block text-[11.5px] mb-1" style={{ color: TEXTO_TERCIARIO }}>{unidad}</span>
              <input id={`g-${k}`} type="number" min={0} step={k === 'factorMedia' ? 0.01 : 0.5} value={borrador[k]} onChange={(e) => setBorrador((b) => ({ ...b, [k]: num(e.target.value) ?? 0 }))} className={celda} style={celdaStyle} />
            </div>
          ))}
        </div>
        <p className="text-[12px] mt-3" style={{ color: TEXTO_TERCIARIO }}>Foam, MDF y melamina se cobran a 1 Bs por metro de corte por cada mm de espesor (5 mm = Bs 5 el metro).</p>
      </Tarjeta>

      <Tarjeta className="overflow-hidden">
        <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2 flex-wrap">
          <span className="eyebrow">Materiales · precios de venta en Bs</span>
          <Boton tamano="sm" variante="secundario" icono={Plus} onClick={agregar}>Agregar material</Boton>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]" style={{ minWidth: 900 }}>
            <thead>
              <tr className="text-left" style={{ color: TEXTO_TERCIARIO }}>
                {['Material', 'Color / tipo', 'mm', 'Lámina entera', 'Media', 'Cómo se cobra el corte', 'mm/s o Bs/m', ''].map((h) => (
                  <th key={h} className="eyebrow px-2 py-2 font-semibold" style={{ fontSize: 10.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {borrador.materiales.map((m) => (
                <tr key={m.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td className="px-2 py-1.5"><input aria-label="Material" value={m.nombre} onChange={(e) => cambiarMaterial(m.id, { nombre: e.target.value })} className={celda} style={celdaStyle} /></td>
                  <td className="px-2 py-1.5"><input aria-label="Color o tipo" value={m.color} onChange={(e) => cambiarMaterial(m.id, { color: e.target.value })} className={celda} style={celdaStyle} /></td>
                  <td className="px-2 py-1.5" style={{ width: 70 }}><input aria-label="Espesor en mm" type="number" min={0} step={0.5} value={m.espesor} onChange={(e) => cambiarMaterial(m.id, { espesor: num(e.target.value) ?? 0 })} className={celda} style={celdaStyle} /></td>
                  <td className="px-2 py-1.5" style={{ width: 110 }}><input aria-label="Precio lámina entera" type="number" min={0} step={1} value={m.entera ?? ''} placeholder="sin precio" onChange={(e) => cambiarMaterial(m.id, { entera: num(e.target.value) })} className={celda} style={celdaStyle} /></td>
                  <td className="px-2 py-1.5" style={{ width: 110 }}><input aria-label="Precio media lámina" type="number" min={0} step={1} value={m.media ?? ''} placeholder={m.entera ? `≈ ${Math.round(m.entera * borrador.factorMedia)}` : ''} onChange={(e) => cambiarMaterial(m.id, { media: num(e.target.value) })} className={celda} style={celdaStyle} /></td>
                  <td className="px-2 py-1.5" style={{ width: 170 }}>
                    <select aria-label="Cómo se cobra el corte" value={m.corte} onChange={(e) => cambiarMaterial(m.id, { corte: e.target.value as ModoCorte })} className={celda} style={celdaStyle}>
                      {(Object.keys(MODO) as ModoCorte[]).map((k) => <option key={k} value={k}>{MODO[k]}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5" style={{ width: 110 }}>
                    {m.corte === 'espesor' ? (
                      <span className="text-[12px]" style={{ color: TEXTO_SECUNDARIO }}>Bs {m.espesor}/m</span>
                    ) : (
                      <input
                        aria-label={m.corte === 'minuto' ? 'Velocidad en mm/s' : 'Bs por metro'}
                        type="number"
                        min={0}
                        step={0.5}
                        value={(m.corte === 'minuto' ? m.velocidad : m.precioMetro) ?? ''}
                        onChange={(e) => cambiarMaterial(m.id, m.corte === 'minuto' ? { velocidad: num(e.target.value) ?? 0, supuesto: false } : { precioMetro: num(e.target.value) ?? 0, supuesto: false })}
                        className={celda}
                        style={{ ...celdaStyle, ...(m.supuesto ? { borderColor: AMBER } : {}) }}
                        title={m.supuesto ? 'Valor supuesto: confirmalo con la máquina o el Excel' : undefined}
                      />
                    )}
                  </td>
                  <td className="px-2 py-1.5" style={{ width: 40 }}>
                    <button aria-label={`Quitar ${m.nombre} ${m.color} ${m.espesor} mm`} onClick={() => setBorrador((b) => ({ ...b, materiales: b.materiales.filter((x) => x.id !== m.id) }))} className="p-1 rounded-md" style={{ color: TEXTO_TERCIARIO }}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[12px] px-4 py-3" style={{ color: TEXTO_TERCIARIO }}>
          Los recuadros con borde ámbar son valores supuestos (velocidades de corte que no estaban en el Excel). Al corregirlos dejan de marcarse.
        </p>
      </Tarjeta>
      </div>
    </div>
  );
}
