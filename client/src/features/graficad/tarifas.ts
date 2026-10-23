// Cálculo del cotizador de Graficad. Todo lo que es plata sale de acá, sin
// tocar la base: el componente solo junta los datos y muestra el resultado.
//
// Tarifas por defecto: las del Excel de corte (Bs 3 el minuto de láser,
// foam y MDF a 1 Bs por mm de espesor por metro, Alucobond Bs 18 el metro,
// router 5 % menos, factura 16 % más) y los precios de lámina de la lista
// de la página web (proveedor 15-10-2026 + 25 %). El dueño las cambia desde
// "Catálogo y tarifas" y quedan guardadas en graficad_tarifas.

export type ModoCorte = 'minuto' | 'espesor' | 'metro';
export type Lamina = 'entera' | 'media' | 'cuarta' | 'ninguna';
export type Maquina = 'laser' | 'router';

export interface Material {
  id: string;
  nombre: string;
  color: string;
  /** Espesor en mm. */
  espesor: number;
  /** Precio de venta de la lámina 122 × 244 (Bs). null = todavía sin precio. */
  entera: number | null;
  /** Lámina 122 × 122. null = se calcula con `tarifas.factorMedia` sobre la entera. */
  media: number | null;
  corte: ModoCorte;
  /** Solo para corte 'metro': Bs por metro lineal. */
  precioMetro?: number;
  /** Solo para corte 'minuto': velocidad de corte en mm/s. */
  velocidad?: number;
  /** true cuando la velocidad o el precio por metro es un supuesto, no del Excel. */
  supuesto?: boolean;
}

export interface Tarifas {
  laserMinuto: number;
  grabadoMinuto: number;
  descuentoRouter: number;
  factura: number;
  factorMedia: number;
  anticipo: number;
  validezDias: number;
  // Línea de WhatsApp desde la que salen las cotizaciones (la corporativa).
  // Vacía: sale por la línea del chat del cliente.
  lineaCotizaciones?: string | null;
  materiales: Material[];
}

export interface ItemCotizacion {
  id: string;
  descripcion: string;
  materialId: string;
  lamina: Lamina;
  laminas: number;
  maquina: Maquina;
  metros: number;
  /** Minutos que da RDWorks. null = se estima con la velocidad del material. */
  minutosRdworks: number | null;
  grabadoMin: number;
  piezas: number;
}

export interface DatosCotizacion {
  items: ItemCotizacion[];
  diseno: number;
  armado: number;
  instalacion: number;
  otros: number;
  conFactura: boolean;
  notas: string;
}

export const LAMINAS: Record<Lamina, { nombre: string; medida: string }> = {
  entera: { nombre: 'Entera', medida: '122 × 244 cm' },
  media: { nombre: 'Media', medida: '122 × 122 cm' },
  cuarta: { nombre: 'Cuarta', medida: '122 × 60 cm' },
  ninguna: { nombre: 'Material del cliente', medida: '' },
};

// ---------- Tarifas por defecto ----------

// mm/s en acrílico. 3 mm es del Excel; 10 mm sale de su ejemplo (Bs 12,50 el
// metro); el resto es un supuesto hasta medirlo en la máquina.
const VELOCIDAD_ACRILICO: Record<number, [number, boolean]> = { 0.5: [25, true], 1: [22, true], 1.5: [20, true], 2: [20, true], 3: [15, false], 4: [10, true], 5: [8, true], 10: [4, false] };

let siguienteId = 0;
const mat = (nombre: string, color: string, espesor: number, entera: number | null, media: number | null, corte: ModoCorte, extra: Partial<Material> = {}): Material => {
  const base: Material = { id: `m${++siguienteId}`, nombre, color, espesor, entera, media, corte, ...extra };
  if (corte === 'minuto' && base.velocidad === undefined) {
    const [v, sup] = VELOCIDAD_ACRILICO[espesor] ?? [10, true];
    base.velocidad = v;
    base.supuesto = sup;
  }
  return base;
};

export const TARIFAS_POR_DEFECTO: Tarifas = {
  laserMinuto: 3,
  grabadoMinuto: 5,
  descuentoRouter: 5,
  factura: 16,
  factorMedia: 0.54,
  anticipo: 50,
  validezDias: 7,
  materiales: [
    mat('Acrílico', 'Transparente', 2, 625, 337.5, 'minuto'),
    mat('Acrílico', 'Transparente', 3, 837.5, 443.75, 'minuto'),
    mat('Acrílico', 'Transparente', 4, 1181.25, 616.25, 'minuto'),
    mat('Acrílico', 'Transparente', 5, 1368.75, 710, 'minuto'),
    mat('Acrílico', 'Transparente', 10, 3087.5, 1581.25, 'minuto'),
    mat('Acrílico', 'Blanco translúcido', 2, 662.5, 367.5, 'minuto'),
    mat('Acrílico', 'Blanco translúcido', 3, 906.25, 493.75, 'minuto'),
    mat('Acrílico', 'Blanco translúcido', 5, 1337.5, null, 'minuto'),
    mat('Acrílico', 'Blanco lechoso', 2, 675, null, 'minuto'),
    mat('Acrílico', 'Negro', 2, 737.5, 393.75, 'minuto'),
    mat('Acrílico', 'Negro', 3, 906.25, null, 'minuto'),
    mat('Acrílico', 'Color', 2, 756.25, 393.75, 'minuto'),
    mat('Acrílico', 'Color', 3, 906.25, null, 'minuto'),
    mat('PVC foam', 'Blanco estándar', 3, 143.75, null, 'espesor'),
    mat('PVC foam', 'Blanco estándar', 5, 218.75, null, 'espesor'),
    mat('PVC foam', 'Blanco densidad media', 2, 162.5, null, 'espesor'),
    mat('PVC foam', 'Blanco densidad media', 3, 202.5, null, 'espesor'),
    mat('PVC foam', 'Blanco densidad media', 5, 275, null, 'espesor'),
    mat('PVC foam', 'Blanco densidad media', 10, 500, null, 'espesor'),
    mat('PVC foam', 'Blanco densidad media', 15, 686.25, null, 'espesor'),
    mat('PVC foam', 'Blanco densidad media', 20, 911.25, null, 'espesor'),
    mat('PVC foam', 'Blanco densidad alta', 2, 213.75, null, 'espesor'),
    mat('PVC foam', 'Blanco densidad alta', 3, 268.75, null, 'espesor'),
    mat('PVC foam', 'Blanco densidad alta', 5, 331.25, null, 'espesor'),
    mat('PVC foam', 'Negro', 3, 262.5, null, 'espesor'),
    mat('MDF', 'Crudo', 3, null, null, 'espesor'),
    mat('MDF', 'Crudo', 5.5, null, null, 'espesor'),
    mat('MDF', 'Crudo', 9, null, null, 'espesor'),
    mat('MDF', 'Crudo', 12, null, null, 'espesor'),
    mat('MDF', 'Crudo', 15, null, null, 'espesor'),
    mat('MDF', 'Crudo', 18, null, null, 'espesor'),
    mat('Alucobond', 'Blanco', 3, 562.5, null, 'metro', { precioMetro: 18 }),
    mat('Alucobond', 'Blanco', 4, 656.25, null, 'metro', { precioMetro: 18 }),
    mat('Alucobond', 'Negro', 3, 562.5, null, 'metro', { precioMetro: 18 }),
    mat('Alucobond', 'Negro', 4, 656.25, null, 'metro', { precioMetro: 18 }),
    mat('Alucobond', 'Plata', 3, 562.5, null, 'metro', { precioMetro: 18 }),
    mat('Alucobond', 'Plata', 4, 656.25, null, 'metro', { precioMetro: 18 }),
    mat('Alucobond', 'Rojo', 3, 562.5, null, 'metro', { precioMetro: 18 }),
    mat('PAI', 'Blanco', 0.5, 143.75, null, 'minuto'),
    mat('PAI', 'Blanco', 1, 262.5, null, 'minuto'),
    mat('PAI', 'Blanco', 1.5, 368.75, null, 'minuto'),
    mat('Metal', 'Plancha negra o galvanizada', 0.5, null, null, 'metro', { precioMetro: 15 }),
    mat('Metal', 'Plancha negra o galvanizada', 1, null, null, 'metro', { precioMetro: 19, supuesto: true }),
    mat('Metal', 'Plancha negra o galvanizada', 1.5, null, null, 'metro', { precioMetro: 23 }),
    mat('Metal', 'Plancha negra o galvanizada', 2, null, null, 'metro', { precioMetro: 30 }),
    mat('Acero dorado', 'Dorado', 0.7, null, null, 'metro', { precioMetro: 18 }),
  ],
};

// ---------- Cálculo ----------

export const nombreMaterial = (m: Material) => `${m.nombre} ${m.color.toLowerCase()} ${String(m.espesor).replace('.', ',')} mm`;

export function precioLamina(m: Material, lamina: Lamina, t: Tarifas): number {
  if (lamina === 'ninguna' || m.entera === null) return 0;
  const media = m.media ?? m.entera * t.factorMedia;
  return lamina === 'entera' ? m.entera : lamina === 'media' ? media : media / 2;
}

export interface CalculoItem {
  material: Material | undefined;
  precioMaterial: number;
  minutos: number | null;
  corte: number;
  detalleCorte: string;
  descuentoRouter: number;
  grabado: number;
  total: number;
}

export function calcularItem(item: ItemCotizacion, t: Tarifas): CalculoItem {
  const m = t.materiales.find((x) => x.id === item.materialId);
  if (!m) return { material: undefined, precioMaterial: 0, minutos: null, corte: 0, detalleCorte: '', descuentoRouter: 0, grabado: 0, total: 0 };
  const precioMaterial = precioLamina(m, item.lamina, t) * Math.max(0, item.laminas);
  let minutos: number | null = null;
  let corte = 0;
  let detalleCorte = '';
  if (m.corte === 'minuto') {
    minutos = item.minutosRdworks ?? (item.metros * 1000) / (m.velocidad || 10) / 60;
    corte = minutos * t.laserMinuto;
    detalleCorte = `${formatoNumero(minutos, 1)} min × Bs ${formatoNumero(t.laserMinuto)}/min`;
  } else if (m.corte === 'espesor') {
    corte = item.metros * m.espesor;
    detalleCorte = `${formatoNumero(item.metros, 1)} m × Bs ${formatoNumero(m.espesor)}/m`;
  } else {
    corte = item.metros * (m.precioMetro || 0);
    detalleCorte = `${formatoNumero(item.metros, 1)} m × Bs ${formatoNumero(m.precioMetro || 0)}/m`;
  }
  const descuentoRouter = item.maquina === 'router' ? (corte * t.descuentoRouter) / 100 : 0;
  const grabado = item.grabadoMin * t.grabadoMinuto;
  return { material: m, precioMaterial, minutos, corte, detalleCorte, descuentoRouter, grabado, total: precioMaterial + corte - descuentoRouter + grabado };
}

export interface CalculoCotizacion {
  items: CalculoItem[];
  subtotal: number;
  factura: number;
  total: number;
  anticipo: number;
}

export function calcularCotizacion(d: DatosCotizacion, t: Tarifas): CalculoCotizacion {
  const items = d.items.map((i) => calcularItem(i, t));
  const subtotal = items.reduce((s, i) => s + i.total, 0) + d.diseno + d.armado + d.instalacion + d.otros;
  const factura = d.conFactura ? (subtotal * t.factura) / 100 : 0;
  const total = redondear(subtotal + factura);
  return { items, subtotal, factura, total, anticipo: redondear((total * t.anticipo) / 100) };
}

const redondear = (n: number) => Math.round(n * 100) / 100;

export const formatoNumero = (n: number, decimales = 2) =>
  n.toLocaleString('es-BO', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
export const formatoBs = (n: number) => `Bs ${formatoNumero(n)}`;
export const numeroCotizacion = (n: number) => `COT-${String(n).padStart(4, '0')}`;

// ---------- Textos para enviar o copiar ----------

/** Lo que recibe el cliente por WhatsApp: solo descripción y precios. */
export function textoParaCliente(numero: string, cliente: string, d: DatosCotizacion, t: Tarifas): string {
  const c = calcularCotizacion(d, t);
  const lineas = d.items.map((item, i) => {
    const ci = c.items[i];
    const desc = item.descripcion.trim() || (ci.material ? nombreMaterial(ci.material) : 'Trabajo');
    const mat = ci.material ? ` (${nombreMaterial(ci.material)}, corte ${item.maquina === 'laser' ? 'láser' : 'CNC'})` : '';
    return `• ${desc}${item.descripcion.trim() ? mat : ''}: ${formatoBs(ci.total)}`;
  });
  if (d.diseno) lineas.push(`• Diseño: ${formatoBs(d.diseno)}`);
  if (d.armado) lineas.push(`• Armado: ${formatoBs(d.armado)}`);
  if (d.instalacion) lineas.push(`• Instalación: ${formatoBs(d.instalacion)}`);
  if (d.otros) lineas.push(`• Otros: ${formatoBs(d.otros)}`);
  if (c.factura) lineas.push(`• Factura (${t.factura} %): ${formatoBs(c.factura)}`);
  return [
    `*Cotización Graficad ${numero}*`,
    cliente,
    '',
    ...lineas,
    '',
    `*Total: ${formatoBs(c.total)}*`,
    `Anticipo ${t.anticipo} % para iniciar: ${formatoBs(c.anticipo)}`,
    `Válida ${t.validezDias} días.`,
  ].join('\n');
}

/** Orden de corte para el taller: lo técnico, sin precios de venta al cliente. */
export function textoOrdenCorte(numero: string, cliente: string, d: DatosCotizacion, t: Tarifas): string {
  const c = calcularCotizacion(d, t);
  const bloques = d.items.map((item, i) => {
    const ci = c.items[i];
    const m = ci.material;
    return [
      `${i + 1}. ${item.descripcion.trim() || 'Pieza'}`,
      `   Material: ${m ? nombreMaterial(m) : '—'}`,
      `   Lámina: ${item.lamina === 'ninguna' ? 'la trae el cliente' : `${item.laminas} × ${LAMINAS[item.lamina].nombre.toLowerCase()} (${LAMINAS[item.lamina].medida})`}`,
      `   Máquina: ${item.maquina === 'laser' ? 'láser' : 'CNC router'}`,
      `   Corte: ${formatoNumero(item.metros, 1)} m${ci.minutos !== null ? ` · ${formatoNumero(ci.minutos, 1)} min ${item.minutosRdworks !== null ? '(RDWorks)' : `(estimado a ${m?.velocidad} mm/s)`}` : ''}`,
      ...(item.grabadoMin ? [`   Grabado relleno: ${item.grabadoMin} min`] : []),
      `   Piezas: ${item.piezas}`,
    ].join('\n');
  });
  return [`*Orden de corte ${numero.replace('COT', 'OC')}*`, `Cliente: ${cliente}`, '', ...bloques, ...(d.notas.trim() ? ['', `Notas: ${d.notas.trim()}`] : [])].join('\n');
}

export function itemNuevo(t: Tarifas): ItemCotizacion {
  const primero = t.materiales.find((m) => m.nombre === 'Acrílico' && m.espesor === 3) || t.materiales[0];
  return { id: crypto.randomUUID(), descripcion: '', materialId: primero?.id || '', lamina: 'media', laminas: 1, maquina: 'laser', metros: 0, minutosRdworks: null, grabadoMin: 0, piezas: 1 };
}

export const datosNuevos = (t: Tarifas): DatosCotizacion => ({ items: [itemNuevo(t)], diseno: 0, armado: 0, instalacion: 0, otros: 0, conFactura: false, notas: '' });
