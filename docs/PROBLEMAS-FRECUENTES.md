# Problemas frecuentes

Buscá lo que ves en tu pantalla. Si no está acá, sacá una captura **del mensaje
completo** y mandásela al profe.

---

## Al publicar (pestaña Actions de GitHub)

| Ves esto | Qué significa y qué hacer |
|---|---|
| La pestaña **Actions** muestra "Get started with GitHub Actions" y una lista de ejemplos (Webpack, Deno…) | Tu copia no tiene el publicador. Te faltó el **Sync fork**: en la página de tu repo, **Sync fork → Update branch**. |
| **Sync fork** dice "This branch has conflicts that must be resolved" | Cambiaste un archivo que el profe también cambió. Apretá **Discard 1 commit** (tu cambio de práctica se descarta, no pasa nada). Después, en tu compu: `git fetch origin` y `git reset --hard origin/main`. |
| La ejecución se queda en **Queued** (cola) | GitHub no le asignó una máquina todavía. Mirá si hay otra ejecución anterior sin terminar y cancelala (**Cancel workflow**). Si no hay otra, esperá 3 o 4 minutos; si sigue, cancelá y volvé a apretar **Run workflow**. No aprietes Run workflow varias veces seguidas. |
| ❌ en **"Revisar tus 6 secretos"** | El mensaje rojo dice **cuál** de los 6 secretos está mal y cómo se arregla. Corregí ese secreto (lápiz de editar) y volvé a apretar **Run workflow**. |
| ❌ **"No pude entrar al servidor"** | Revisá `DEPLOY_USER` (tiene que ser `crm-tunombre`), `DEPLOY_HOST` (la IP) y `DEPLOY_KEY` (la llave **entera**, con las líneas `BEGIN` y `END`). Escribí a mano el nombre y el usuario; no copies líneas de la ficha que digan "Name" o "Secret". |
| GitHub dice **"Secret names can only contain alphanumeric characters or underscores"** | En el campo **Name** (el chico, de arriba) pusiste texto de más. Ahí va **solo** el nombre, escrito a mano: `DEPLOY_HOST`. El valor va en el cuadro grande **Secret**. |
| ❌ en **"Revisar el código (tipos)"** | Tu cambio rompió el código. El error dice archivo y línea: arreglalo, y repetí `git add .`, `git commit`, `git push`. Tu CRM publicado sigue con la versión anterior. |
| ❌ **"La versión nueva no arrancó"** | Casi siempre son las claves de Supabase mal copiadas. Tu CRM volvió solo a la versión anterior. |

## Al instalar y prender el CRM en tu compu

| Ves esto | Qué significa y qué hacer |
|---|---|
| `node` o `git` **"no se reconoce"** | Cerrá PowerShell y abrilo de nuevo. Si sigue, reinstalá el programa. |
| **"native WebSocket not found"** o **"Cannot find native binding"** | Tenés Node viejo. `node -v` tiene que decir **v22 o más**. Instalá Node 22 LTS, cerrá y abrí PowerShell, borrá la carpeta `node_modules` y corré `npm install`. |
| npm: **"la ejecución de scripts está deshabilitada en este sistema"** | Windows bloquea los scripts de PowerShell. Escribí `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`, respondé `S` y repetí el comando. |
| **"concurrently no se reconoce como un comando"** (o falta `vite`) | `npm install` se saltó las piezas de desarrollo. Escribí `$env:NODE_ENV = "development"` y después `npm install --include=dev`. |
| `npm run configurar` dice **"La base está vacía"** | Te faltó pegar `database/instalar.sql` en el SQL Editor de Supabase y apretar Run. |
| Supabase dice **"Failed to fetch"** al apretar Run | Es tu conexión. Recargá (F5): si en Table Editor ya están las tablas, se instaló bien. |

## Con Git y GitHub (git push, git pull)

| Ves esto | Qué significa y qué hacer |
|---|---|
| **"Failed to connect to github.com port 443"** o **"Connection was reset"** | Tu internet no llega bien a GitHub. Probá: (1) abrir github.com en el navegador, (2) conectarte al **internet del celular** (hotspot), (3) apagar un momento VPN y antivirus, (4) repetir. Para confirmar: `Test-NetConnection github.com -Port 443` tiene que decir `TcpTestSucceeded : True`. |
| **"Permission to … denied to otra-cuenta"** (error 403) | Windows tiene guardada la sesión de **otra cuenta** de GitHub. Borrala con `cmdkey /delete:LegacyGeneric:target=git:https://github.com` y avisale a Git quién sos: `git remote set-url origin https://TU-USUARIO@github.com/TU-USUARIO/saas-crm-whatsapp.git`. Después `git push`. Si el navegador tiene abierta la otra cuenta, usá una ventana de incógnito. |
| Se abre una ventanita **CredentialHelperSelector** | Dejá marcado **manager** y apretá **Select**. |
| La pantalla **"Authorize git-ecosystem"** tiene el botón pálido | Bajá hasta el final de la página, esperá 2 o 3 segundos y hacé un clic en un lugar vacío. Si sigue igual, F5 o ventana de incógnito. Es el programa oficial de GitHub: podés autorizarlo. |
| `git push` dice **rejected** | Primero `git pull`, después `git push`. |
| `git push` pide usuario y contraseña en la terminal | Cerrá PowerShell, abrilo de nuevo y repetí `git push`: tiene que abrirse la ventana del navegador. |
