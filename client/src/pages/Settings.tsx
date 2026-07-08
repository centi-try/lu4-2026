import React, { useState, useEffect } from 'react';
import { Shield, Lock, CheckCircle, Zap, Package, AlertTriangle, Key, RefreshCw, Coins } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { categoryMeta, CATEGORIES } from '../lib/category-meta';
import { trpc } from '../lib/trpc';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { useApp } from '../contexts/AppContext';
import { TwoFactorSection } from '../components/settings/TwoFactorSection';

const rules = [
  {
    icon: Shield,
    color: '#7bf1d6',
    title: 'Roles del Sistema',
    desc: 'Cada usuario tiene un rol que determina qué acciones puede realizar dentro de la plataforma.',
    items: [
      'Usuario: acceso básico a la plataforma',
      'Mapper: puede registrar y editar ítems del inventario',
      'Admin: permisos administrativos sobre módulos asignados',
      'Los permisos se gestionan de forma centralizada',
    ],
  },
  {
    icon: CheckCircle,
    color: '#34d399',
    title: 'Inventario e Ítems',
    desc: 'Los ítems pasan por un flujo de estados que garantiza la trazabilidad y control del inventario.',
    items: [
      'Registro de ítems con nombre, categoría, imagen y precio',
      'Confirmación de ítems para validar la información ingresada',
      'Historial completo de cada ítem desde su registro hasta su venta',
      'Ciclos de ventas para agrupar y reportar ganancias por período',
    ],
  },
  {
    icon: Zap,
    color: '#fbbf24',
    title: 'Herramientas de Productividad',
    desc: 'Funcionalidades diseñadas para agilizar el trabajo diario dentro de la plataforma.',
    items: [
      'Autocompletado inteligente al registrar ítems',
      'Sugerencias en tiempo real con imagen y categoría',
      'Navegación rápida con teclado en formularios',
      'Búsqueda y filtros avanzados en todas las tablas',
    ],
  },
  {
    icon: Lock,
    color: '#60a5fa',
    title: 'Datos y Respaldos',
    desc: 'La plataforma mantiene toda la información de forma segura y persistente.',
    items: [
      'Información almacenada de forma centralizada en el servidor',
      'Respaldos automáticos diarios de toda la información',
      'Historial de acciones inmutable para auditoría',
      'Recuperación ante errores mediante sistema de backups',
    ],
  },
];

export default function Settings() {
  const { user } = useAuth();
  const { effectiveIsSuperAdmin } = useApp();
  const isSuperAdmin = effectiveIsSuperAdmin;
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const changePasswordMutation = trpc.settings.changeMyPassword.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (err) => {
      toast.error(err.message || 'Error al cambiar la contraseña.');
    },
  });

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Las contraseñas no coinciden.');
      return;
    }
    changePasswordMutation.mutate({ newPassword });
  };

  return (
    <AppShell>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gradient">Configuración y Reglas</h2>
        <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Gestiona tu cuenta y consulta la documentación completa de las reglas de negocio del sistema.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px] mb-6">
        {/* Left: Rules grid */}
        <div className="grid gap-5 sm:grid-cols-2">
          {rules.map(rule => (
            <div key={rule.title} className="card-glass rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ background: `${rule.color}15`, border: `1px solid ${rule.color}25` }}>
                  <rule.icon className="h-5 w-5" style={{ color: rule.color }} />
                </div>
                <h3 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>{rule.title}</h3>
              </div>
              <p className="text-xs mb-3 leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>{rule.desc}</p>
              <ul className="space-y-1.5">
                {rule.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: rule.color }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Right: Account Security */}
        <div className="space-y-5">
          <div className="card-glass rounded-2xl p-5 border-cyan-500/20" style={{ border: '1px solid rgba(123,241,214,0.15)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: 'rgba(123,241,214,0.12)', border: '1px solid rgba(123,241,214,0.2)' }}>
                <Key className="h-5 w-5" style={{ color: '#7bf1d6' }} />
              </div>
              <div>
                <h3 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>Seguridad de la Cuenta</h3>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Cambia tu contraseña de acceso</p>
              </div>
            </div>

            <form onSubmit={handlePasswordChange} className="space-y-4">
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
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Confirmar Contraseña
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repite la contraseña"
                  className="w-full rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none transition-all"
                  style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)', background: 'rgba(255,255,255,0.03)' }}
                />
              </div>
              <button
                type="submit"
                disabled={changePasswordMutation.isPending || !newPassword || newPassword !== confirmPassword}
                className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all disabled:opacity-50"
                style={{ background: '#7bf1d6', color: '#000' }}
              >
                {changePasswordMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Lock className="h-4 w-4" />
                )}
                {changePasswordMutation.isPending ? 'Actualizando...' : 'Actualizar Contraseña'}
              </button>
            </form>
          </div>

          {/* 2FA (solo super_admin — PR6) */}
          {isSuperAdmin && <TwoFactorSection />}

          {/* Fondo del Clan — visible para todos, solo super_admin puede editar */}
          <ClanFundSettingsCard canEdit={isSuperAdmin} />

          {/* Categories reference */}
          <div className="card-glass rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: 'rgba(232,121,249,0.12)', border: '1px solid rgba(232,121,249,0.2)' }}>
                <Package className="h-5 w-5" style={{ color: '#e879f9' }} />
              </div>
              <div>
                <h3 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>Categorías</h3>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Referencia de iconos base</p>
              </div>
            </div>
            <div className="grid gap-2 grid-cols-2">
              {CATEGORIES.map(cat => {
                const meta = categoryMeta[cat] || { emoji: '📦', label: cat };
                return (
                  <div key={cat} className="flex items-center gap-2 rounded-lg p-2"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <span className="text-lg">{meta.emoji}</span>
                    <span className="text-[10px] font-medium truncate" style={{ color: 'rgba(255,255,255,0.7)' }}>{meta.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Persistencia Confirmada */}
      <div className="flex items-start gap-3 rounded-2xl border p-4"
        style={{ borderColor: 'rgba(52,211,153,0.2)', background: 'rgba(52,211,153,0.05)' }}>
        <CheckCircle className="h-5 w-5 shrink-0 mt-0.5" style={{ color: '#34d399' }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: '#34d399' }}>Persistencia de Datos Activa</p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Toda la información del sistema se almacena de forma persistente en el servidor. 
            Los datos son compartidos entre todos los usuarios y se mantienen seguros incluso tras cerrar la sesión o reiniciar el sistema.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

function ClanFundSettingsCard({ canEdit }: { canEdit: boolean }) {
  const { data: settings, isLoading } = trpc.clanFund.getSettings.useQuery();
  const utils = trpc.useUtils();
  const updateMutation = trpc.clanFund.updateSettings.useMutation({
    onSuccess: () => {
      utils.clanFund.getSettings.invalidate();
      toast.success('Configuración del Fondo del Clan actualizada');
    },
    onError: (err) => toast.error(err.message || 'Error al guardar'),
  });

  const [taxPct, setTaxPct] = useState('0');
  const [discPct, setDiscPct] = useState('0');

  useEffect(() => {
    if (settings) {
      setTaxPct(String(settings.clanTaxPercent ?? 0));
      setDiscPct(String(settings.internalDiscountPercent ?? 0));
    }
  }, [settings]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    const tax = parseFloat(taxPct);
    const disc = parseFloat(discPct);
    if (isNaN(tax) || tax < 0 || tax > 100) { toast.error('Porcentaje clan debe estar entre 0 y 100'); return; }
    if (isNaN(disc) || disc < 0 || disc > 100) { toast.error('Descuento debe estar entre 0 y 100'); return; }
    updateMutation.mutate({ clanTaxPercent: tax, internalDiscountPercent: disc });
  };

  if (isLoading) return null;

  const disabledStyle = !canEdit ? { opacity: 0.6, cursor: 'not-allowed' } : {};

  return (
    <div className="card-glass rounded-2xl p-5" style={{ border: '1px solid rgba(251,191,36,0.15)' }}>
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.2)' }}>
          <Coins className="h-5 w-5" style={{ color: '#fbbf24' }} />
        </div>
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>Fondo del Clan</h3>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {canEdit ? 'Retención y descuento interno' : 'Solo lectura — solo el Administrador del Sistema puede modificar'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Porcentaje Retención Clan (%)
          </label>
          <input
            type="number"
            value={taxPct}
            onChange={e => canEdit && setTaxPct(e.target.value)}
            disabled={!canEdit}
            min="0" max="100" step="0.1"
            className="w-full rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none transition-all font-mono"
            style={{ ...{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)', background: 'rgba(255,255,255,0.03)' }, ...disabledStyle }}
          />
          <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Porcentaje de cada venta que se destina al fondo del clan (sobre precio real cobrado).
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Descuento Venta Interna (%)
          </label>
          <input
            type="number"
            value={discPct}
            onChange={e => canEdit && setDiscPct(e.target.value)}
            disabled={!canEdit}
            min="0" max="100" step="0.1"
            className="w-full rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none transition-all font-mono"
            style={{ ...{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)', background: 'rgba(255,255,255,0.03)' }, ...disabledStyle }}
          />
          <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Descuento aplicado al precio cuando se marca como "Venta Interna Clan".
          </p>
        </div>
        {canEdit && (
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all disabled:opacity-50"
            style={{ background: '#fbbf24', color: '#000' }}
          >
            {updateMutation.isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Coins className="h-4 w-4" />
            )}
            {updateMutation.isPending ? 'Guardando...' : 'Guardar Configuración'}
          </button>
        )}
      </form>
    </div>
  );
}
