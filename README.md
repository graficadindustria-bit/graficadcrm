# CRM para WhatsApp

Un CRM para atender y vender por WhatsApp: bandeja de chats, contactos,
embudo de ventas, respuestas rápidas, bot de respuestas automáticas y
mensajes programados.

👉 **Si sos estudiante del curso, empezá por [docs/GUIA-NOCHE-1.md](docs/GUIA-NOCHE-1.md).**

## Cómo está armado

- **[`server/`](server/)** — servidor Node.js + TypeScript. Conecta WhatsApp
  con [Baileys](https://github.com/WhiskeySockets/Baileys) y guarda todo en Supabase.
- **[`client/`](client/)** — la página web (React + Vite + TypeScript).
- **[`database/instalar.sql`](database/instalar.sql)** — crea todas las tablas
  en tu proyecto de Supabase. Se pega una vez en el SQL Editor.
- **[`database/actualizar.sql`](database/actualizar.sql)** — trae a tu base las mejoras
  nuevas. Se pega cuando el profe avisa; es seguro repetirlo.
- **[`scripts/configurar.mjs`](scripts/configurar.mjs)** — escribe el `.env` y
  crea tu empresa y tu usuario.

Cuando haya mejoras nuevas, seguí **[docs/ACTUALIZAR-MEJORAS.md](docs/ACTUALIZAR-MEJORAS.md)**.
Si algo falla, mirá **[docs/PROBLEMAS-FRECUENTES.md](docs/PROBLEMAS-FRECUENTES.md)**.

Cada CRM es de **una sola empresa**: se crea con `npm run configurar` y la
base de datos no deja agregar otra.

## Comandos

```bash
npm install          # instala todo (la primera vez)
npm run configurar   # conecta con tu Supabase y crea tu usuario
npm run dev          # prende el CRM en http://localhost:5173
npm run typecheck    # revisa que el código no tenga errores de tipos
```
