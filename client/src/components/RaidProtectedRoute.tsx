import React from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '../contexts/AuthContext';
import { trpc } from '../lib/trpc';

type RequiredAccess = 'view' | 'interact' | 'admin' | 'super_admin';

interface RaidProtectedRouteProps {
  component: React.ComponentType<{ raidAccess?: RaidAccessInfo }>;
  required?: RequiredAccess;
}

export interface RaidAccessInfo {
  canAccess: boolean;
  canInteract: boolean;
  canAdmin: boolean;
  accessLevel:
    | 'super_admin'
    | 'raid_admin'
    | 'raid_mapper'
    | 'raid_user'
    | 'viewer_only'
    | null;
}

export default function RaidProtectedRoute({
  component: Component,
  required = 'view',
}: RaidProtectedRouteProps) {
  const { isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();
  const { data, isLoading, error } = trpc.raid.myAccess.useQuery(undefined, {
    enabled: !!isAuthenticated,
    retry: false,
  });

  if (loading || (isAuthenticated && isLoading)) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          background:
            'radial-gradient(circle at 10% 10%, rgba(232,121,249,0.08) 0%, transparent 30%), linear-gradient(180deg, #060910 0%, #080c14 50%, #040608 100%)',
        }}
      >
        <div className="text-center">
          <div
            className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4"
            style={{ borderColor: '#e879f9' }}
          ></div>
          <p style={{ color: 'rgba(255,255,255,0.7)' }}>Verificando acceso al módulo Raid…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    setLocation('/login');
    return null;
  }

  const access: RaidAccessInfo = data || {
    canAccess: false,
    canInteract: false,
    canAdmin: false,
    accessLevel: null,
  };

  if (!access.canAccess) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{
          background:
            'radial-gradient(circle at 10% 10%, rgba(232,121,249,0.08) 0%, transparent 30%), linear-gradient(180deg, #060910 0%, #080c14 50%, #040608 100%)',
        }}
      >
        <div
          className="max-w-md w-full rounded-2xl p-8 text-center"
          style={{
            background: 'rgba(10,14,22,0.95)',
            border: '1px solid rgba(232,121,249,0.25)',
            backdropFilter: 'blur(20px)',
          }}
        >
          <div className="text-5xl mb-4">🛡️</div>
          <h2 className="text-xl font-bold mb-2" style={{ color: '#e879f9' }}>
            Acceso restringido
          </h2>
          <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.6)' }}>
            No tienes acceso al módulo Raid Bosses. Pídele al Super Admin que te asigne un rol
            raid (<span style={{ color: '#e879f9' }}>raid_user</span>,{' '}
            <span style={{ color: '#7bf1d6' }}>raid_mapper</span> o{' '}
            <span style={{ color: '#fbbf24' }}>raid_admin</span>).
          </p>
          <button
            onClick={() => setLocation('/')}
            className="rounded-xl px-4 py-2 text-sm font-semibold transition-all"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.9)',
            }}
          >
            Volver al Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (required === 'interact' && !access.canInteract) {
    // Bloqueo explícito para niveles raid_user / viewer_only. El inventario
    // raid es una sección operativa (registrar drops, vender, reservar) y
    // solo deben entrar raid_mapper / raid_admin / super_admin. Usamos el
    // mismo tono de mensaje que el guard de /inventory legacy para UX
    // consistente — "Sin acceso" + CTA a volver.
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{
          background:
            'radial-gradient(circle at 10% 10%, rgba(232,121,249,0.08) 0%, transparent 30%), linear-gradient(180deg, #060910 0%, #080c14 50%, #040608 100%)',
        }}
      >
        <div
          className="max-w-md rounded-2xl border p-8 text-center space-y-4"
          style={{ background: 'rgba(10,14,22,0.95)', borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <div
            className="mx-auto h-14 w-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)' }}
          >
            <span className="text-2xl">🔒</span>
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>
              Sin acceso
            </h1>
            <p className="text-sm mt-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Esta sección no está disponible para tu rol. Si necesitas acceder, pídele al super
              admin que ajuste tus permisos.
            </p>
          </div>
          <button
            onClick={() => setLocation('/raids')}
            className="w-full rounded-xl py-2.5 text-sm font-semibold transition-all"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.9)',
            }}
          >
            Volver al Dashboard Raid
          </button>
        </div>
      </div>
    );
  }

  if (required === 'admin' && !access.canAdmin) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{
          background:
            'radial-gradient(circle at 10% 10%, rgba(232,121,249,0.08) 0%, transparent 30%), linear-gradient(180deg, #060910 0%, #080c14 50%, #040608 100%)',
        }}
      >
        <div
          className="max-w-md w-full rounded-2xl p-8 text-center"
          style={{
            background: 'rgba(10,14,22,0.95)',
            border: '1px solid rgba(232,121,249,0.25)',
            backdropFilter: 'blur(20px)',
          }}
        >
          <div className="text-5xl mb-4">👑</div>
          <h2 className="text-xl font-bold mb-2" style={{ color: '#fbbf24' }}>
            Se requiere rol administrador
          </h2>
          <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.6)' }}>
            Solo raid_admin o Super Admin pueden acceder a esta sección.
          </p>
          <button
            onClick={() => setLocation('/raids')}
            className="rounded-xl px-4 py-2 text-sm font-semibold transition-all"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.9)',
            }}
          >
            Volver al Dashboard Raid
          </button>
        </div>
      </div>
    );
  }

  if (required === 'super_admin' && access.accessLevel !== 'super_admin') {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{
          background:
            'radial-gradient(circle at 10% 10%, rgba(232,121,249,0.08) 0%, transparent 30%), linear-gradient(180deg, #060910 0%, #080c14 50%, #040608 100%)',
        }}
      >
        <div
          className="max-w-md w-full rounded-2xl p-8 text-center"
          style={{
            background: 'rgba(10,14,22,0.95)',
            border: '1px solid rgba(232,121,249,0.25)',
            backdropFilter: 'blur(20px)',
          }}
        >
          <div className="text-5xl mb-4">👑</div>
          <h2 className="text-xl font-bold mb-2" style={{ color: '#fbbf24' }}>
            Solo Super Admin
          </h2>
          <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.6)' }}>
            La configuración del módulo Raid está reservada al Super Admin del sistema.
          </p>
          <button
            onClick={() => setLocation('/raids')}
            className="rounded-xl px-4 py-2 text-sm font-semibold transition-all"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.9)',
            }}
          >
            Volver al Dashboard Raid
          </button>
        </div>
      </div>
    );
  }

  return <Component raidAccess={access} />;
}
