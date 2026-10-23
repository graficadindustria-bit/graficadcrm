import { jsPDF } from 'jspdf';
import logoGraficad from './logo-graficad-pdf.png';
import iconoEmail from './pdf-icono-email.png';
import iconoTelefono from './pdf-icono-telefono.png';
import iconoDireccion from './pdf-icono-direccion.png';
import { calcularCotizacion, datosPdf, formatoBs, formatoNumero, nombreMaterial, type DatosCotizacion, type Tarifas } from './tarifas';

// PDF de la cotización para el cliente, con el formato de las proformas de
// Graficad: franja naranja con logo y frase, "COTIZACIÓN" con cliente y fecha,
// una fila por ítem con su imagen de referencia, total en recuadro y pie con
// términos y datos de contacto. Hoja A4, medidas en mm.

const NARANJA: [number, number, number] = [255, 168, 0];
const NEGRO: [number, number, number] = [17, 17, 17];
const GRIS: [number, number, number] = [90, 90, 90];
const ANCHO = 210;
const ALTO = 297;
const ALTO_CABECERA = 38;
const INICIO_PIE = 262;
const LIMITE_CONTENIDO = INICIO_PIE - 5;
const COL = { desc: 20, anchoDesc: 84, cant: 120, precio: 148, total: 176 };

export interface Imagen {
  data: string;
  w: number;
  h: number;
  formato: 'JPEG' | 'PNG';
}

// Carga una imagen (URL pública de Supabase) y la pasa por un canvas: así
// jsPDF recibe siempre JPEG o PNG, aunque se haya subido un WEBP, y se achica
// para que el PDF no pese de más.
async function cargarImagen(url: string, max: number, formato: 'JPEG' | 'PNG'): Promise<Imagen | null> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    await img.decode();
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * k);
    const h = Math.round(img.naturalHeight * k);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    if (formato === 'JPEG') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);
    return { data: canvas.toDataURL(formato === 'PNG' ? 'image/png' : 'image/jpeg', 0.85), w, h, formato };
  } catch {
    return null;
  }
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fechaLarga = (f: Date) => `${f.getDate()} de ${MESES[f.getMonth()]} del ${f.getFullYear()}`;

export async function pdfCotizacion(opciones: {
  numero: string;
  cliente: string;
  datos: DatosCotizacion;
  tarifas: Tarifas;
  /** Logo ya cargado (para generar el PDF fuera del navegador). */
  logo?: Imagen | null;
  iconos?: (Imagen | null)[];
  fecha?: Date;
}): Promise<jsPDF> {
  const { numero, cliente, datos, tarifas } = opciones;
  const p = datosPdf(tarifas);
  const c = calcularCotizacion(datos, tarifas);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  // El logo de las proformas, recortado sobre el mismo naranja de la cabecera.
  const logo = opciones.logo !== undefined ? opciones.logo : await cargarImagen(logoGraficad, 800, 'PNG');
  // Íconos del pie (correo, teléfono, dirección), recortados de las proformas.
  const iconos = opciones.iconos ?? (await Promise.all([iconoEmail, iconoTelefono, iconoDireccion].map((u) => cargarImagen(u, 120, 'PNG'))));
  const imagenes = await Promise.all(datos.items.map((i) => (i.imagen ? cargarImagen(i.imagen, 1400, 'JPEG') : Promise.resolve(null))));

  const terminos = [(datos.terminos ?? '').trim() || p.terminos, `Proforma válida por ${tarifas.validezDias} días.`].join(' ');

  const cabecera = () => {
    doc.setFillColor(...NARANJA);
    doc.rect(0, 0, ANCHO, ALTO_CABECERA, 'F');
    if (logo) {
      const h = Math.min(24, (62 * logo.h) / logo.w);
      const w = (h * logo.w) / logo.h;
      doc.addImage(logo.data, logo.formato, 14, (ALTO_CABECERA - h) / 2, w, h);
    }
    doc.setTextColor(...NEGRO);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(p.frase, ANCHO - 14, 19, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(p.autorFrase, ANCHO - 14, 24, { align: 'right' });
  };

  const pie = () => {
    doc.setFillColor(...NARANJA);
    doc.rect(0, INICIO_PIE, ANCHO, ALTO - INICIO_PIE, 'F');
    doc.setTextColor(...NEGRO);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text('Términos y Condiciones:', 18, INICIO_PIE + 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(doc.splitTextToSize(terminos, 100), 18, INICIO_PIE + 18.5);
    doc.setFontSize(8);
    [p.email, p.telefonos, p.direccion].forEach((t, i) => {
      if (!t) return;
      const ic = iconos[i];
      if (ic) doc.addImage(ic.data, ic.formato, ANCHO - 21, INICIO_PIE + 7.2 + i * 7, 5.6, 5.6);
      else {
        doc.setFillColor(...NEGRO);
        doc.circle(ANCHO - 18.2, INICIO_PIE + 10 + i * 7, 2.6, 'F');
      }
      doc.text(t, ANCHO - 23, INICIO_PIE + 11 + i * 7, { align: 'right' });
    });
  };

  const encabezadoTabla = (y: number) => {
    doc.setDrawColor(...NEGRO);
    doc.setLineWidth(0.4);
    doc.roundedRect(17, y, 176, 10, 4, 4, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...NEGRO);
    doc.text('Descripción del Proyecto', COL.desc + COL.anchoDesc / 2 - 4, y + 6.6, { align: 'center' });
    doc.text('Cantidad', COL.cant, y + 6.6, { align: 'center' });
    doc.text('Precio (Bs.)', COL.precio, y + 6.6, { align: 'center' });
    doc.text('Total', COL.total, y + 6.6, { align: 'center' });
    return y + 16;
  };

  const primeraPagina = () => {
    cabecera();
    pie();
    doc.setTextColor(...NEGRO);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(30);
    doc.text('COTIZACIÓN', 18, 60);
    doc.setFontSize(9);
    doc.setTextColor(...GRIS);
    doc.text(numero, 192, 52, { align: 'right' });
    doc.setTextColor(...NEGRO);
    doc.setFontSize(9.5);
    doc.text('Cliente', 19, 69);
    doc.text(':', 37, 69);
    doc.text('Fecha', 19, 77);
    doc.text(':', 37, 77);
    doc.setFont('helvetica', 'normal');
    doc.text(cliente, 43, 69);
    doc.text(fechaLarga(opciones.fecha || new Date()), 43, 77);
    doc.setLineWidth(0.2);
    doc.line(19, 71.5, 95, 71.5);
    // Grilla de puntos decorativa, como en las proformas.
    doc.setFillColor(...NEGRO);
    for (let fila = 0; fila < 5; fila++) for (let col = 0; col < 6; col++) doc.circle(160 + col * 5.5, 58 + fila * 5, 0.35, 'F');
    return encabezadoTabla(88);
  };

  const paginaNueva = (conTabla: boolean) => {
    doc.addPage();
    cabecera();
    pie();
    return conTabla ? encabezadoTabla(ALTO_CABECERA + 10) : ALTO_CABECERA + 12;
  };

  let y = primeraPagina();
  const espacio = (alto: number, conTabla = true) => {
    if (y + alto > LIMITE_CONTENIDO) y = paginaNueva(conTabla);
  };

  datos.items.forEach((item, i) => {
    const ci = c.items[i];
    const piezas = Math.max(1, item.piezas || 1);
    const titulo = item.descripcion.trim() || (ci.material ? nombreMaterial(ci.material) : 'Trabajo');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const lineas: string[] = doc.splitTextToSize(`${i + 1}.- ${titulo}`, COL.anchoDesc);
    const altoTexto = lineas.length * 4.1;

    const img = imagenes[i];
    let altoImg = 0;
    let anchoImg = 0;
    if (img) {
      altoImg = Math.min(62, (110 * img.h) / img.w);
      anchoImg = (altoImg * img.w) / img.h;
    }
    espacio(altoImg + (img ? 6 : 0) + altoTexto + 8);
    if (img) {
      doc.addImage(img.data, img.formato, (ANCHO - anchoImg) / 2, y, anchoImg, altoImg);
      y += altoImg + 6;
    }
    doc.setTextColor(...NEGRO);
    doc.text(lineas, COL.desc, y);
    const yNumeros = y + (altoTexto - 4.1) / 2;
    doc.text(`${piezas} unid.`, COL.cant, yNumeros, { align: 'center' });
    doc.text(formatoNumero(ci.total / piezas), COL.precio, yNumeros, { align: 'center' });
    doc.text(formatoNumero(ci.total), COL.total, yNumeros, { align: 'center' });
    y += altoTexto + 2;
    doc.setLineWidth(0.3);
    doc.line(COL.desc, y, 190, y);
    y += 6;
  });

  const extras = ([['Diseño', datos.diseno], ['Armado', datos.armado], ['Instalación', datos.instalacion], ['Otros', datos.otros], [`Factura (${tarifas.factura} %)`, c.factura]] as const).filter(([, v]) => v > 0);
  extras.forEach(([t, v]) => {
    espacio(9);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(t, COL.desc, y);
    doc.text(formatoNumero(v), COL.total, y, { align: 'center' });
    y += 3;
    doc.line(COL.desc, y, 190, y);
    y += 7;
  });

  espacio(18, false);
  doc.setLineWidth(0.4);
  doc.roundedRect(103, y, 90, 11, 4, 4, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(datos.conFactura ? 'Total (Con factura)' : 'Total (Sin factura)', 128, y + 7, { align: 'center' });
  doc.text(formatoBs(c.total), 175, y + 7, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GRIS);
  doc.text(`Anticipo ${tarifas.anticipo} % para iniciar: ${formatoBs(c.anticipo)}`, 193, y + 16, { align: 'right' });

  return doc;
}

export const nombreArchivoPdf = (numero: string, cliente: string) =>
  `Cotizacion ${numero} ${cliente}`.replace(/[\\/:*?"<>|]+/g, '').trim() + '.pdf';
