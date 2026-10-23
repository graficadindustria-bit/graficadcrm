# Cómo traer las mejoras nuevas a tu CRM

Cada vez que el profe avise que hay mejoras, hacé estos **3 pasos**. Tardás unos 5 minutos
y tu CRM no se apaga mientras tanto.

## Paso 1 — Actualizar tu base de datos (Supabase)

1. Entrá a tu proyecto de Supabase → **SQL Editor**.
2. En tu repo en GitHub (o en tu compu), abrí el archivo **`database/actualizar.sql`**
   y copiá **todo**.
3. Pegalo en el SQL Editor y apretá **Run**. Tiene que decir **Success**.

> Es seguro correrlo más de una vez. Si te olvidás de hacerlo, el CRM te muestra un
> aviso naranja arriba que dice **"Tu base de datos está desactualizada"**.

## Paso 2 — Traer el código nuevo a tu repo

1. En tu repo de GitHub apretá **Sync fork → Update branch**.
2. Si dice que hay conflictos, apretá **Discard N commit** (se descartan solo tus
   cambios de práctica) y después, en tu compu: `git fetch origin` y `git reset --hard origin/main`.

## Paso 3 — Publicar

Pestaña **Actions → Publicar CRM → Run workflow**. Cuando salga el ✅ verde (1 o 2 minutos),
recargá tu CRM con **Ctrl + F5**. Ya están las mejoras.

---

## Qué trae la versión 5

| Mejora | Dónde está |
|---|---|
| Cierre automático de chats sin respuesta del cliente | Mi empresa → tarjeta de cierre automático (viene apagado) |
| Probabilidad por etapa del embudo y motivo de venta perdida | Embudo → configurar etapas |
| Campos propios, folio y documentos del cliente | Mi empresa → Campos de la ficha; ficha del cliente en la Bandeja |
| Mensajes programados con imagen, PDF, audio u otro archivo | Clip del mensaje programado |
| Confirmación de cita al agendar y actividades con checklist del gerente | Agenda |
| Pestaña "Por vencer" (chats con la ventana de 24 h por cerrarse) y transferir chat | Bandeja |
| Origen del cliente por anuncio de Facebook / Instagram | Reportes → Por origen |

> ⚠️ Los **documentos del cliente** (por ejemplo, la foto de un carnet) se guardan en un
> almacenamiento cuyo enlace es público: quien tenga el enlace puede verlos. Usalo con cuidado.
