import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { LayoutDashboard, Package, Clock, Settings, Menu, X, ChevronDown, Shield, User, BarChart3, Users, LogOut, ShoppingBag, Skull, Swords, Flag, Crown, Database, Warehouse } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import { trpc } from '../../lib/trpc';
import EmailVerificationBanner from '../EmailVerificationBanner';

// Lista completa de menús del sistema legacy. Cada entrada declara sus roles
// permitidos; el sidebar filtra según el rol global del usuario logueado.
// `allowedRoles: undefined` == visible para todos los autenticados.
const navItems: Array<{
  href: string;
  label: string;
  icon: any;
  desc: string;
  allowedRoles?: Array<'super_admin' | 'mapper' | 'user'>;
}> = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, desc: 'Vista general y KPIs' },
  // /inventory: solo SUPER_ADMIN y MAPPER (los que pueden crear/vender ítems).
  // Un USER ve el inventario desde el widget del Dashboard, donde puede
  // reservar sin acceder al panel operativo.
  { href: '/inventory', label: 'Inventario', icon: Package, desc: 'Gestión de ítems', allowedRoles: ['super_admin', 'mapper'] },
  { href: '/characters', label: 'Personajes', icon: User, desc: 'Personajes y ganancias' },
  { href: '/warehouse', label: 'Warehouse Clan', icon: Warehouse, desc: 'Bodega del clan y crafteo' },
  { href: '/cycles', label: 'Ciclos de Ventas', icon: BarChart3, desc: 'Historial y cierre de ciclos' },
  { href: '/purchases', label: 'Compras', icon: ShoppingBag, desc: 'Historial de adquisiciones' },
  { href: '/history', label: 'Historial', icon: Clock, desc: 'Registro de acciones' },
  { href: '/settings', label: 'Reglas', icon: Settings, desc: 'Configuración del sistema' },
  { href: '/clans', label: 'Clanes & CPs', icon: Shield, desc: 'Clanes y Command Parties' },
];

// Ambos ítems son solo-super-admin y pertenecen a la configuración global del
// sistema. Por eso conviven en la misma sección "ADMINISTRACIÓN" y
// "Config. Raids" queda visualmente debajo de "Gestión de Usuarios".
const adminNavItems = [
  { href: '/admin/users', label: 'Gestión de Usuarios', icon: Users, desc: 'Administrar cuentas y roles' },
  { href: '/raids/settings', label: 'Config', icon: Crown, desc: 'Catálogos, bosses y materiales' },
  { href: '/admin/backups', label: 'Backups', icon: Database, desc: 'Snapshots de la base de datos' },
];

// `requiresInteract: true` → solo raid_mapper, raid_admin o super_admin ven el
// link. Es el mismo gate que el guard de ruta (`required="interact"`), así
// evitamos mostrar un menú al que después el usuario no puede entrar.
const raidNavItems: Array<{
  href: string;
  label: string;
  icon: any;
  desc: string;
  requiresInteract?: boolean;
}> = [
  { href: '/raids', label: 'Raid Dashboard', icon: LayoutDashboard, desc: 'Métricas y KPIs de raids' },
  { href: '/raids/inventory', label: 'Raid Inventario', icon: Swords, desc: 'Drops y eventos raid', requiresInteract: true },
  { href: '/raids/clans', label: 'Clanes', icon: Flag, desc: 'Ranking y stats por clan' },
  { href: '/raids/purchases', label: 'Compras Raid', icon: ShoppingBag, desc: 'Historial de compras de drops' },
  { href: '/raids/cycles', label: 'Historial de Ciclos', icon: Skull, desc: 'Ciclos cerrados y resúmenes' },
  { href: '/raids/history', label: 'Historial Raid', icon: Clock, desc: 'Registro de acciones del módulo' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { currentUser, setCurrentUser, characters, cycleNumber } = useApp();
  const { logout, user: authUser } = useAuth();

  const isAuthSuperAdmin = authUser?.role === 'super_admin' || authUser?.role === 'SUPER_ADMIN';

  // All users for Super Admin account switcher
  const { data: allUsersData } = trpc.adminUsers.listUsers.useQuery(undefined, {
    enabled: !!isAuthSuperAdmin,
    retry: false,
  });
  const allUsers = (allUsersData as any[]) || [];

  // Raid module access — silently hidden if user has no access
  const { data: raidAccess } = trpc.raid.myAccess.useQuery(undefined, {
    enabled: !!authUser,
    retry: false,
  });
  const canSeeRaidModule = !!raidAccess?.canAccess;
  // El menú "Config. Raids" quedó restringido a super admin del sistema
  // (antes también lo veía raid_admin). Misma política que /admin/users.
  const isCurrentSuperAdmin = currentUser && (
    (currentUser.role as string) === 'SUPER_ADMIN' ||
    (currentUser.role as string) === 'super_admin'
  );

  // Detect impersonation: if currentUser.id is a real user id (not auth-xxx)
  const isImpersonating = currentUser && !String(currentUser.id).startsWith('auth-') && String(currentUser.id) !== `auth-${authUser?.id}`;
  // Effective permissions for sidebar: use impersonated user if switching, otherwise auth user
  const effectiveRole = isImpersonating ? String(currentUser?.role || '').toLowerCase() : String(authUser?.role || '').toLowerCase();
  const effectiveLegacyAccess = isImpersonating ? !!(currentUser as any)?.legacyAccess : (isAuthSuperAdmin || authUser?.legacyAccess === true);
  const effectiveIsSuper = effectiveRole === 'super_admin';
  const impersonatedRaidLevel = isImpersonating ? (currentUser as any)?.raidAccessLevel : null;
  const effectiveRaidAccess = isImpersonating ? !!impersonatedRaidLevel : canSeeRaidModule;
  const effectiveRaidCanInteract = isImpersonating
    ? (impersonatedRaidLevel && impersonatedRaidLevel !== 'viewer_only')
    : !!raidAccess?.canInteract;

  const originalUserChar = authUser ? {
    id: `auth-${authUser.id}`,
    name: authUser.characterName || authUser.name || 'Usuario',
    role: isAuthSuperAdmin ? 'SUPER_ADMIN' : authUser.role === 'mapper' || authUser.role === 'MAPPER' ? 'MAPPER' : 'USER',
    avatar: isAuthSuperAdmin ? 'from-cyan-400 to-blue-600' : authUser.role === 'mapper' || authUser.role === 'MAPPER' ? 'from-amber-400 to-orange-600' : 'from-fuchsia-400 to-purple-600',
    class: isAuthSuperAdmin ? 'Administrador' : authUser.role === 'mapper' || authUser.role === 'MAPPER' ? 'Mapper' : 'Usuario',
    level: 99,
    itemIds: [],
    totalEarnings: 0,
    currentCycleEarnings: 0,
  } : null;

  return (
    <div className="flex min-h-screen" style={{ background: 'radial-gradient(circle at 10% 10%, rgba(123,241,214,0.06) 0%, transparent 30%), radial-gradient(circle at 90% 20%, rgba(232,121,249,0.06) 0%, transparent 30%), linear-gradient(180deg, #060910 0%, #080c14 50%, #040608 100%)' }}>
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r transition-transform duration-300 lg:static lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ background: 'rgba(6,9,16,0.95)', borderColor: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)' }}>

        <div className="flex items-center gap-3 border-b px-5 py-4" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <img src="/raptor-logo.png" alt="RaptorSquad" className="h-10 w-auto object-contain" />
          <div>
            <p className="text-sm font-bold text-gradient">RaptorSquad</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Control Dashboard</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {effectiveLegacyAccess && navItems.filter(item => {
            if (!item.allowedRoles) return true;
            return item.allowedRoles.includes(effectiveRole as any);
          }).map(item => {
            const Icon = item.icon;
            const isActive = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${isActive ? 'bg-white/10' : 'hover:bg-white/5'}`}
                style={{ color: isActive ? '#7bf1d6' : 'rgba(255,255,255,0.5)' }}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate">{item.label}</p>
                  <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>{item.desc}</p>
                </div>
              </Link>
            );
          })}

          {effectiveIsSuper && (
            <>
              <div className="px-3 py-3 mt-4">
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>ADMINISTRACIÓN</p>
              </div>
              {adminNavItems.map(item => {
                const Icon = item.icon;
                const isActive = location === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${isActive ? 'bg-white/10' : 'hover:bg-white/5'}`}
                    style={{ color: isActive ? '#7bf1d6' : 'rgba(255,255,255,0.5)' }}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{item.label}</p>
                      <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>{item.desc}</p>
                    </div>
                  </Link>
                );
              })}
            </>
          )}

          {(isImpersonating ? effectiveRaidAccess : canSeeRaidModule) && (
            <>
              <div className="px-3 py-3 mt-4 flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#e879f9' }}>RAID BOSSES</p>
                {!effectiveRaidCanInteract && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(232,121,249,0.1)', color: '#e879f9', border: '1px solid rgba(232,121,249,0.3)' }}>
                    solo lectura
                  </span>
                )}
              </div>
              {raidNavItems.filter(item => {
                if (item.requiresInteract && !effectiveRaidCanInteract) return false;
                return true;
              }).map(item => {
                const Icon = item.icon;
                const isActive = location === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${isActive ? 'bg-white/10' : 'hover:bg-white/5'}`}
                    style={{ color: isActive ? '#e879f9' : 'rgba(255,255,255,0.5)' }}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{item.label}</p>
                      <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>{item.desc}</p>
                    </div>
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        <div className="border-t px-3 py-4 space-y-2" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.4)' }}>Ciclo Activo</p>
            <p className="text-lg font-bold mt-1" style={{ color: '#7bf1d6' }}>#{cycleNumber}</p>
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-4 py-3 lg:px-6" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="rounded-lg p-2 transition-all hover:bg-white/5 lg:hidden"
            >
              {sidebarOpen ? (
                <X className="h-5 w-5" style={{ color: 'rgba(255,255,255,0.6)' }} />
              ) : (
                <Menu className="h-5 w-5" style={{ color: 'rgba(255,255,255,0.6)' }} />
              )}
            </button>
            <div className="hidden sm:flex items-center gap-2">
              <img src="/raptor-logo.png" alt="RaptorSquad" className="h-8 w-auto object-contain" />
              <h1 className="text-lg font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>RaptorSquad Control Dashboard</h1>
            </div>
          </div>

          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 rounded-xl border px-3 py-2 transition-all"
              style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
              <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${currentUser?.avatar || 'from-gray-400 to-gray-600'} text-xs font-bold text-white`}>
                {currentUser?.name?.slice(0, 2).toUpperCase() || '??'}
              </div>
              <div className="hidden text-left sm:block">
                <p className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>{currentUser?.name || 'Usuario'}</p>
                <p className="text-xs" style={{ color:
                  isCurrentSuperAdmin ? '#7bf1d6' :
                    currentUser && ((currentUser.role as string) === 'MAPPER' || (currentUser.role as string) === 'mapper') ? '#fbbf24' :
                  '#8b5cf6'
                }}>
                  {isCurrentSuperAdmin ? 'Super Admin' :
                   (currentUser && ((currentUser.role as string) === 'MAPPER' || (currentUser.role as string) === 'mapper')) ? 'Mapper' :
                   'Usuario'}
                </p>
              </div>
              <ChevronDown className="h-3 w-3" style={{ color: 'rgba(255,255,255,0.4)' }} />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl border p-2 shadow-2xl z-50"
                style={{ background: 'rgba(10,14,22,0.98)', borderColor: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(20px)' }}>
                {isAuthSuperAdmin && (
                  <>
                    <p className="px-3 py-2 text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      Cambiar cuenta activa
                    </p>
                    <div className="max-h-72 overflow-y-auto space-y-0.5">
                      {originalUserChar && currentUser?.id !== originalUserChar.id && (
                        <button
                          onClick={() => { setCurrentUser(originalUserChar as any); setUserMenuOpen(false); }}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-all hover:bg-white/5 border-b mb-1 pb-3"
                          style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${originalUserChar.avatar} text-xs font-bold text-white`}>
                            {originalUserChar.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold" style={{ color: '#7bf1d6' }}>{originalUserChar.name} (Original)</p>
                            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Volver a mi cuenta</p>
                          </div>
                          <Shield className="h-3.5 w-3.5 shrink-0" style={{ color: '#7bf1d6' }} />
                        </button>
                      )}

                      {allUsers
                        .filter((u: any) => u.isActive !== false && Number(u.id) !== Number(authUser?.id))
                        .map((u: any) => {
                          const roleLc = String(u.role || '').toLowerCase();
                          const isSA = roleLc === 'super_admin';
                          const isMapper = roleLc === 'mapper';
                          const avatarGrad = isSA ? 'from-cyan-400 to-blue-600' : isMapper ? 'from-amber-400 to-orange-600' : 'from-fuchsia-400 to-purple-600';
                          const roleLabel = isSA ? 'Super Admin' : isMapper ? 'Mapper' : roleLc === 'admin' ? 'Admin' : 'Usuario';
                          const hasLegacy = u.legacyAccess;
                          const accessDesc = [
                            hasLegacy ? 'Menú Antiguo' : null,
                            u.raidAccessLevel ? 'Raid' : null,
                          ].filter(Boolean).join(' + ') || 'Sin acceso';
                          return (
                            <button key={u.id}
                              onClick={() => {
                                setCurrentUser({
                                  id: u.id,
                                  name: u.characterName || u.name || 'Sin nombre',
                                  role: u.role?.toUpperCase() || 'USER',
                                  avatar: avatarGrad,
                                  class: u.classMain || roleLabel,
                                  level: 1,
                                  itemIds: [],
                                  totalEarnings: 0,
                                  currentCycleEarnings: 0,
                                  legacyAccess: !!u.legacyAccess,
                                  raidAccessLevel: u.raidAccessLevel || null,
                                  raidCpId: u.raidCpId || null,
                                } as any);
                                setUserMenuOpen(false);
                              }}
                              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-all hover:bg-white/5">
                              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${avatarGrad} text-xs font-bold text-white`}>
                                {(u.characterName || u.name || '??').slice(0, 2).toUpperCase()}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium" style={{ color: 'rgba(255,255,255,0.85)' }}>
                                  {u.characterName || u.name || 'Sin nombre'}
                                </p>
                                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                                  {roleLabel} · {accessDesc}
                                </p>
                              </div>
                              {isSA && <Shield className="h-3.5 w-3.5 shrink-0" style={{ color: '#7bf1d6' }} />}
                              {currentUser && Number(currentUser.id) === Number(u.id) && (
                                <div className="h-2 w-2 shrink-0 rounded-full" style={{ background: '#7bf1d6' }} />
                              )}
                            </button>
                          );
                        })}
                    </div>
                    <div className="border-t my-2" style={{ borderColor: 'rgba(255,255,255,0.06)' }} />
                  </>
                )}
                <div>
                  <button
                    onClick={async () => { await logout(); setUserMenuOpen(false); }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-all hover:bg-red-500/10 mt-2"
                    style={{ color: '#f87171' }}
                  >
                    <LogOut className="h-4 w-4 shrink-0" />
                    <span className="text-sm font-medium">Cerrar Sesión</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 lg:p-6">
          <EmailVerificationBanner />
          {!effectiveLegacyAccess && !effectiveIsSuper && !(isImpersonating ? effectiveRaidAccess : canSeeRaidModule) ? (
            <div className="flex flex-1 items-center justify-center min-h-[60vh]">
              <div className="text-center max-w-md mx-auto px-6 py-12 rounded-2xl"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="flex justify-center mb-6">
                  <div className="h-16 w-16 rounded-2xl flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, rgba(123,241,214,0.2), rgba(232,121,249,0.2))' }}>
                    <Shield className="h-8 w-8" style={{ color: '#7bf1d6' }} />
                  </div>
                </div>
                <h2 className="text-xl font-bold mb-3" style={{ color: 'rgba(255,255,255,0.9)' }}>
                  ¡Bienvenido a RaptorSquad!
                </h2>
                <p className="text-sm leading-relaxed mb-4" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Tu cuenta fue creada exitosamente. Actualmente no tienes acceso a ningún módulo del sistema.
                </p>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  El <span style={{ color: '#7bf1d6', fontWeight: 600 }}>Super Admin</span> debe asignarte los permisos correspondientes para que puedas interactuar con la plataforma. Mientras tanto, aguarda a que se te habilite el acceso.
                </p>
                <div className="mt-6 inline-block px-4 py-2 rounded-xl text-xs font-semibold"
                  style={{ background: 'rgba(123,241,214,0.08)', border: '1px solid rgba(123,241,214,0.2)', color: '#7bf1d6' }}>
                  Esperando asignación de permisos...
                </div>
              </div>
            </div>
          ) : children}
        </main>
      </div>
    </div>
  );
}
