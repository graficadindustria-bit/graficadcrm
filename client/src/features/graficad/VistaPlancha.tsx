import { useMemo } from 'react';
import { AMBER, TEXTO_SECUNDARIO, TEXTO_TERCIARIO } from '../../lib/tema';
import { acomodarPiezas, type PiezaCorte } from './plancha';

// Colores por tipo de pieza: las repetidas se ven del mismo color.
const COLORES = ['#F59E0B', '#3B82F6', '#10B981', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

// Vista previa de cómo quedan las piezas acomodadas en las láminas.
export default function VistaPlancha({ piezas, hoja, separacion, alto = 220 }: { piezas: PiezaCorte[]; hoja: { w: number; h: number }; separacion: number; alto?: number }) {
  const r = useMemo(() => acomodarPiezas(piezas, hoja, separacion), [piezas, hoja, separacion]);
  if (!r.planchas.length && !r.noEntran) return null;
  const escala = alto / hoja.h;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-3 flex-wrap items-end">
        {r.planchas.map((pl, i) => (
          <figure key={i} className="flex flex-col items-center gap-1 m-0">
            <svg width={hoja.w * escala} height={hoja.h * escala} viewBox={`0 0 ${hoja.w} ${hoja.h}`} role="img" aria-label={`Lámina ${i + 1} con ${pl.length} piezas`} style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--line-2)', borderRadius: 4 }}>
              {pl.map((p, j) => (
                <g key={j}>
                  <rect x={p.x} y={p.y} width={p.w} height={p.h} fill={COLORES[p.tipo % COLORES.length]} fillOpacity={0.35} stroke={COLORES[p.tipo % COLORES.length]} strokeWidth={0.6} />
                  {p.w > 14 && p.h > 6 && (
                    <text x={p.x + p.w / 2} y={p.y + p.h / 2} fontSize={Math.min(6, p.w / 6, p.h / 2)} textAnchor="middle" dominantBaseline="middle" fill="var(--fg)">
                      {fmt(p.rotada ? p.h : p.w)}×{fmt(p.rotada ? p.w : p.h)}
                    </text>
                  )}
                </g>
              ))}
            </svg>
            <figcaption className="text-[11px]" style={{ color: TEXTO_TERCIARIO }}>Lámina {i + 1} · {pl.length} pzs</figcaption>
          </figure>
        ))}
      </div>
      <p className="text-[12px]" style={{ color: TEXTO_SECUNDARIO }}>
        {r.planchas.length} lámina{r.planchas.length === 1 ? '' : 's'} de {hoja.w} × {hoja.h} cm · aprovechamiento {Math.round(r.aprovechamiento * 100)} % · perímetro de corte ≈ {fmt(r.perimetroM)} m
      </p>
      {r.noEntran > 0 && (
        <p className="text-[12px]" style={{ color: AMBER }}>
          {r.noEntran} pieza{r.noEntran === 1 ? '' : 's'} no entra{r.noEntran === 1 ? '' : 'n'} en esta lámina: hay que partirla{r.noEntran === 1 ? '' : 's'} o usar una lámina más grande.
        </p>
      )}
    </div>
  );
}
