import { AuthProvider, useAuth } from './lib/AuthContext';
import Login from './features/login/Login';
import RestablecerContrasena from './features/login/RestablecerContrasena';
import Bandeja from './features/bandeja/Bandeja';
import AvisoBaseAtrasada from './components/AvisoBaseAtrasada';
import { ToastProvider } from './components/ui';

function Contenido() {
  const { sesion, usuario, cargando, modoRecuperacion } = useAuth();

  if (cargando) {
    return (
      <div className="w-full h-dvh flex items-center justify-center" style={{ background: '#001D44' }}>
        <span className="text-white text-sm">Cargando...</span>
      </div>
    );
  }

  if (modoRecuperacion) return <RestablecerContrasena />;

  if (!sesion) return <Login />;

  if (!usuario) {
    return (
      <div className="w-full h-dvh flex items-center justify-center text-center px-6" style={{ background: '#001D44' }}>
        <span className="text-white text-sm">
          Tu cuenta no tiene un perfil en la tabla "usuarios" todavía. Pedile a un administrador que te cree como agente.
        </span>
      </div>
    );
  }

  return (
    <>
      <Bandeja />
      <AvisoBaseAtrasada />
    </>
  );
}

export default function App() {
  return (
    <div className="w-full h-dvh">
      <AuthProvider>
        <ToastProvider>
          <Contenido />
        </ToastProvider>
      </AuthProvider>
    </div>
  );
}
