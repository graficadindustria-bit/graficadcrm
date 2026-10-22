# Noche 1 — Tu CRM funcionando en tu compu

Hoy vas a tener **tu propio CRM de WhatsApp** corriendo en tu computadora,
con tu propia base de datos. Mañana lo publicamos en internet.

Tiempo estimado: 45 a 60 minutos.

---

## Antes de empezar: instalar 2 programas

Si ya los tenés, saltá este paso.

1. **Node.js** (versión 22 "LTS"): https://nodejs.org → botón verde → instalar con todo "Siguiente".
2. **Git**: https://git-scm.com/downloads → instalar con todo "Siguiente".

Para comprobar, abrí una terminal nueva (en Windows: **PowerShell**) y escribí:

```bash
node -v
```

```bash
git -v
```

Si cada uno muestra un número de versión, está todo bien. **Ojo:** `node -v` tiene que decir **v22** o más. Si dice v20 o v18, instalá la versión LTS de nodejs.org **antes** de seguir (con Node viejo, `npm install` queda incompleto y después nada funciona).

---

## Paso 1 — Tu copia del código (GitHub)

1. Creá una cuenta en https://github.com (si no tenés).
2. Entrá a **https://github.com/fermopsi/saas-crm-whatsapp**
3. Arriba a la derecha apretá **Fork** → **Create fork**.
   Ahora tenés tu propia copia en `github.com/TU-USUARIO/saas-crm-whatsapp`.
4. En **tu** copia, apretá el botón verde **Code** y copiá el link (termina en `.git`).
5. En la terminal, bajá el código a tu compu (cambiá el link por el tuyo):

```bash
git clone https://github.com/TU-USUARIO/saas-crm-whatsapp.git
```

```bash
cd saas-crm-whatsapp
```

---

## Paso 2 — Tu base de datos (Supabase)

1. Creá una cuenta en https://supabase.com (podés entrar con tu GitHub).
2. **New project**:
   - Nombre: el que quieras (ej. `mi-crm`).
   - Database password: inventá una y **guardala** en un lugar seguro.
   - Region: **South America (São Paulo)** o la más cercana a tu país.
   - Esperá 1–2 minutos a que termine de crearse.
3. En el menú de la izquierda entrá a **SQL Editor**.
4. Abrí el archivo `database/instalar.sql` de tu carpeta (con el Bloc de notas
   o VS Code), **copiá todo** el contenido y pegalo en el SQL Editor.
5. Apretá **Run**. Tiene que decir **Success. No rows returned**.

> ⚠️ Esto se hace **una sola vez**. Si lo corrés de nuevo te va a dar error
> porque las tablas ya existen — eso está bien, no rompe nada.

---

## Paso 3 — Conectar el código con tu base de datos

En la terminal (dentro de la carpeta `saas-crm-whatsapp`):

```bash
npm install
```

Tarda unos minutos la primera vez. Después:

```bash
npm run configurar
```

Te va a ir preguntando cosas. Los datos de Supabase están en tu proyecto →
**Project Settings** (el engranaje) → **API Keys** y **Data API**:

| Te pregunta | Dónde está en Supabase |
|---|---|
| 1. Project URL | Data API → **Project URL** (`https://xxxx.supabase.co`) |
| 2. Clave pública | API Keys → **Publishable key** (o `anon` en "Legacy") |
| 3. Clave secreta | API Keys → **Secret key** (o `service_role` en "Legacy") → botón para revelar |
| 4 a 7 | Nombre de tu negocio, tu nombre, tu email y una contraseña **para entrar al CRM** |

> 🔒 La **clave secreta** da acceso total a tu base. No la compartas con
> nadie ni la pegues en ningún chat (tampoco en Claude).

Si todo salió bien vas a ver: **✓ Empresa "..." y usuario ... creados.**

---

## Paso 4 — Prender el CRM

```bash
npm run dev
```

Abrí en el navegador: **http://localhost:5173** y entrá con el email y la
contraseña que pusiste en el paso anterior.

Para apagarlo: en la terminal apretá `Ctrl + C`.
Para volver a prenderlo otro día: abrí la terminal en la carpeta y `npm run dev`.

---

## Paso 5 — Conectar WhatsApp

> 📱 Usá un **número de prueba**, no tu WhatsApp personal ni el de tu negocio.

1. En el CRM, menú **Conexiones** → **+ Agregar** → poné un nombre (ej. "Ventas").
2. Apretá **Vincular por QR**.
3. En el celular: WhatsApp → **Dispositivos vinculados** → **Vincular un dispositivo** → escaneá el QR.
4. Mandale un mensaje a ese número desde otro celular: tiene que aparecer en la **Bandeja**.

---

## Si algo falla

| Ves esto | Qué hacer |
|---|---|
| **"native WebSocket not found"** o **"Cannot find native binding"** | Tenés Node viejo. Instalá Node 22 LTS, cerrá y abrí PowerShell, borrá la carpeta `node_modules` y corré `npm install` de nuevo. |
| `node` o `git` "no se reconoce" | Cerrá y abrí la terminal de nuevo. Si sigue, reinstalá el programa. |
| Supabase dice **"Failed to fetch (api.supabase.com)"** al apretar Run | Es la conexión, no el código. Recargá la página (F5). Si en **Table Editor** ya ves las tablas, se instaló bien; si no hay ninguna, apretá Run otra vez. |
| `npm run configurar` dice **"La base está vacía"** | Te faltó el Paso 2 (pegar `instalar.sql` y apretar Run). |
| `npm run configurar` dice **"No me pude conectar"** | Revisá la Project URL y que pegaste la clave **secreta**, no la pública. |
| La página dice "Faltan las variables..." | Corré `npm run configurar` otra vez. |
| El QR no aparece | Mirá la terminal: tiene que decir "API de envío escuchando". Si no, `Ctrl + C` y `npm run dev` de nuevo. |
| Te olvidaste la contraseña del CRM | Supabase → Authentication → Users → tu usuario → "Send password recovery", o pedile ayuda al profe. |

---

## Para mañana

Traé tu compu con todo esto funcionando. Mañana publicamos tu CRM en su
propia dirección de internet, para que lo puedas usar desde cualquier lado.
