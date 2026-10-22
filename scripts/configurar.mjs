// Configura el CRM la primera vez: pide los datos de Supabase, escribe el
// archivo .env y crea tu empresa y tu usuario (el dueño).
//
// Uso (en la carpeta del proyecto):  npm run configurar

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// Supabase necesita Node 22 o más nuevo. Con una versión vieja, más adelante
// falla con un error difícil de entender ("native WebSocket not found").
const versionNode = Number(process.versions.node.split('.')[0]);
if (versionNode < 22) {
  console.log(`\n\x1b[31m✗ Tenés Node ${process.versions.node} y el CRM necesita Node 22 o más nuevo.\x1b[0m`);
  console.log('  1. Instalá la versión LTS desde https://nodejs.org');
  console.log('  2. Cerrá PowerShell y abrilo de nuevo (node -v tiene que decir v22 o más).');
  console.log('  3. Borrá la carpeta node_modules y corré npm install otra vez.\n');
  process.exit(1);
}

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const archivoEnv = path.join(raiz, '.env');
const rl = readline.createInterface({ input: stdin, output: stdout });

const verde = (t) => `\x1b[32m${t}\x1b[0m`;
const rojo = (t) => `\x1b[31m${t}\x1b[0m`;
const negrita = (t) => `\x1b[1m${t}\x1b[0m`;

function salirConError(mensaje) {
  console.log('\n' + rojo('✗ ' + mensaje) + '\n');
  rl.close();
  process.exit(1);
}

async function preguntar(texto, { porDefecto, validar } = {}) {
  for (;;) {
    const sufijo = porDefecto ? ` [${porDefecto}]` : '';
    const respuesta = (await rl.question(`${texto}${sufijo}: `)).trim() || porDefecto || '';
    const error = validar ? validar(respuesta) : respuesta ? null : 'No puede quedar vacío.';
    if (!error) return respuesta;
    console.log(rojo('  ' + error));
  }
}

function leerEnvExistente() {
  if (!fs.existsSync(archivoEnv)) return {};
  const valores = {};
  for (const linea of fs.readFileSync(archivoEnv, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^([A-Z_]+)=(.*)$/);
    if (m) valores[m[1]] = m[2];
  }
  return valores;
}

console.log('\n' + negrita('Configuración del CRM') + '\n');
console.log('Los datos de Supabase están en tu proyecto → Project Settings → API Keys / Data API.\n');

const previo = leerEnvExistente();

const supabaseUrl = await preguntar('1. Project URL (https://xxxx.supabase.co)', {
  porDefecto: previo.SUPABASE_URL,
  validar: (v) => (/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(v) ? null : 'Tiene que ser como https://xxxx.supabase.co'),
});
const anonKey = await preguntar('2. Clave pública (anon / publishable)', { porDefecto: previo.VITE_SUPABASE_ANON_KEY });
const serviceKey = await preguntar('3. Clave secreta (service_role / secret)', { porDefecto: previo.SUPABASE_SERVICE_KEY });

const url = supabaseUrl.replace(/\/$/, '');
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

// ¿Las claves sirven y ya se pegó instalar.sql?
const { data: empresas, error: errorEmpresas } = await supabase.from('empresas').select('id, nombre');
if (errorEmpresas) {
  if (/relation .*empresas.* does not exist|Could not find the table/i.test(errorEmpresas.message)) {
    salirConError('La base está vacía. Primero pegá database/instalar.sql en el SQL Editor de Supabase y apretá Run.');
  }
  salirConError(`No me pude conectar a Supabase: ${errorEmpresas.message}\n  Revisá la URL y la clave secreta.`);
}

function escribirEnv(nombreNegocio) {
  fs.writeFileSync(
    archivoEnv,
    `# Generado por \`npm run configurar\`. NO subas este archivo a GitHub.

# --- Servidor ---
SUPABASE_URL=${url}
SUPABASE_SERVICE_KEY=${serviceKey}
PORT=${previo.PORT || '3001'}
AUTH_DIR=${previo.AUTH_DIR || ''}

# --- Navegador (todo lo que empieza con VITE_ queda visible en la página) ---
VITE_SUPABASE_URL=${url}
VITE_SUPABASE_ANON_KEY=${anonKey}
VITE_BACKEND_URL=${previo.VITE_BACKEND_URL ?? 'http://localhost:3001'}
VITE_NOMBRE_NEGOCIO=${nombreNegocio}
`,
  );
}

escribirEnv(empresas[0]?.nombre || previo.VITE_NOMBRE_NEGOCIO || 'Mi CRM');
console.log(verde('\n✓ Conectado a Supabase y archivo .env guardado.'));

if (empresas.length > 0) {
  console.log(verde(`✓ Tu empresa "${empresas[0].nombre}" ya estaba creada.`));
  console.log(`\nListo. Ahora corré ${negrita('npm run dev')} y entrá a http://localhost:5173\n`);
  rl.close();
  process.exit(0);
}

console.log('\nAhora creamos tu empresa y tu usuario para entrar al CRM.\n');
const nombreEmpresa = await preguntar('4. Nombre de tu negocio');
const nombreDueno = await preguntar('5. Tu nombre');
const email = await preguntar('6. Tu email (con este entrás al CRM)', {
  validar: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'Ese email no parece válido.'),
});
const password = await preguntar('7. Una contraseña (mínimo 6 caracteres)', {
  validar: (v) => (v.length >= 6 ? null : 'Tiene que tener al menos 6 caracteres.'),
});
rl.close();

const { data: empresa, error: errorEmpresa } = await supabase
  .from('empresas')
  .insert({ nombre: nombreEmpresa })
  .select()
  .single();
if (errorEmpresa) salirConError(`No se pudo crear la empresa: ${errorEmpresa.message}`);

const { data: auth, error: errorAuth } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (errorAuth) {
  await supabase.from('empresas').delete().eq('id', empresa.id);
  salirConError(`No se pudo crear el usuario: ${errorAuth.message}`);
}

const { error: errorUsuario } = await supabase.from('usuarios').insert({
  id: auth.user.id,
  empresa_id: empresa.id,
  nombre: nombreDueno,
  rol: 'dueno',
});
if (errorUsuario) {
  await supabase.auth.admin.deleteUser(auth.user.id);
  await supabase.from('empresas').delete().eq('id', empresa.id);
  salirConError(`No se pudo crear el perfil: ${errorUsuario.message}`);
}

escribirEnv(nombreEmpresa);
console.log(verde(`\n✓ Empresa "${nombreEmpresa}" y usuario ${email} creados.`));
console.log(`\nListo. Ahora corré ${negrita('npm run dev')} y entrá a http://localhost:5173 con tu email y contraseña.\n`);
