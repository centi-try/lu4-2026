import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { LayoutDashboard, Package, Clock, ImageIcon, Settings, Menu, X, ChevronDown, Shield, User, BarChart3, Users, LogOut, ShoppingBag } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, desc: 'Vista general y KPIs' },
  { href: '/inventory', label: 'Inventario', icon: Package, desc: 'Gestión de ítems' },
  { href: '/characters', label: 'Personajes', icon: User, desc: 'Personajes y ganancias' },
  { href: '/cycles', label: 'Ciclos de Ventas', icon: BarChart3, desc: 'Historial y cierre de ciclos' },
  { href: '/purchases', label: 'Compras', icon: ShoppingBag, desc: 'Historial de adquisiciones' },
  { href: '/history', label: 'Historial', icon: Clock, desc: 'Registro de acciones' },
  { href: '/images', label: 'Imágenes', icon: ImageIcon, desc: 'Gestión de imágenes' },
  { href: '/settings', label: 'Reglas', icon: Settings, desc: 'Configuración del sistema' },
];

const adminNavItems = [
  { href: '/admin/users', label: 'Gestión de Usuarios', icon: Users, desc: 'Administrar cuentas y roles' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { currentUser, setCurrentUser, characters, cycleNumber } = useApp();
  const { logout, user: authUser } = useAuth();

  const isAuthSuperAdmin = authUser?.role === 'super_admin' || authUser?.role === 'SUPER_ADMIN';
  const isCurrentSuperAdmin = currentUser && (
    (currentUser.role as string) === 'SUPER_ADMIN' ||
    (currentUser.role as string) === 'super_admin'
  );

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

        <div className="flex items-center gap-3 border-b px-5 py-5" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl shadow-neon-cyan" style={{ background: 'linear-gradient(135deg, rgba(123,241,214,0.3), rgba(232,121,249,0.2))' }}>
            <Package className="h-5 w-5" style={{ color: '#7bf1d6' }} />
          </div>
          <div>
            <p className="text-sm font-bold text-gradient">RaptorSquad</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Control Dashboard</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <a className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${isActive ? 'bg-white/10' : 'hover:bg-white/5'}`}
                  style={{ color: isActive ? '#7bf1d6' : 'rgba(255,255,255,0.5)' }}>
                  <Icon className="h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{item.label}</p>
                    <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>{item.desc}</p>
                  </div>
                </a>
              </Link>
            );
          })}

          {isAuthSuperAdmin && (
            <>
              <div className="px-3 py-3 mt-4">
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>ADMINISTRACIÓN</p>
              </div>
              {adminNavItems.map(item => {
                const Icon = item.icon;
                const isActive = location === item.href;
                return (
                  <Link key={item.href} href={item.href}>
                    <a className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${isActive ? 'bg-white/10' : 'hover:bg-white/5'}`}
                      style={{ color: isActive ? '#7bf1d6' : 'rgba(255,255,255,0.5)' }}>
                      <Icon className="h-4 w-4 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{item.label}</p>
                        <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>{item.desc}</p>
                      </div>
                    </a>
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
            <h1 className="text-lg font-bold hidden sm:block" style={{ color: 'rgba(255,255,255,0.9)' }}>
              RaptorSquad Control Dashboard
            </h1>
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
                          onClick={() => { setCurrentUser(originalUserChar); setUserMenuOpen(false); }}
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

                      {characters?.slice(0, 20).map(char => (
                        <button key={char.id}
                          onClick={() => { setCurrentUser(char); setUserMenuOpen(false); }}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-all hover:bg-white/5">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${char.avatar} text-xs font-bold text-white`}>
                            {char.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium" style={{ color: 'rgba(255,255,255,0.85)' }}>{char.name}</p>
                            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{char.class} · Nv.{char.level}</p>
                          </div>
                          {char.role === 'SUPER_ADMIN' && (
                            <Shield className="h-3.5 w-3.5 shrink-0" style={{ color: '#7bf1d6' }} />
                          )}
                          {currentUser && currentUser.id === char.id && (
                            <div className="h-2 w-2 shrink-0 rounded-full" style={{ background: '#7bf1d6' }} />
                          )}
                        </button>
                      ))}
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
          {children}
        </main>
      </div>
    </div>
  );
}
