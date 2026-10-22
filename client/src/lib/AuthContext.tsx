import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import type { Empresa, Usuario } from './tipos';

interface AuthContextValue {
  sesion: Session | null;
  usuario: Usuario | null;
  empresa: Empresa | null;
  cargando: boolean;
  modoRecuperacion: boolean;
  iniciarSesion: (email: string, password: string) => Promise<{ error: { message: string } | null }>;
  cerrarSesion: () => Promise<void>;
  actualizarContrasena: (nuevaContrasena: string) => Promise<{ error: { message: string } | null }>;
  recargarEmpresa: () => Promise<void>;
  recargarUsuario: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Aplica (o saca) los colores de marca de la empresa como custom properties
// CSS — NAVY/TEAL en tema.ts los usan como fallback var(--marca-x, #hex),
// así que si la empresa no configuró nada no cambia nada.
function aplicarColoresDeMarca(empresa: Empresa | null) {
  const raiz = document.documentElement.style;
  if (empresa?.color_primario) raiz.setProperty('--marca-primario', empresa.color_primario);
  else raiz.removeProperty('--marca-primario');
  if (empresa?.color_acento) raiz.setProperty('--marca-acento', empresa.color_acento);
  else raiz.removeProperty('--marca-acento');
  // El texto sobre el acento (--accent-fg) se elige según qué tan claro sea el
  // color de la empresa; si no, un acento claro deja botones blanco sobre blanco.
  const textoSobreAcento = empresa?.color_acento ? textoLegibleSobre(empresa.color_acento) : null;
  if (textoSobreAcento) raiz.setProperty('--accent-fg', textoSobreAcento);
  else raiz.removeProperty('--accent-fg');
}

const TEXTO_CLARO = '#ffffff';
const TEXTO_OSCURO = '#031326';

// Luminancia relativa (WCAG) de un color #rgb o #rrggbb; null si no se puede leer.
function luminancia(hex: string): number | null {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Devuelve el texto (claro u oscuro) con más contraste sobre el fondo dado.
function textoLegibleSobre(fondo: string): string | null {
  const lf = luminancia(fondo);
  if (lf === null) return null;
  const contraste = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return contraste(lf, luminancia(TEXTO_CLARO)!) >= contraste(lf, luminancia(TEXTO_OSCURO)!) ? TEXTO_CLARO : TEXTO_OSCURO;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Session | null>(null);
  const [usuario, setUsuario] = useState<Usuario | null>(null); // fila de la tabla `usuarios` (rol, línea, empresa)
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [cargando, setCargando] = useState(true);
  const [modoRecuperacion, setModoRecuperacion] = useState(false);

  const cargarEmpresa = async (empresaId: string) => {
    const { data } = await supabase.from('empresas').select('*').eq('id', empresaId).single();
    const fila = (data as Empresa) || null;
    setEmpresa(fila);
    aplicarColoresDeMarca(fila);
    if (fila?.nombre) document.title = fila.nombre;
  };

  const cargarPerfil = async (sesionActual: Session | null) => {
    if (!sesionActual) {
      setUsuario(null);
      setEmpresa(null);
      aplicarColoresDeMarca(null);
      return;
    }
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', sesionActual.user.id)
      .single();
    if (error) {
      console.error('No se pudo cargar el perfil del usuario:', error.message);
      setUsuario(null);
      setEmpresa(null);
      aplicarColoresDeMarca(null);
    } else {
      const fila = data as Usuario;
      setUsuario(fila);
      await cargarEmpresa(fila.empresa_id);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSesion(session);
      await cargarPerfil(session);
      setCargando(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (evento, session) => {
      setSesion(session);
      await cargarPerfil(session);
      if (evento === 'PASSWORD_RECOVERY') setModoRecuperacion(true);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const iniciarSesion = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
  };

  const actualizarContrasena = async (nuevaContrasena: string) => {
    const { error } = await supabase.auth.updateUser({ password: nuevaContrasena });
    if (!error) setModoRecuperacion(false);
    return { error };
  };

  const recargarEmpresa = async () => {
    if (usuario) await cargarEmpresa(usuario.empresa_id);
  };

  const recargarUsuario = async () => {
    if (sesion) await cargarPerfil(sesion);
  };

  return (
    <AuthContext.Provider
      value={{
        sesion,
        usuario,
        empresa,
        cargando,
        modoRecuperacion,
        iniciarSesion,
        cerrarSesion,
        actualizarContrasena,
        recargarEmpresa,
        recargarUsuario,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
