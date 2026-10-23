# Cotizador de Graficad

Secciones propias de Graficad, aparte de lo del curso:

- **Cotizador** (menú Trabajo): un formulario y dos documentos.
  - **Para el cliente:** descripción y precios. Se envía al chat de WhatsApp del cliente con un botón.
  - **Para el taller (orden de corte):** material, lámina, metros de corte, minutos, máquina y piezas.
- **Catálogo y tarifas** (menú Administrar): tarifas de corte y precios de lámina que usa el cotizador.
- Botón **Cotizar** en la cabecera de cada chat: abre el cotizador con ese cliente.

Todo el código nuevo está en `client/src/features/graficad/` y la base en `database/graficad/`.

## Instalar (una sola vez)

1. En Supabase, abrí **SQL Editor**, pegá todo `database/graficad/01-cotizador.sql` y apretá **Run**.
2. Entrá al CRM como dueño, abrí **Catálogo y tarifas**, revisá los valores y apretá **Guardar**.

Sin el paso 1, el cotizador igual calcula y copia, pero no guarda ni envía.

## Cómo calcula

| Material | Corte |
| --- | --- |
| Acrílico, PET, PAI | minutos de láser × Bs 3 (minutos de RDWorks, o estimados con la velocidad del material) |
| Foam, MDF, melamina | metros × espesor en mm (5 mm = Bs 5 el metro) |
| Alucobond, acero dorado | metros × Bs 18 |
| Metal negro o galvanizado | metros × Bs 15 a 30 según espesor |
| Grabado relleno | minutos × Bs 5 |

Se suman la lámina (lista de precios de la web), diseño, armado, instalación y otros. CNC router resta 5 % al corte y con factura se agrega 16 %.

## Desde qué número sale

En **Catálogo y tarifas → Enviar cotizaciones desde** se elige la línea corporativa. Si no se elige ninguna, la cotización sale por la línea donde escribió el cliente. En el cotizador, **Enviar desde** permite cambiarla para una cotización puntual.

## Qué hace con el embudo

- Al **enviar** la cotización, el contacto pasa a la etapa que tenga "negoci" en el nombre (En Negociación) y se crea una oportunidad "COT-0001 · Cliente" con el monto. Si se reenvía, se actualiza esa misma oportunidad.
- **Pagó anticipo** pasa el contacto a la etapa de venta ganada y cierra la oportunidad como ganada; **Rechazada** la pasa a venta perdida.
- Si la base todavía no tiene la tabla `oportunidades` (versión 6 del curso), el monto se anota directo en el contacto.
