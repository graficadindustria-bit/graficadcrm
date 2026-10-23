# Noche 2: tu CRM publicado en internet

Hoy tu CRM pasa de tu compu a internet: vas a poder entrar desde cualquier
computadora o celular en **`https://TUNOMBRE.app.mapse.club`**.

Y aprendés el ciclo que vas a usar siempre: **cambiás algo → `git push` →
en 2 minutos está publicado.**

Antes de empezar: tu CRM de la noche 1 tiene que funcionar con `npm run dev`
y `node -v` tiene que decir **v22** o más.

---

## Paso 1: Personalizar tu CRM (sin tocar código)

1. Prendé tu CRM (`npm run dev`) y entrá a http://localhost:5173
2. Menú **Mi empresa**: subí tu logo y elegí tus colores.
3. Guardá. Eso queda en tu Supabase, así que también se va a ver en el CRM publicado.

---

## Paso 2: Traer las mejoras del profe

El profe agregó cosas al CRM original (entre ellas, lo necesario para publicarlo).
Para traerlas a tu copia:

1. Entrá a **tu** repo en GitHub (`github.com/TU-USUARIO/saas-crm-whatsapp`).
2. Arriba de la lista de archivos apretá **Sync fork** → **Update branch**.
3. En PowerShell, dentro de la carpeta del CRM (apagalo antes con `Ctrl + C`):

```bash
git pull
```

```bash
npm install
```

---

## Paso 3: Tu primer cambio

Vamos a cambiar la frase grande de la pantalla de entrada.

1. Abrí el archivo `client/src/features/login/Login.tsx` con VS Code o el Bloc de notas.
2. Buscá (`Ctrl + F`) el texto **Todo lo que vendés por WhatsApp** y cambialo
   por una frase tuya. **Solo cambiá lo que está entre las etiquetas**, sin borrar
   los `<` `>` ni las comillas.
3. Guardá y mirá el cambio en http://localhost:5173 (con `npm run dev` prendido).

> Si algo se rompe, deshacé con `Ctrl + Z` en el editor y guardá de nuevo.

---

## Paso 4: Subir tu cambio a GitHub

**Solo la primera vez**, decile a Git quién sos (con tu nombre y tu correo de GitHub):

```bash
git config --global user.name "Tu Nombre"
```

```bash
git config --global user.email "tucorreo@ejemplo.com"
```

Ahora sí, cada vez que quieras subir cambios son estos 3 comandos:

```bash
git add .
```

```bash
git commit -m "mi primer cambio"
```

```bash
git push
```

La primera vez se abre una ventana para iniciar sesión en GitHub: elegí
**Sign in with your browser** y aceptá.

> Tu archivo `.env` (con tus claves) **no** se sube: está excluido a propósito.

---

## Paso 5: Conectar tu repo con el servidor

### 5.1 Revisar las Actions

En tu repo, pestaña **Actions**. Si aparece el botón **I understand my workflows,
go ahead and enable them**, apretalo (sin eso no se publica nada). Si no aparece, ya están activas.

> Es normal ver una ❌ roja de cuando hiciste el **Sync fork**: GitHub intentó
> publicar antes de que cargaras los secretos.

### 5.2 Cargar tus 6 secretos (una sola vez)

En tu repo: **Settings → Secrets and variables → Actions → New repository secret**.
Cargá uno por uno. En cada uno hay **dos campos**:

- **Name** (el campo chico de arriba): el nombre, **escrito a mano**, exactamente como en la tabla.
- **Secret** (el cuadro grande): el valor. De la ficha copiá **solo** la línea o el bloque del valor, sin ninguna palabra de más.

| Nombre del secreto | Qué ponés | De dónde sale |
|---|---|---|
| `DEPLOY_HOST` | La IP del servidor | Tu ficha (te la da el profe) |
| `DEPLOY_USER` | `crm-tunombre` | Tu ficha |
| `DEPLOY_KEY` | La llave completa, **con** las líneas `BEGIN` y `END` | Tu ficha |
| `SUPABASE_URL` | `https://xxxx.supabase.co` | Supabase → Project Settings → Data API |
| `SUPABASE_ANON_KEY` | La clave pública | Supabase → API Keys |
| `SUPABASE_SERVICE_KEY` | La clave secreta | Supabase → API Keys |

> 🔒 Los secretos de GitHub nadie los puede ver, ni siquiera vos después de
> guardarlos. Por eso tu repo puede ser público sin peligro.

---

## Paso 6: Publicar

1. Pestaña **Actions** → **Publicar CRM** (a la izquierda) → **Run workflow** → **Run workflow**.
   (Desde ahora, cada `git push` publica solo; este botón es para la primera vez.)
2. Esperá 2 o 3 minutos. Si sale **✅ verde**, entrá a **`https://TUNOMBRE.app.mapse.club`**
   con tu email y contraseña de siempre.
3. Si sale **❌ rojo**: hacé clic en la ejecución → en el paso que falló → leé el
   mensaje (casi siempre dice qué falta). Mirá la tabla de abajo.

Tu cambio del paso 3 tiene que verse en la página publicada.

---

## Paso 7: WhatsApp en el CRM publicado

Un número de WhatsApp tiene que estar conectado a **un solo** CRM. Si lo dejás
en los dos, los dos reciben los mismos mensajes y se pisan.

1. En tu CRM **local** (localhost): **Conexiones** → **Desvincular**. Después apagalo (`Ctrl + C`).
2. En tu CRM **publicado** (`TUNOMBRE.app.mapse.club`): **Conexiones** → **Vincular por QR**.
3. Escaneá el QR desde el celular (WhatsApp → Dispositivos vinculados).
4. Mandate un mensaje de prueba: tiene que llegar a la **Bandeja** del CRM publicado.

> Desde ahora tu CRM queda prendido en el servidor las 24 horas, aunque apagues tu compu.

---

## Si algo falla

Mirá la lista completa en **[docs/PROBLEMAS-FRECUENTES.md](PROBLEMAS-FRECUENTES.md)**.
Si la publicación sale con ❌, hacé clic en la ejecución → en el paso con ❌ → leé
el mensaje rojo: ahora dice **qué secreto está mal y cómo arreglarlo**.
