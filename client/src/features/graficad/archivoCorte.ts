import type { ArchivoCorte } from './tarifas';

// Lectura de archivos de corte (DXF, SVG y PLT) en el navegador. De cada
// archivo sale una lista de contornos en mm; con eso se mide el largo de corte,
// el recorrido en vacío del cabezal entre figuras y las piezas (contornos
// cerrados que no son agujeros de otro), que después se acomodan en la lámina.

type Punto = [number, number];
interface Contorno {
  pts: Punto[];
  cerrado: boolean;
}

export type Unidad = ArchivoCorte['unidad'];
export const MM_POR: Record<Unidad, number> = { mm: 1, cm: 10, in: 25.4 };
export const NOMBRE_UNIDAD: Record<Unidad, string> = { mm: 'milímetros', cm: 'centímetros', in: 'pulgadas' };

const TOLERANCIA = 0.05; // mm: dos puntos más cerca que esto son el mismo
const dist = (a: Punto, b: Punto) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const largo = (pts: Punto[]) => pts.reduce((t, p, i) => (i ? t + dist(pts[i - 1], p) : 0), 0);

function arco(cx: number, cy: number, r: number, desde: number, hasta: number): Punto[] {
  const barrido = hasta - desde;
  // Un punto cada ~1 unidad del archivo, con un mínimo para círculos chicos.
  const pasos = Math.min(720, Math.max(32, Math.ceil(Math.abs(barrido) * r)));
  const pts: Punto[] = [];
  for (let i = 0; i <= pasos; i++) {
    const a = desde + (barrido * i) / pasos;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

// Tramo curvo de una polilínea DXF: "bulge" = tan(ángulo/4).
function arcoBulge(p1: Punto, p2: Punto, bulge: number): Punto[] {
  const d = dist(p1, p2);
  if (!bulge || d < 1e-9) return [p2];
  const theta = 4 * Math.atan(bulge);
  const r = d / (2 * Math.sin(theta / 2));
  const medio: Punto = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
  const h = r * Math.cos(theta / 2);
  const ux = (p2[0] - p1[0]) / d;
  const uy = (p2[1] - p1[1]) / d;
  // El centro queda a la izquierda de la cuerda si el bulge es positivo.
  const cx = medio[0] - uy * h;
  const cy = medio[1] + ux * h;
  const a1 = Math.atan2(p1[1] - cy, p1[0] - cx);
  const pts = arco(cx, cy, Math.abs(r), a1, a1 + theta);
  return pts.slice(1);
}

// ---------- DXF ----------

function leerDxf(texto: string): { contornos: Contorno[]; unidad: Unidad | null } {
  const lineas = texto.split(/\r?\n/);
  const pares: [number, string][] = [];
  for (let i = 0; i + 1 < lineas.length; i += 2) pares.push([parseInt(lineas[i].trim(), 10), lineas[i + 1].trim()]);

  let unidad: Unidad | null = null;
  const iu = pares.findIndex(([c, v]) => c === 9 && v === '$INSUNITS');
  if (iu >= 0) {
    const v = parseInt(pares[iu + 1]?.[1] ?? '', 10);
    unidad = v === 1 ? 'in' : v === 4 ? 'mm' : v === 5 ? 'cm' : null;
  }

  // Entidades de la sección ENTITIES (los bloques se ignoran).
  const inicio = pares.findIndex(([c, v], i) => c === 2 && v === 'ENTITIES' && pares[i - 1]?.[1] === 'SECTION');
  if (inicio < 0) return { contornos: [], unidad };
  const entidades: { tipo: string; datos: [number, string][] }[] = [];
  for (let i = inicio + 1; i < pares.length; i++) {
    const [c, v] = pares[i];
    if (c === 0) {
      if (v === 'ENDSEC') break;
      entidades.push({ tipo: v, datos: [] });
    } else entidades[entidades.length - 1]?.datos.push([c, v]);
  }

  const num = (d: [number, string][], c: number, def = 0) => {
    const x = d.find(([k]) => k === c);
    return x ? parseFloat(x[1]) : def;
  };
  const contornos: Contorno[] = [];
  const conBulges = (vs: { p: Punto; b: number }[], cerrado: boolean) => {
    if (vs.length < 2) return;
    const pts: Punto[] = [vs[0].p];
    const tramos = cerrado ? vs.length : vs.length - 1;
    for (let i = 0; i < tramos; i++) pts.push(...arcoBulge(vs[i].p, vs[(i + 1) % vs.length].p, vs[i].b));
    contornos.push({ pts, cerrado });
  };

  for (let i = 0; i < entidades.length; i++) {
    const { tipo, datos: d } = entidades[i];
    if (tipo === 'LINE') {
      contornos.push({ pts: [[num(d, 10), num(d, 20)], [num(d, 11), num(d, 21)]], cerrado: false });
    } else if (tipo === 'CIRCLE') {
      contornos.push({ pts: arco(num(d, 10), num(d, 20), num(d, 40), 0, 2 * Math.PI), cerrado: true });
    } else if (tipo === 'ARC') {
      const a1 = (num(d, 50) * Math.PI) / 180;
      let a2 = (num(d, 51) * Math.PI) / 180;
      if (a2 <= a1) a2 += 2 * Math.PI;
      contornos.push({ pts: arco(num(d, 10), num(d, 20), num(d, 40), a1, a2), cerrado: false });
    } else if (tipo === 'ELLIPSE') {
      const cx = num(d, 10), cy = num(d, 20), mx = num(d, 11), my = num(d, 21), k = num(d, 40, 1);
      const t1 = num(d, 41, 0);
      let t2 = num(d, 42, 2 * Math.PI);
      if (t2 <= t1) t2 += 2 * Math.PI;
      const pasos = 180;
      const pts: Punto[] = [];
      for (let j = 0; j <= pasos; j++) {
        const t = t1 + ((t2 - t1) * j) / pasos;
        pts.push([cx + mx * Math.cos(t) - my * k * Math.sin(t), cy + my * Math.cos(t) + mx * k * Math.sin(t)]);
      }
      contornos.push({ pts, cerrado: Math.abs(t2 - t1 - 2 * Math.PI) < 1e-6 });
    } else if (tipo === 'LWPOLYLINE') {
      const vs: { p: Punto; b: number }[] = [];
      for (const [c, v] of d) {
        if (c === 10) vs.push({ p: [parseFloat(v), 0], b: 0 });
        else if (c === 20 && vs.length) vs[vs.length - 1].p[1] = parseFloat(v);
        else if (c === 42 && vs.length) vs[vs.length - 1].b = parseFloat(v);
      }
      conBulges(vs, (num(d, 70) & 1) === 1);
    } else if (tipo === 'POLYLINE') {
      const vs: { p: Punto; b: number }[] = [];
      let j = i + 1;
      for (; j < entidades.length && entidades[j].tipo === 'VERTEX'; j++) {
        const dv = entidades[j].datos;
        vs.push({ p: [num(dv, 10), num(dv, 20)], b: num(dv, 42) });
      }
      conBulges(vs, (num(d, 70) & 1) === 1);
      i = j; // salta los VERTEX y el SEQEND
    } else if (tipo === 'SPLINE') {
      const grado = num(d, 71, 3);
      const nudos = d.filter(([c]) => c === 40).map(([, v]) => parseFloat(v));
      const ctrl: Punto[] = [];
      const ajuste: Punto[] = [];
      for (const [c, v] of d) {
        if (c === 10) ctrl.push([parseFloat(v), 0]);
        else if (c === 20 && ctrl.length) ctrl[ctrl.length - 1][1] = parseFloat(v);
        else if (c === 11) ajuste.push([parseFloat(v), 0]);
        else if (c === 21 && ajuste.length) ajuste[ajuste.length - 1][1] = parseFloat(v);
      }
      const pts = ctrl.length > grado && nudos.length === ctrl.length + grado + 1 ? bspline(ctrl, nudos, grado) : ajuste.length > 1 ? ajuste : ctrl;
      if (pts.length > 1) contornos.push({ pts, cerrado: (num(d, 70) & 1) === 1 });
    }
  }
  return { contornos, unidad };
}

// Curva B-spline por De Boor, muestreada en tramos parejos.
function bspline(ctrl: Punto[], nudos: number[], p: number): Punto[] {
  const t0 = nudos[p];
  const t1 = nudos[nudos.length - p - 1];
  const pasos = Math.min(2000, ctrl.length * 16);
  const pts: Punto[] = [];
  for (let s = 0; s <= pasos; s++) {
    const t = s === pasos ? t1 - 1e-9 : t0 + ((t1 - t0) * s) / pasos;
    let k = p;
    while (k < nudos.length - p - 2 && t >= nudos[k + 1]) k++;
    const dd = ctrl.slice(k - p, k + 1).map((q) => [q[0], q[1]] as Punto);
    for (let r = 1; r <= p; r++) {
      for (let j = p; j >= r; j--) {
        const den = nudos[j + 1 + k - r] - nudos[j + k - p];
        const a = den ? (t - nudos[j + k - p]) / den : 0;
        dd[j] = [(1 - a) * dd[j - 1][0] + a * dd[j][0], (1 - a) * dd[j - 1][1] + a * dd[j][1]];
      }
    }
    pts.push(dd[p]);
  }
  return pts;
}

// ---------- PLT (HPGL) ----------

function leerPlt(texto: string): Contorno[] {
  const UNIDAD = 0.025; // mm por unidad de plotter (40 por mm)
  const contornos: Contorno[] = [];
  let actual: Punto[] | null = null;
  let pos: Punto = [0, 0];
  let bajo = false;
  let relativo = false;
  const cerrar = () => {
    if (actual && actual.length > 1) contornos.push({ pts: actual, cerrado: false });
    actual = null;
  };
  const re = /([A-Z]{2})([^A-Z;]*)/g;
  let m: RegExpExecArray | null;
  const limpio = texto.toUpperCase().replace(/\x1b[^A-Z]*[A-Z]?/g, '');
  while ((m = re.exec(limpio))) {
    const cmd = m[1];
    const nums = m[2].split(/[\s,]+/).filter(Boolean).map(Number).filter((n) => !Number.isNaN(n));
    if (cmd === 'PA') relativo = false;
    else if (cmd === 'PR') relativo = true;
    if (cmd === 'PU') {
      bajo = false;
      cerrar();
    } else if (cmd === 'PD') {
      bajo = true;
      if (!actual) actual = [pos];
    } else if (cmd !== 'PA' && cmd !== 'PR') continue;
    for (let i = 0; i + 1 < nums.length; i += 2) {
      pos = relativo ? [pos[0] + nums[i] * UNIDAD, pos[1] + nums[i + 1] * UNIDAD] : [nums[i] * UNIDAD, nums[i + 1] * UNIDAD];
      if (bajo) {
        if (!actual) actual = [pos];
        else actual.push(pos);
      }
    }
  }
  cerrar();
  return contornos;
}

// ---------- SVG ----------

// El navegador resuelve las unidades (mm, cm, pt…), el viewBox y los
// transform: cada figura se muestrea con getPointAtLength y se pasa a mm.
function leerSvg(texto: string): Contorno[] {
  const doc = new DOMParser().parseFromString(texto, 'image/svg+xml');
  const raiz = doc.documentElement;
  if (raiz.nodeName.toLowerCase() !== 'svg') throw new Error('El SVG no se pudo leer.');
  const svg = document.importNode(raiz, true) as unknown as SVGSVGElement;
  const vb = svg.viewBox?.baseVal;
  if (!svg.getAttribute('width') && vb?.width) svg.setAttribute('width', String(vb.width));
  if (!svg.getAttribute('height') && vb?.height) svg.setAttribute('height', String(vb.height));
  const caja = document.createElement('div');
  caja.style.cssText = 'position:absolute;left:-100000px;top:0;visibility:hidden;pointer-events:none';
  caja.appendChild(svg);
  document.body.appendChild(caja);
  const PX_A_MM = 25.4 / 96;
  const contornos: Contorno[] = [];
  try {
    const figuras = svg.querySelectorAll<SVGGeometryElement>('path, rect, circle, ellipse, line, polyline, polygon');
    figuras.forEach((el) => {
      if (el.closest('defs, clipPath, mask, symbol, pattern, marker')) return;
      const ctm = el.getCTM();
      if (!ctm) return;
      let total = 0;
      try {
        total = el.getTotalLength();
      } catch {
        return;
      }
      if (!(total > 0)) return;
      const escala = Math.sqrt(Math.abs(ctm.a * ctm.d - ctm.b * ctm.c)) * PX_A_MM;
      const pasos = Math.max(16, Math.min(4000, Math.ceil(total * escala)));
      const paso = (total * escala) / pasos;
      const cerradoPorTipo = ['rect', 'circle', 'ellipse', 'polygon'].includes(el.tagName.toLowerCase());
      let actual: Punto[] = [];
      for (let i = 0; i <= pasos; i++) {
        const q = el.getPointAtLength((total * i) / pasos);
        const p: Punto = [(ctm.a * q.x + ctm.c * q.y + ctm.e) * PX_A_MM, (ctm.b * q.x + ctm.d * q.y + ctm.f) * PX_A_MM];
        // Un salto mucho más largo que el paso es un "moveto": otra subfigura.
        if (actual.length && dist(actual[actual.length - 1], p) > paso * 3 + TOLERANCIA) {
          contornos.push({ pts: actual, cerrado: false });
          actual = [];
        }
        actual.push(p);
      }
      if (actual.length > 1) contornos.push({ pts: actual, cerrado: cerradoPorTipo });
    });
  } finally {
    caja.remove();
  }
  return contornos;
}

// ---------- Análisis ----------

// Une tramos sueltos que se tocan en las puntas (los DXF suelen traer cada
// lado como una LINE aparte) y marca como cerrados los que vuelven al inicio.
function unir(contornos: Contorno[]): Contorno[] {
  const listos: Contorno[] = [];
  let abiertos: Punto[][] = [];
  for (const c of contornos) {
    if (c.cerrado || dist(c.pts[0], c.pts[c.pts.length - 1]) <= TOLERANCIA) listos.push({ pts: c.pts, cerrado: true });
    else abiertos.push(c.pts.slice());
  }
  const clave = (p: Punto) => `${Math.round(p[0] / TOLERANCIA)},${Math.round(p[1] / TOLERANCIA)}`;
  let cambio = true;
  while (cambio && abiertos.length > 1) {
    cambio = false;
    const puntas = new Map<string, number[]>();
    abiertos.forEach((pts, i) => {
      for (const p of [pts[0], pts[pts.length - 1]]) {
        const k = clave(p);
        puntas.set(k, [...(puntas.get(k) || []), i]);
      }
    });
    const usado = new Set<number>();
    const nuevos: Punto[][] = [];
    abiertos.forEach((pts, i) => {
      if (usado.has(i)) return;
      usado.add(i);
      let linea = pts;
      for (let seguir = true; seguir; ) {
        seguir = false;
        for (const extremo of ['fin', 'inicio'] as const) {
          const p = extremo === 'fin' ? linea[linea.length - 1] : linea[0];
          const j = (puntas.get(clave(p)) || []).find((x) => !usado.has(x));
          if (j === undefined) continue;
          usado.add(j);
          let otro = abiertos[j];
          if (extremo === 'fin') {
            if (dist(otro[0], p) > TOLERANCIA * 2) otro = otro.slice().reverse();
            linea = [...linea, ...otro.slice(1)];
          } else {
            if (dist(otro[otro.length - 1], p) > TOLERANCIA * 2) otro = otro.slice().reverse();
            linea = [...otro.slice(0, -1), ...linea];
          }
          seguir = cambio = true;
        }
      }
      nuevos.push(linea);
    });
    abiertos = nuevos;
  }
  for (const pts of abiertos) listos.push({ pts, cerrado: dist(pts[0], pts[pts.length - 1]) <= TOLERANCIA * 2 });
  return listos;
}

const cajaDe = (pts: Punto[]) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
};

function dentro(p: Punto, pol: Punto[]) {
  let adentro = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const [xi, yi] = pol[i];
    const [xj, yj] = pol[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) adentro = !adentro;
  }
  return adentro;
}

export function analizar(nombre: string, contornosCrudos: Contorno[], unidad: Unidad): Omit<ArchivoCorte, 'url'> {
  const contornos = unir(contornosCrudos.filter((c) => c.pts.length > 1 && largo(c.pts) > TOLERANCIA));
  if (!contornos.length) throw new Error('No encontré líneas de corte en el archivo.');
  const largoMm = contornos.reduce((t, c) => t + largo(c.pts), 0);

  // Recorrido en vacío: del final de una figura al inicio de la siguiente, en
  // el orden del archivo (RDWorks optimiza el orden, así que es un tope).
  let recorridoMm = 0;
  for (let i = 1; i < contornos.length; i++) recorridoMm += dist(contornos[i - 1].pts[contornos[i - 1].pts.length - 1], contornos[i].pts[0]);

  const cajas = contornos.map((c) => cajaDe(c.pts));
  const todo = { x0: Math.min(...cajas.map((c) => c.x0)), y0: Math.min(...cajas.map((c) => c.y0)), x1: Math.max(...cajas.map((c) => c.x1)), y1: Math.max(...cajas.map((c) => c.y1)) };

  // Piezas: contornos cerrados que están dentro de una cantidad par de otros
  // (0 = pieza suelta, 1 = agujero, 2 = pieza dentro de un agujero…).
  const cerrados = contornos.filter((c) => c.cerrado).map((c) => ({ pts: c.pts, caja: cajaDe(c.pts) }));
  const piezasMm: { w: number; h: number }[] = [];
  cerrados.forEach((c, i) => {
    let nivel = 0;
    cerrados.forEach((o, j) => {
      if (i === j) return;
      const cajaAdentro = c.caja.x0 >= o.caja.x0 && c.caja.y0 >= o.caja.y0 && c.caja.x1 <= o.caja.x1 && c.caja.y1 <= o.caja.y1;
      if (cajaAdentro && dentro(c.pts[Math.floor(c.pts.length / 3)], o.pts)) nivel++;
    });
    if (nivel % 2 === 0) piezasMm.push({ w: c.caja.x1 - c.caja.x0, h: c.caja.y1 - c.caja.y0 });
  });
  if (!piezasMm.length) piezasMm.push({ w: todo.x1 - todo.x0, h: todo.y1 - todo.y0 });

  // Agrupa las iguales (al mm, sin importar si están giradas).
  const grupos = new Map<string, { ancho: number; alto: number; cantidad: number }>();
  for (const p of piezasMm) {
    const a = Math.round(Math.max(p.w, p.h));
    const b = Math.round(Math.min(p.w, p.h));
    if (a <= 0 || b <= 0) continue;
    const k = `${a}x${b}`;
    const g = grupos.get(k);
    if (g) g.cantidad++;
    else grupos.set(k, { ancho: a, alto: b, cantidad: 1 });
  }

  return {
    nombre,
    unidad,
    unidadDetectada: unidad,
    largoMm: Math.round(largoMm),
    recorridoMm: Math.round(recorridoMm),
    contornos: contornos.length,
    anchoMm: Math.round(todo.x1 - todo.x0),
    altoMm: Math.round(todo.y1 - todo.y0),
    piezasMm: [...grupos.values()].sort((x, y) => y.ancho * y.alto - x.ancho * x.alto),
  };
}

export const EXTENSIONES_CORTE = '.dxf,.svg,.plt,.hpgl';

/** Lee el archivo y devuelve sus medidas, en mm salvo que el DXF diga otra unidad. */
export async function leerArchivoCorte(archivo: File): Promise<Omit<ArchivoCorte, 'url'>> {
  const ext = archivo.name.split('.').pop()?.toLowerCase();
  const texto = await archivo.text();
  if (ext === 'dxf') {
    if (texto.startsWith('AutoCAD Binary DXF')) throw new Error('Es un DXF binario: exportalo como DXF de texto (ASCII).');
    const { contornos, unidad } = leerDxf(texto);
    // Las coordenadas quedan en la unidad del archivo: se pasan a mm.
    const k = MM_POR[unidad ?? 'mm'];
    const enMm = contornos.map((c) => ({ ...c, pts: c.pts.map(([x, y]) => [x * k, y * k] as Punto) }));
    return analizar(archivo.name, enMm, unidad ?? 'mm');
  }
  if (ext === 'svg') return analizar(archivo.name, leerSvg(texto), 'mm');
  if (ext === 'plt' || ext === 'hpgl') return analizar(archivo.name, leerPlt(texto), 'mm');
  throw new Error('Subí un archivo DXF, SVG o PLT (exportado desde Corel o Illustrator).');
}
