import React, { useEffect } from 'react';
import { useLocation } from 'wouter';
import { Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

type LegacyRole = 'super_admin' | 'mapper' | 'user';

interface ProtectedRouteProps {
  component: React.ComponentType;
  /**
   * Lista de roles globales permitidos. Si se omite, cualquier usuario
   * autenticado pasa (comportamiento anterior). Si se define, un usuario
   * autenticado con rol fuera de la lista ve un mensaje de "sin acceso"
   * con botón para volver al dashboard. El match es case-insensitive.
   */
  allowedRoles?: LegacyRole[];
  /**
   * Si true, los usuarios con el toggle `cpAccess` pueden entrar a esta ruta
   * (usado por /cp-split). El resto de rutas los redirige a /cp-split.
   */
  allowCpAccess?: boolean;
}

export default function ProtectedRoute({ component: Component, allowedRoles, allowCpAccess }: ProtectedRouteProps) {
  const { isAuthenticated, loading, user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !isAuthenticated) setLocation('/login');
  }, [loading, isAuthenticated, setLocation]);

  // Toggle `cpAccess`: el usuario solo puede operar el módulo Reparticiones CP.
  // En cualquier otra ruta lo mandamos automáticamente a /cp-split. El Super
  // Admin no se considera "solo CP".
  const roleLc = String((user as any)?.role || '').toLowerCase();
  const isCpOnly = roleLc !== 'super_admin' && (user as any)?.cpAccess === true;
  useEffect(() => {
    if (loading || !isAuthenticated) return;
    if (isCpOnly && !allowCpAccess) setLocation('/cp-split');
  }, [loading, isAuthenticated, isCpOnly, allowCpAccess, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto mb-4"></div>
          <p className="text-white">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  // cpAccess fuera de /cp-split: no renderizamos nada mientras el efecto de
  // arriba lo redirige a su único módulo (evita el flash de otra vista).
  if (isCpOnly && !allowCpAccess) return null;

  // Ruta que permite cpAccess (/cp-split): el usuario con el toggle entra aunque
  // su rol no esté en allowedRoles.
  if (allowCpAccess && isCpOnly) return <Component />;

  if (allowedRoles && allowedRoles.length > 0) {
    const role = String((user as any)?.role || '').toLowerCase() as LegacyRole;
    const allowed = allowedRoles.map((r) => r.toLowerCase()) as LegacyRole[];
    if (!allowed.includes(role)) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6"
          style={{ background: 'radial-gradient(circle at 10% 10%, rgba(123,241,214,0.06) 0%, transparent 30%), linear-gradient(180deg, #060910 0%, #080c14 50%, #040608 100%)' }}>
          <div className="max-w-md rounded-2xl border p-8 text-center space-y-4"
            style={{ background: 'rgba(10,14,22,0.95)', borderColor: 'rgba(255,255,255,0.08)' }}>
            <div className="mx-auto h-14 w-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)' }}>
              <Lock className="h-7 w-7" style={{ color: '#fbbf24' }} />
            </div>
            <div>
              <h1 className="text-xl font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>
                Sin acceso
              </h1>
              <p className="text-sm mt-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Esta sección no está disponible para tu rol. Si necesitas acceder, pídele al super admin que ajuste tus permisos.
              </p>
            </div>
            <button
              onClick={() => setLocation('/')}
              className="btn-primary w-full"
              style={{ padding: '10px 16px' }}
            >
              Volver al Dashboard
            </button>
          </div>
        </div>
      );
    }
  }

  return <Component />;
}
