import type { ItemCotizacion, Lamina } from './tarifas';

// Acomodo de piezas rectangulares en láminas (nesting) para la vista previa
// de la plancha. Algoritmo MaxRects con "mejor lado corto" y rotación de 90°:
// es el que mejor aprovecha la lámina entre los simples, y para unas decenas
// de piezas corre al instante en el navegador. Medidas en cm.

export type PiezaCorte = NonNullable<ItemCotizacion['cortes']>[number];

export interface PiezaColocada {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Índice de la pieza en la lista original, para colorear igual las repetidas. */
  tipo: number;
  rotada: boolean;
}

export interface ResultadoPlancha {
  hoja: { w: number; h: number };
  planchas: PiezaColocada[][];
  /** Piezas que no entran ni en una lámina vacía. */
  noEntran: number;
  aprovechamiento: number;
  /** Perímetro total de las piezas, en metros: una base para los metros de corte. */
  perimetroM: number;
}

export const MEDIDAS_HOJA: Record<Exclude<Lamina, 'ninguna'>, { w: number; h: number }> = {
  entera: { w: 122, h: 244 },
  media: { w: 122, h: 122 },
  cuarta: { w: 122, h: 60 },
};

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const contiene = (a: Rect, b: Rect) => b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;

// Una hoja con sus rectángulos libres (MaxRects).
class Hoja {
  libres: Rect[];
  colocadas: PiezaColocada[] = [];
  constructor(w: number, h: number) {
    this.libres = [{ x: 0, y: 0, w, h }];
  }

  mejorLugar(w: number, h: number) {
    let mejor: { x: number; y: number; w: number; h: number; corto: number; largo: number } | null = null;
    for (const r of this.libres) {
      for (const [pw, ph] of [[w, h], [h, w]] as const) {
        if (pw > r.w || ph > r.h) continue;
        const corto = Math.min(r.w - pw, r.h - ph);
        const largo = Math.max(r.w - pw, r.h - ph);
        if (!mejor || corto < mejor.corto || (corto === mejor.corto && largo < mejor.largo)) mejor = { x: r.x, y: r.y, w: pw, h: ph, corto, largo };
      }
    }
    return mejor;
  }

  colocar(p: Rect) {
    const nuevos: Rect[] = [];
    for (const r of this.libres) {
      const separados = p.x >= r.x + r.w || p.x + p.w <= r.x || p.y >= r.y + r.h || p.y + p.h <= r.y;
      if (separados) {
        nuevos.push(r);
        continue;
      }
      if (p.x > r.x) nuevos.push({ x: r.x, y: r.y, w: p.x - r.x, h: r.h });
      if (p.x + p.w < r.x + r.w) nuevos.push({ x: p.x + p.w, y: r.y, w: r.x + r.w - (p.x + p.w), h: r.h });
      if (p.y > r.y) nuevos.push({ x: r.x, y: r.y, w: r.w, h: p.y - r.y });
      if (p.y + p.h < r.y + r.h) nuevos.push({ x: r.x, y: p.y + p.h, w: r.w, h: r.y + r.h - (p.y + p.h) });
    }
    this.libres = nuevos.filter((r, i) => !nuevos.some((o, j) => j !== i && contiene(o, r) && (!contiene(r, o) || j < i)));
  }
}

/**
 * Acomoda las piezas en láminas del tamaño indicado, dejando `separacion` cm
 * entre piezas y contra el borde (lo que se lleva el corte y la sujeción).
 */
export function acomodarPiezas(piezas: PiezaCorte[], hoja: { w: number; h: number }, separacion = 0.5): ResultadoPlancha {
  const s = Math.max(0, separacion);
  const lista: { w: number; h: number; tipo: number }[] = [];
  piezas.forEach((p, tipo) => {
    if (p.ancho > 0 && p.alto > 0) for (let i = 0; i < Math.min(500, Math.max(0, Math.floor(p.cantidad))); i++) lista.push({ w: p.ancho, h: p.alto, tipo });
  });
  // Primero las grandes: dejan huecos que llenan las chicas.
  lista.sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h);

  // La hoja útil descuenta el borde; cada pieza ocupa su medida + la separación.
  const util = { w: hoja.w - s, h: hoja.h - s };
  const hojas: Hoja[] = [];
  let noEntran = 0;
  for (const p of lista) {
    const w = p.w + s;
    const h = p.h + s;
    if (!((w <= util.w && h <= util.h) || (h <= util.w && w <= util.h))) {
      noEntran++;
      continue;
    }
    let lugar = null;
    let destino: Hoja | null = null;
    for (const hj of hojas) {
      lugar = hj.mejorLugar(w, h);
      if (lugar) {
        destino = hj;
        break;
      }
    }
    if (!destino || !lugar) {
      destino = new Hoja(util.w, util.h);
      hojas.push(destino);
      lugar = destino.mejorLugar(w, h)!;
    }
    destino.colocar(lugar);
    destino.colocadas.push({ x: lugar.x + s, y: lugar.y + s, w: lugar.w - s, h: lugar.h - s, tipo: p.tipo, rotada: lugar.w !== w });
  }

  const usada = hojas.reduce((t, h) => t + h.colocadas.reduce((u, p) => u + p.w * p.h, 0), 0);
  const areaHojas = hojas.length * hoja.w * hoja.h;
  const perimetro = lista.reduce((t, p) => t + 2 * (p.w + p.h), 0);
  return {
    hoja,
    planchas: hojas.map((h) => h.colocadas),
    noEntran,
    aprovechamiento: areaHojas ? Math.min(1, usada / areaHojas) : 0,
    perimetroM: Math.round(perimetro) / 100,
  };
}
