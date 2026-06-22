import React, { useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { trpc } from '../lib/trpc';
import { toast } from 'sonner';
import { Shield, Users, UserCheck, UserX, ChevronDown, Search, RefreshCw, Crown, Trash2, Key, X, AlertTriangle, Pencil } from 'lucide-react';

type UserRole = 'user' | 'mapper' | 'admin' | 'super_admin';

interface AdminUser {
  id: number;
  email: string;
  name: string;
  characterName?: string;
  role: string;
  isActive: boolean;
  legacyAccess?: boolean;
  loginMethod?: string;
  createdAt?: string;
  lastSignedIn?: string;
  openId?: string;
  raidClanId?: number | null;
  raidCpId?: number | null;
  cpStatus?: string | null;
  classMain?: string | null;
}

const ROLE_OPTIONS: { value: UserRole; label: string; color: string }[] = [
  { value: 'user', label: 'Usuario', color: '#8b5cf6' },
  { value: 'mapper', label: 'Mapper', color: '#fbbf24' },
  { value: 'admin', label: 'Admin', color: '#3b82f6' },
  { value: 'super_admin', label: 'Super Admin', color: '#7bf1d6' },
];

function getRoleStyle(role: string) {
  const found = ROLE_OPTIONS.find(r => r.value === role);
  return found ? found : { value: role, label: role, color: '#6b7280' };
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('es-ES', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function RoleSelector({ userId, currentRole, onRoleChange, disabled }: {
  userId: number;
  currentRole: string;
  onRoleChange: (userId: number, role: UserRole) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const style = getRoleStyle(currentRole);

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all"
        style={{
          background: `${style.color}22`,
          color: style.color,
          border: `1px solid ${style.color}44`,
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {currentRole === 'super_admin' && <Crown className="h-3 w-3" />}
        {currentRole === 'admin' && <Shield className="h-3 w-3" />}
        {style.label}
        {!disabled && <ChevronDown className="h-3 w-3 ml-1" />}
      </button>

      {open && !disabled && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full mt-1 z-50 w-48 rounded-xl border p-1 shadow-2xl"
            style={{ background: 'rgba(10,14,22,0.98)', borderColor: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(20px)' }}
          >
            {ROLE_OPTIONS.map(option => (
              <button
                key={option.value}
                onClick={() => {
                  onRoleChange(userId, option.value);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all hover:bg-white/5"
                style={{ color: option.color }}
              >
                {option.value === 'super_admin' && <Crown className="h-3 w-3" />}
                {option.value === 'admin' && <Shield className="h-3 w-3" />}
                {option.label}
                {option.value === currentRole && (
                  <span className="ml-auto text-xs" style={{ color: option.color }}>✓</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ActiveToggle({ userId, isActive, onToggle, disabled }: {
  userId: number;
  isActive: boolean;
  onToggle: (userId: number, isActive: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => !disabled && onToggle(userId, !isActive)}
      disabled={disabled}
      title={isActive ? 'Desactivar cuenta' : 'Activar cuenta'}
      className="relative inline-flex h-6 w-11 items-center rounded-full transition-all focus:outline-none"
      style={{
        background: isActive ? 'rgba(123,241,214,0.3)' : 'rgba(255,255,255,0.1)',
        border: isActive ? '1px solid rgba(123,241,214,0.5)' : '1px solid rgba(255,255,255,0.15)',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <span
        className="inline-block h-4 w-4 rounded-full transition-transform duration-200"
        style={{
          transform: isActive ? 'translateX(24px)' : 'translateX(4px)',
          background: isActive ? '#7bf1d6' : 'rgba(255,255,255,0.4)',
          boxShadow: isActive ? '0 0 8px rgba(123,241,214,0.6)' : 'none',
        }}
      />
    </button>
  );
}

export default function AdminUsers() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [passwordModal, setPasswordModal] = useState<{ userId: number; email: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [deleteModalUser, setDeleteModalUser] = useState<AdminUser | null>(null);
  const [toggleModalUser, setToggleModalUser] = useState<AdminUser | null>(null);
  const [editModalUser, setEditModalUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState({ email: '', characterName: '', raidClanId: '' as string, raidCpId: '' as string, classMain: '' as string });

  const { data: users, isLoading, error, refetch } = trpc.adminUsers.listUsers.useQuery(undefined, {
    retry: false,
  });

  const toggleActiveMutation = trpc.adminUsers.toggleUserActive.useMutation({
    onSuccess: (data) => {
      toast.success(
        data.user.isActive
          ? `Cuenta de ${data.user.name} activada correctamente.`
          : `Cuenta de ${data.user.name} desactivada correctamente.`
      );
      refetch();
    },
    onError: (err) => {
      toast.error(err.message || 'Error al cambiar el estado de la cuenta.');
    },
  });

  const updateRoleMutation = trpc.adminUsers.updateUserRole.useMutation({
    onSuccess: (data) => {
      const roleLabel = getRoleStyle(data.user.role).label;
      toast.success(`Rol de ${data.user.name} actualizado a ${roleLabel}.`);
      refetch();
    },
    onError: (err) => {
      toast.error(err.message || 'Error al cambiar el rol del usuario.');
    },
  });

  const deleteUserMutation = trpc.adminUsers.deleteUser.useMutation({
    onSuccess: (data) => {
      toast.success(`Usuario ${data.user.email} eliminado correctamente.`);
      refetch();
    },
    onError: (err) => {
      toast.error(err.message || 'Error al eliminar el usuario.');
    },
  });

  const changePasswordMutation = trpc.adminUsers.changeUserPassword.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setPasswordModal(null);
      setNewPassword('');
    },
    onError: (err) => {
      toast.error(err.message || 'Error al cambiar la contraseña.');
    },
  });

  const unlockUserMutation = trpc.adminUsers.unlockUser.useMutation({
    onSuccess: () => {
      toast.success('Usuario desbloqueado correctamente.');
      refetch();
    },
    onError: (err) => {
      toast.error(err.message || 'Error al desbloquear el usuario.');
    },
  });

  const { data: clansAndCps } = trpc.adminUsers.clansAndCps.useQuery(undefined, { staleTime: 60_000 });

  const updateProfileMutation = trpc.adminUsers.updateProfile.useMutation({
    onSuccess: (data) => {
      toast.success(`Perfil de ${data.user.name} actualizado correctamente.`);
      setEditModalUser(null);
      refetch();
    },
    onError: (err) => {
      toast.error(err.message || 'Error al actualizar el perfil.');
    },
  });

  const toggleLegacyMutation = trpc.adminUsers.toggleLegacyAccess.useMutation({
    onSuccess: (data) => {
      toast.success(
        data.user.legacyAccess
          ? `Menú antiguo activado para ${data.user.name}.`
          : `Menú antiguo desactivado para ${data.user.name}.`
      );
      refetch();
    },
    onError: (err) => {
      toast.error(err.message || 'Error al cambiar acceso al menú antiguo.');
    },
  });

  const handleToggleActive = (userId: number, _nextState: boolean) => {
    const user = (users || []).find(u => u.id === userId);
    if (user) setToggleModalUser(user);
  };

  const confirmToggleActive = () => {
    if (!toggleModalUser) return;
    toggleActiveMutation.mutate({ userId: toggleModalUser.id, isActive: !toggleModalUser.isActive });
    setToggleModalUser(null);
  };

  const handleRoleChange = (userId: number, role: UserRole) => {
    updateRoleMutation.mutate({ userId, role });
  };

  const handleEditUser = (user: AdminUser) => {
    setEditForm({
      email: user.email || '',
      characterName: user.characterName || user.name || '',
      raidClanId: user.raidClanId ? String(user.raidClanId) : '',
      raidCpId: user.raidCpId ? String(user.raidCpId) : '',
      classMain: user.classMain || '',
    });
    setEditModalUser(user);
  };

  const handleSaveProfile = () => {
    if (!editModalUser) return;
    const payload: any = { userId: editModalUser.id };
    if (editForm.email && editForm.email !== editModalUser.email) payload.email = editForm.email;
    if (editForm.characterName && editForm.characterName !== (editModalUser.characterName || editModalUser.name)) payload.characterName = editForm.characterName;
    payload.raidClanId = editForm.raidClanId ? Number(editForm.raidClanId) : null;
    payload.raidCpId = editForm.raidCpId ? Number(editForm.raidCpId) : null;
    payload.classMain = editForm.classMain || null;
    updateProfileMutation.mutate(payload);
  };

  const editFilteredCps = (clansAndCps?.commandParties || []).filter(
    (cp: any) => !editForm.raidClanId || Number(cp.clanId) === Number(editForm.raidClanId)
  );

  const handleDeleteUser = (user: AdminUser) => {
    setDeleteModalUser(user);
  };

  const confirmDeleteUser = () => {
    if (!deleteModalUser) return;
    deleteUserMutation.mutate({ userId: deleteModalUser.id });
    setDeleteModalUser(null);
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordModal) return;
    if (newPassword.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    changePasswordMutation.mutate({ userId: passwordModal.userId, newPassword });
  };

  const isUserLocked = (user: any) => {
    if (!user.lockedUntil) return false;
    return new Date(user.lockedUntil).getTime() > Date.now();
  };

  const filteredUsers = (users || []).filter(user => {
    const matchesSearch =
      !search ||
      user.email?.toLowerCase().includes(search.toLowerCase()) ||
      user.name?.toLowerCase().includes(search.toLowerCase()) ||
      user.characterName?.toLowerCase().includes(search.toLowerCase());
    if (roleFilter === 'locked') return matchesSearch && isUserLocked(user);
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const totalUsers = users?.length || 0;
  const activeUsers = (users || []).filter(u => u.isActive !== false).length;
  const inactiveUsers = (users || []).filter(u => u.isActive === false).length;
  const adminCount = (users || []).filter(u => u.role === 'super_admin' || u.role === 'admin').length;

  if (error) {
    const isForbidden = error.message?.includes('Super Admin') || error.data?.code === 'FORBIDDEN';
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}
          >
            <Shield className="h-8 w-8" style={{ color: '#ef4444' }} />
          </div>
          <h2 className="text-xl font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>
            {isForbidden ? 'Acceso Denegado' : 'Error al cargar'}
          </h2>
          <p className="text-sm text-center max-w-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {isForbidden
              ? 'Solo el Super Admin puede acceder al panel de gestión de usuarios.'
              : error.message}
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{ background: 'linear-gradient(135deg, rgba(123,241,214,0.3), rgba(232,121,249,0.2))', border: '1px solid rgba(123,241,214,0.3)' }}
              >
                <Users className="h-5 w-5" style={{ color: '#7bf1d6' }} />
              </div>
              <h1 className="text-xl font-bold" style={{ color: 'rgba(255,255,255,0.95)' }}>
                Gestión de Usuarios
              </h1>
              <span
                className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                style={{ background: 'rgba(123,241,214,0.15)', color: '#7bf1d6', border: '1px solid rgba(123,241,214,0.3)' }}
              >
                Super Admin
              </span>
            </div>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Administra cuentas, roles y permisos de todos los usuarios registrados.
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-all hover:bg-white/5"
            style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.6)' }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Total Usuarios', value: totalUsers, color: '#7bf1d6', icon: Users },
            { label: 'Cuentas Activas', value: activeUsers, color: '#4ade80', icon: UserCheck },
            { label: 'Desactivadas', value: inactiveUsers, color: '#f87171', icon: UserX },
            { label: 'Administradores', value: adminCount, color: '#a78bfa', icon: Shield },
          ].map(({ label, value, color, icon: Icon }) => (
            <div
              key={label}
              className="rounded-2xl border p-4"
              style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className="h-4 w-4" style={{ color }} />
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</p>
              </div>
              <p className="text-2xl font-bold font-mono" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
            <input
              type="text"
              placeholder="Buscar por email, nombre o personaje..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-xl border bg-transparent py-2.5 pl-9 pr-4 text-sm outline-none transition-all placeholder:text-white/30"
              style={{
                borderColor: 'rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.85)',
                background: 'rgba(255,255,255,0.03)',
              }}
            />
          </div>
            <div className="flex gap-2 flex-wrap">
            {[{ value: 'all', label: 'Todos' }, ...ROLE_OPTIONS].map(opt => {
              const optValue = opt.value;
              const isActive = roleFilter === optValue;
              const color = 'color' in opt ? opt.color : '#7bf1d6';
              return (
                <button
                  key={optValue}
                  onClick={() => setRoleFilter(optValue)}
                  className="rounded-xl border px-3 py-2 text-xs font-medium transition-all"
                  style={{
                    borderColor: isActive ? color + '44' : 'rgba(255,255,255,0.08)',
                    background: isActive ? color + '22' : 'rgba(255,255,255,0.03)',
                    color: isActive ? color : 'rgba(255,255,255,0.5)',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
            <button
              onClick={() => setRoleFilter('locked')}
              className="rounded-xl border px-3 py-2 text-xs font-medium transition-all"
              style={{
                borderColor: roleFilter === 'locked' ? '#ef444444' : 'rgba(255,255,255,0.08)',
                background: roleFilter === 'locked' ? '#ef444422' : 'rgba(255,255,255,0.03)',
                color: roleFilter === 'locked' ? '#f87171' : 'rgba(255,255,255,0.5)',
              }}
            >
              Bloqueados
            </button>
          </div>
        </div>

        {/* Users Table */}
        <div
          className="rounded-2xl border"
          style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)', overflow: 'visible' }}
        >
          <div className="overflow-x-auto" style={{ overflowY: 'visible' }}>
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <RefreshCw className="h-8 w-8 animate-spin" style={{ color: '#7bf1d6' }} />
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Cargando usuarios...</p>
              </div>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <Users className="h-10 w-10" style={{ color: 'rgba(255,255,255,0.15)' }} />
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {search || roleFilter !== 'all' ? 'No se encontraron usuarios con ese filtro.' : 'No hay usuarios registrados.'}
                </p>
              </div>
            </div>
          ) : (
            <>
            {/* Table Header */}
            <div
              className="hidden md:grid grid-cols-[1fr_140px_130px_60px_60px_50px_50px] gap-3 border-b px-6 py-3 text-xs font-semibold uppercase tracking-widest"
              style={{ borderColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' }}
            >
                <span>Usuario</span>
                <span className="text-center">Rol</span>
                <span className="text-center">Último acceso</span>
                <span className="text-center">Estado</span>
                <span className="text-center" style={{ fontSize: '9px' }}>Menú Antiguo</span>
                <span className="text-center">Acciones</span>
                <span className="text-center">Eliminar</span>
              </div>

            {/* Table Rows */}
            <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                {filteredUsers.map((user: AdminUser) => {
                  const isCurrentUserSuperAdmin = user.role === 'super_admin';
                  const isPending =
                    (toggleActiveMutation.isPending && toggleActiveMutation.variables?.userId === user.id) ||
                    (updateRoleMutation.isPending && updateRoleMutation.variables?.userId === user.id) ||
                    (changePasswordMutation.isPending && changePasswordMutation.variables?.userId === user.id);
                  const isDeleting = deleteUserMutation.isPending && deleteUserMutation.variables?.userId === user.id;

                  return (
                    <div
                      key={user.id}
                      className="grid grid-cols-1 md:grid-cols-[1fr_140px_130px_60px_60px_50px_50px] gap-3 px-6 py-4 transition-all hover:bg-white/[0.02]"
                      style={{ opacity: isPending || isDeleting ? 0.7 : 1 }}
                    >
                      {/* User Info */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold"
                          style={{
                            background: user.isActive === false
                              ? 'rgba(255,255,255,0.05)'
                              : `linear-gradient(135deg, ${getRoleStyle(user.role).color}33, ${getRoleStyle(user.role).color}11)`,
                            color: user.isActive === false ? 'rgba(255,255,255,0.3)' : getRoleStyle(user.role).color,
                            border: `1px solid ${user.isActive === false ? 'rgba(255,255,255,0.08)' : getRoleStyle(user.role).color + '33'}`,
                          }}
                        >
                          {(user.characterName || user.name || user.email || '?').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold truncate" style={{ color: user.isActive === false ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.9)' }}>
                              {user.characterName || user.name || '—'}
                            </p>
                            {user.isActive === false && (
                              <span
                                className="rounded-full px-2 py-0.5 text-xs font-semibold"
                                style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
                              >
                                Desactivado
                              </span>
                            )}
                          </div>
                          <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>
                            {user.email}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.2)' }}>
                            ID: {user.id} · {user.loginMethod || 'local'}
                          </p>
                        </div>
                      </div>

                      {/* Role */}
                      <div className="flex items-center justify-start md:justify-center">
                        <RoleSelector
                          userId={user.id}
                          currentRole={user.role}
                          onRoleChange={handleRoleChange}
                          disabled={isCurrentUserSuperAdmin || isPending}
                        />
                      </div>

                      {/* Last Sign In */}
                      <div className="flex items-center justify-start md:justify-center">
                        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                          {formatDate(user.lastSignedIn)}
                        </span>
                      </div>

                      {/* Active Toggle */}
                      <div className="flex items-center gap-3 justify-start md:justify-center">
                        <ActiveToggle
                          userId={user.id}
                          isActive={user.isActive !== false}
                          onToggle={handleToggleActive}
                          disabled={isCurrentUserSuperAdmin || isPending}
                        />
                        <span className="text-xs md:hidden" style={{ color: user.isActive !== false ? '#7bf1d6' : 'rgba(255,255,255,0.35)' }}>
                          {user.isActive !== false ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>

                      {/* Legacy Access Toggle */}
                      <div className="flex items-center gap-3 justify-start md:justify-center">
                        {isCurrentUserSuperAdmin ? (
                          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>Siempre</span>
                        ) : (
                          <>
                            <ActiveToggle
                              userId={user.id}
                              isActive={user.legacyAccess === true}
                              onToggle={(uid) => toggleLegacyMutation.mutate({ userId: uid, legacyAccess: !(user.legacyAccess === true) })}
                              disabled={isPending}
                            />
                            <span className="text-xs md:hidden" style={{ color: user.legacyAccess === true ? '#fbbf24' : 'rgba(255,255,255,0.35)' }}>
                              {user.legacyAccess === true ? 'Sí' : 'No'}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Actions info */}
                      <div className="flex items-center justify-start md:justify-center gap-1">
                        <button
                          onClick={() => handleEditUser(user)}
                          disabled={isPending || isDeleting}
                          title="Editar perfil"
                          className="p-2 rounded-lg transition-all hover:bg-blue-500/10"
                          style={{ color: '#3b82f6' }}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setPasswordModal({ userId: user.id, email: user.email })}
                          disabled={isPending || isDeleting}
                          title="Cambiar contraseña"
                          className="p-2 rounded-lg transition-all hover:bg-white/5"
                          style={{ color: 'rgba(255,255,255,0.4)' }}
                        >
                          <Key className="h-4 w-4" />
                        </button>
                        {isUserLocked(user) && (
                          <button
                            onClick={() => unlockUserMutation.mutate({ userId: user.id })}
                            disabled={unlockUserMutation.isPending}
                            title="Desbloquear usuario"
                            className="px-2 py-1 rounded-lg text-[10px] font-bold transition-all hover:bg-red-500/20"
                            style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
                          >
                            {unlockUserMutation.isPending ? '...' : 'Desbloquear'}
                          </button>
                        )}
                        {isPending && <RefreshCw className="h-4 w-4 animate-spin" style={{ color: '#7bf1d6' }} />}
                      </div>

                      {/* Delete Button */}
                      <div className="flex items-center justify-start md:justify-center">
                        {isCurrentUserSuperAdmin ? (
                          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>
                        ) : (
                          <button
                            onClick={() => handleDeleteUser(user)}
                            disabled={isDeleting || isPending}
                            title="Eliminar cuenta"
                            className="p-2 rounded-lg transition-all hover:bg-red-500/10"
                            style={{
                              color: isDeleting || isPending ? 'rgba(255,255,255,0.3)' : '#f87171',
                              opacity: isDeleting || isPending ? 0.5 : 1,
                              cursor: isDeleting || isPending ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {isDeleting ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          </div>
        </div>

        {/* Footer info */}
        <div
          className="rounded-xl border p-4"
          style={{ background: 'rgba(123,241,214,0.03)', borderColor: 'rgba(123,241,214,0.1)' }}
        >
          <div className="flex items-start gap-3">
            <Shield className="h-4 w-4 mt-0.5 shrink-0" style={{ color: '#7bf1d6' }} />
            <div>
              <p className="text-xs font-semibold mb-1" style={{ color: '#7bf1d6' }}>
                Seguridad del sistema
              </p>
              <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Los usuarios desactivados no pueden iniciar sesión ni realizar acciones, incluso si tienen una sesión activa. 
                El bloqueo es inmediato y se aplica en cada solicitud al servidor. 
                Las cuentas con rol <strong style={{ color: '#7bf1d6' }}>Super Admin</strong> están protegidas y no pueden ser modificadas desde este panel.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Password Modal */}
      {passwordModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div 
            className="w-full max-w-md rounded-2xl border p-6 shadow-2xl"
            style={{ background: 'rgba(10,14,22,0.98)', borderColor: 'rgba(255,255,255,0.1)' }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                <Key className="h-5 w-5" style={{ color: '#7bf1d6' }} />
              </div>
              <div>
                <h3 className="text-lg font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>Cambiar Contraseña</h3>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Usuario: {passwordModal.email}</p>
              </div>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Nueva Contraseña
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none transition-all"
                  style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)', background: 'rgba(255,255,255,0.03)' }}
                  autoFocus
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setPasswordModal(null); setNewPassword(''); }}
                  className="flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all hover:bg-white/5"
                  style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={changePasswordMutation.isPending || newPassword.length < 6}
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition-all disabled:opacity-50"
                  style={{ background: '#7bf1d6', color: '#000' }}
                >
                  {changePasswordMutation.isPending ? 'Guardando...' : 'Actualizar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete User Confirmation Modal */}
      {deleteModalUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteModalUser(null); }}>
          <div className="w-full max-w-md rounded-2xl p-5 shadow-2xl"
            style={{
              background: 'linear-gradient(180deg, rgba(24,24,40,0.96), rgba(18,18,30,0.96))',
              border: '1px solid rgba(239,68,68,0.35)',
            }}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <Trash2 className="h-5 w-5" style={{ color: '#ef4444' }} />
                <h3 className="text-lg font-bold" style={{ color: 'rgba(255,255,255,0.95)' }}>
                  Eliminar cuenta
                </h3>
              </div>
              <button onClick={() => setDeleteModalUser(null)} className="p-1.5 rounded-lg hover:bg-white/5"
                style={{ color: 'rgba(255,255,255,0.6)' }}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Esta acción eliminará la cuenta de forma permanente. No se puede deshacer.
            </p>
            <div className="rounded-xl p-3 mb-4"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>
                {deleteModalUser.name}
              </p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {deleteModalUser.email} · {getRoleStyle(deleteModalUser.role).label}
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteModalUser(null)}
                className="flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all hover:bg-white/5"
                style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
                Cancelar
              </button>
              <button onClick={confirmDeleteUser}
                disabled={deleteUserMutation.isPending}
                className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: '#ef4444', color: '#fff' }}>
                <Trash2 className="h-4 w-4" />
                {deleteUserMutation.isPending ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toggle Active Confirmation Modal */}
      {toggleModalUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setToggleModalUser(null); }}>
          <div className="w-full max-w-md rounded-2xl p-5 shadow-2xl"
            style={{
              background: 'linear-gradient(180deg, rgba(24,24,40,0.96), rgba(18,18,30,0.96))',
              border: `1px solid ${toggleModalUser.isActive ? 'rgba(251,191,36,0.35)' : 'rgba(123,241,214,0.35)'}`,
            }}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5"
                  style={{ color: toggleModalUser.isActive ? '#fbbf24' : '#7bf1d6' }} />
                <h3 className="text-lg font-bold" style={{ color: 'rgba(255,255,255,0.95)' }}>
                  {toggleModalUser.isActive ? 'Desactivar cuenta' : 'Activar cuenta'}
                </h3>
              </div>
              <button onClick={() => setToggleModalUser(null)} className="p-1.5 rounded-lg hover:bg-white/5"
                style={{ color: 'rgba(255,255,255,0.6)' }}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.45)' }}>
              {toggleModalUser.isActive
                ? 'La cuenta no podrá iniciar sesión hasta que vuelva a activarse.'
                : 'La cuenta podrá iniciar sesión nuevamente.'}
            </p>
            <div className="rounded-xl p-3 mb-4"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>
                {toggleModalUser.name}
              </p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {toggleModalUser.email} · {getRoleStyle(toggleModalUser.role).label}
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setToggleModalUser(null)}
                className="flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all hover:bg-white/5"
                style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
                Cancelar
              </button>
              <button onClick={confirmToggleActive}
                disabled={toggleActiveMutation.isPending}
                className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition-all disabled:opacity-50"
                style={{
                  background: toggleModalUser.isActive ? '#fbbf24' : '#7bf1d6',
                  color: '#000'
                }}>
                {toggleActiveMutation.isPending
                  ? 'Guardando…'
                  : toggleModalUser.isActive ? 'Sí, desactivar' : 'Sí, activar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {editModalUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setEditModalUser(null); }}>
          <div
            className="w-full max-w-lg rounded-2xl border p-6 shadow-2xl"
            style={{ background: 'rgba(10,14,22,0.98)', borderColor: 'rgba(59,130,246,0.3)' }}
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 rounded-xl" style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)' }}>
                <Pencil className="h-5 w-5" style={{ color: '#3b82f6' }} />
              </div>
              <div>
                <h3 className="text-lg font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>Editar Perfil</h3>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {editModalUser.characterName || editModalUser.name} · {editModalUser.email}
                </p>
              </div>
              <button onClick={() => setEditModalUser(null)} className="ml-auto p-1.5 rounded-lg hover:bg-white/5"
                style={{ color: 'rgba(255,255,255,0.6)' }}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Email */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Correo electrónico
                </label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none transition-all"
                  style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)', background: 'rgba(255,255,255,0.03)' }}
                />
              </div>

              {/* Character Name */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Nombre del personaje
                </label>
                <input
                  type="text"
                  value={editForm.characterName}
                  onChange={e => setEditForm(f => ({ ...f, characterName: e.target.value }))}
                  className="w-full rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none transition-all"
                  style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)', background: 'rgba(255,255,255,0.03)' }}
                />
              </div>

              {/* Clan + CP row */}
              <div className="grid grid-cols-2 gap-3">
                {/* Clan */}
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    Clan
                  </label>
                  <select
                    value={editForm.raidClanId}
                    onChange={e => {
                      setEditForm(f => ({ ...f, raidClanId: e.target.value, raidCpId: '' }));
                    }}
                    className="w-full rounded-xl border bg-transparent px-3 py-2.5 text-sm outline-none"
                    style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)', background: 'rgba(15,18,28,0.98)' }}
                  >
                    <option value="">Sin clan</option>
                    {(clansAndCps?.clans || []).map((c: any) => (
                      <option key={c.id} value={String(c.id)}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {/* Command Party */}
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    Command Party (CP)
                  </label>
                  <select
                    value={editForm.raidCpId}
                    onChange={e => setEditForm(f => ({ ...f, raidCpId: e.target.value }))}
                    disabled={!editForm.raidClanId}
                    className="w-full rounded-xl border bg-transparent px-3 py-2.5 text-sm outline-none disabled:opacity-40"
                    style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)', background: 'rgba(15,18,28,0.98)' }}
                  >
                    <option value="">Sin CP</option>
                    {editFilteredCps.map((cp: any) => (
                      <option key={cp.id} value={String(cp.id)}>{cp.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Class */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Clase principal
                </label>
                <select
                  value={editForm.classMain}
                  onChange={e => setEditForm(f => ({ ...f, classMain: e.target.value }))}
                  className="w-full rounded-xl border bg-transparent px-3 py-2.5 text-sm outline-none"
                  style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)', background: 'rgba(15,18,28,0.98)' }}
                >
                  <option value="">Sin clase</option>
                  {(clansAndCps?.availableClasses || []).map((c: any) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditModalUser(null)}
                  className="flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all hover:bg-white/5"
                  style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  disabled={updateProfileMutation.isPending || !editForm.email || !editForm.characterName}
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: '#3b82f6', color: '#fff' }}
                >
                  {updateProfileMutation.isPending ? (
                    <><RefreshCw className="h-4 w-4 animate-spin" /> Guardando...</>
                  ) : (
                    'Guardar cambios'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
