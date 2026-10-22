import fs from 'node:fs/promises';
import { join } from 'node:path';
import { BufferJSON, initAuthCreds, proto } from '@whiskeysockets/baileys';
import type { AuthenticationCreds, AuthenticationState, SignalDataTypeMap } from '@whiskeysockets/baileys';

// Reemplazo de useMultiFileAuthState de Baileys, con los mismos nombres de
// archivo y el mismo formato (las carpetas auth_info_* existentes se leen
// tal cual). Dos diferencias:
//
// 1. Escritura atómica: Baileys hace writeFile directo sobre creds.json, que
//    primero lo trunca a 0 bytes y después escribe. Si el proceso muere en
//    el medio (pasó el 2026-10-19 con un "heap out of memory" justo mientras
//    se vinculaba la línea 414ec4b5), creds.json queda vacío y la sesión se
//    pierde. Acá se escribe a un .tmp, se hace fsync y recién ahí se renombra
//    encima: el archivo queda o con la versión vieja o con la nueva.
// 2. Respaldo de credenciales: al arrancar, si creds.json se leyó bien se
//    copia a creds.json.bak; si creds.json está vacío o roto, se usa el .bak.
//
// Además, Baileys guarda un Mutex por cada archivo que tocó alguna vez en un
// Map global que nunca se vacía (miles de session-/pre-key-/lid-mapping-*
// por línea a lo largo de días); acá la cola de cada archivo se borra apenas
// termina su última operación.

const colasPorArchivo = new Map<string, Promise<unknown>>();

function enCola<T>(ruta: string, tarea: () => Promise<T>): Promise<T> {
  const anterior = colasPorArchivo.get(ruta) ?? Promise.resolve();
  const actual = anterior.then(tarea, tarea);
  const fin = actual.catch(() => undefined);
  colasPorArchivo.set(ruta, fin);
  void fin.then(() => {
    if (colasPorArchivo.get(ruta) === fin) colasPorArchivo.delete(ruta);
  });
  return actual;
}

async function escribirAtomico(ruta: string, contenido: string): Promise<void> {
  const tmp = `${ruta}.tmp`;
  const archivo = await fs.open(tmp, 'w');
  try {
    await archivo.writeFile(contenido);
    await archivo.sync();
  } finally {
    await archivo.close();
  }
  await fs.rename(tmp, ruta);
}

async function leerJson(ruta: string): Promise<any> {
  try {
    const texto = await fs.readFile(ruta, { encoding: 'utf-8' });
    if (!texto.trim()) return null;
    return JSON.parse(texto, BufferJSON.reviver);
  } catch {
    return null;
  }
}

const nombreDeArchivo = (archivo: string) => archivo.replace(/\//g, '__').replace(/:/g, '-');

export async function useAuthStateSeguro(
  carpeta: string,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  await fs.mkdir(carpeta, { recursive: true });

  const ruta = (archivo: string) => join(carpeta, nombreDeArchivo(archivo));
  const leer = (archivo: string) => enCola(ruta(archivo), () => leerJson(ruta(archivo)));
  const escribir = (dato: unknown, archivo: string) =>
    enCola(ruta(archivo), () => escribirAtomico(ruta(archivo), JSON.stringify(dato, BufferJSON.replacer)));
  const borrar = (archivo: string) => enCola(ruta(archivo), () => fs.unlink(ruta(archivo)).catch(() => undefined));

  const rutaCreds = ruta('creds.json');
  const rutaRespaldo = `${rutaCreds}.bak`;
  let creds: AuthenticationCreds | null = await leer('creds.json');
  if (creds) {
    await fs.copyFile(rutaCreds, rutaRespaldo).catch(() => undefined);
  } else {
    creds = await leerJson(rutaRespaldo);
    if (creds) console.warn(`[${carpeta}] creds.json vacío o ilegible: uso el respaldo creds.json.bak`);
  }
  const credsFinales = creds ?? initAuthCreds();

  return {
    state: {
      creds: credsFinales,
      keys: {
        get: async (tipo, ids) => {
          const datos: { [id: string]: SignalDataTypeMap[typeof tipo] } = {};
          await Promise.all(
            ids.map(async (id) => {
              let valor = await leer(`${tipo}-${id}.json`);
              if (tipo === 'app-state-sync-key' && valor) {
                valor = proto.Message.AppStateSyncKeyData.fromObject(valor);
              }
              datos[id] = valor;
            }),
          );
          return datos;
        },
        set: async (datos) => {
          const tareas: Promise<unknown>[] = [];
          for (const categoria in datos) {
            const porId = datos[categoria as keyof SignalDataTypeMap] ?? {};
            for (const id in porId) {
              const valor = porId[id];
              const archivo = `${categoria}-${id}.json`;
              tareas.push(valor ? escribir(valor, archivo) : borrar(archivo));
            }
          }
          await Promise.all(tareas);
        },
      },
    },
    saveCreds: () => escribir(credsFinales, 'creds.json'),
  };
}
