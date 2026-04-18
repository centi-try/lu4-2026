import React, { useRef, useState } from 'react';
import { Crown, Skull, Flag, Trash2, Pencil, Plus, X, Image as ImageIcon, Save, Upload, Palette } from 'lucide-react';
import { AppShell } from '../../components/layout/AppShell';
import { trpc } from '../../lib/trpc';
import { toast } from 'sonner';
import type { RaidAccessInfo } from '../../components/RaidProtectedRoute';
import { CATEGORIES, categoryMeta } from '../../lib/category-meta';

// Límite para imágenes de iconos (base64 data URL). 2 MB alcanza para un ícono.
const ICON_MAX_BYTES = 2 * 1024 * 1024;

async function iconFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

interface Props {
  raidAccess?: RaidAccessInfo;
}

export default function RaidSettings({ raidAccess }: Props) {
  const utils = trpc.useUtils();
  const bossesQ = trpc.raid.bosses.list.useQuery();
  const clansQ = trpc.raid.clans.list.useQuery();

  const createBoss = trpc.raid.bosses.create.useMutation({
    onSuccess: () => {
      toast.success('Raid Boss creado');
      utils.raid.bosses.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateBoss = trpc.raid.bosses.update.useMutation({
    onSuccess: () => {
      toast.success('Raid Boss actualizado');
      utils.raid.bosses.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteBoss = trpc.raid.bosses.delete.useMutation({
    onSuccess: () => {
      toast.success('Raid Boss eliminado');
      utils.raid.bosses.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const createClan = trpc.raid.clans.create.useMutation({
    onSuccess: () => {
      toast.success('Clan creado');
      utils.raid.clans.list.invalidate();
      utils.raid.clans.stats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateClan = trpc.raid.clans.update.useMutation({
    onSuccess: () => {
      toast.success('Clan actualizado');
      utils.raid.clans.list.invalidate();
      utils.raid.clans.stats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteClan = trpc.raid.clans.delete.useMutation({
    onSuccess: () => {
      toast.success('Clan eliminado');
      utils.raid.clans.list.invalidate();
      utils.raid.clans.stats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // ---- Boss form ----
  const [bossName, setBossName] = useState('');
  const [bossImage, setBossImage] = useState('');
  const [bossLevel, setBossLevel] = useState('');
  const [bossNotes, setBossNotes] = useState('');
  const [editingBossId, setEditingBossId] = useState<number | null>(null);

  const resetBossForm = () => {
    setBossName('');
    setBossImage('');
    setBossLevel('');
    setBossNotes('');
    setEditingBossId(null);
  };

  const submitBoss = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bossName.trim()) {
      toast.error('El nombre del boss es obligatorio');
      return;
    }
    const payload = {
      name: bossName.trim(),
      officialImageUrl: bossImage.trim() || null,
      level: bossLevel.trim() ? Number(bossLevel) : null,
      notes: bossNotes.trim() || null,
    };
    if (editingBossId) {
      updateBoss.mutate({ id: editingBossId, ...payload }, { onSuccess: resetBossForm });
    } else {
      createBoss.mutate(payload, { onSuccess: resetBossForm });
    }
  };

  const editBoss = (b: any) => {
    setEditingBossId(Number(b.id));
    setBossName(b.name || '');
    setBossImage(b.officialImageUrl || '');
    setBossLevel(b.level ? String(b.level) : '');
    setBossNotes(b.notes || '');
  };

  // ---- Clan form ----
  const [clanName, setClanName] = useState('');
  const [clanTag, setClanTag] = useState('');
  const [clanDesc, setClanDesc] = useState('');
  const [editingClanId, setEditingClanId] = useState<number | null>(null);

  const resetClanForm = () => {
    setClanName('');
    setClanTag('');
    setClanDesc('');
    setEditingClanId(null);
  };

  const submitClan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clanName.trim()) {
      toast.error('El nombre del clan es obligatorio');
      return;
    }
    const payload = {
      name: clanName.trim(),
      tag: clanTag.trim() || null,
      description: clanDesc.trim() || null,
    };
    if (editingClanId) {
      updateClan.mutate({ id: editingClanId, ...payload }, { onSuccess: resetClanForm });
    } else {
      createClan.mutate(payload, { onSuccess: resetClanForm });
    }
  };

  const editClan = (c: any) => {
    setEditingClanId(Number(c.id));
    setClanName(c.name || '');
    setClanTag(c.tag || '');
    setClanDesc(c.description || '');
  };

  const bosses = bossesQ.data || [];
  const clans = clansQ.data || [];
  const canAdminClans = !!raidAccess?.canAdmin;

  // Confirmaciones de borrado (reemplazan window.confirm() feos)
  const [bossToDelete, setBossToDelete] = useState<any | null>(null);
  const [clanToDelete, setClanToDelete] = useState<any | null>(null);

  return (
    <AppShell>
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Crown className="h-5 w-5" style={{ color: '#fbbf24' }} />
          <h2 className="text-2xl font-bold text-gradient">Configuración Raid</h2>
        </div>
        <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Gestión del catálogo de Raid Bosses (solo Super Admin) y de Clanes. Estos catálogos
          alimentan los formularios del módulo Raid.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ===== Raid Bosses ===== */}
        <div className="card-glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Skull className="h-5 w-5" style={{ color: '#e879f9' }} />
              <h3 className="text-base font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>
                Catálogo de Raid Bosses
              </h3>
            </div>
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={{
                background: 'rgba(232,121,249,0.12)',
                color: '#e879f9',
                border: '1px solid rgba(232,121,249,0.25)',
              }}
            >
              {bosses.length} registrados
            </span>
          </div>

          <form onSubmit={submitBoss} className="space-y-3 mb-4">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Nombre del boss *
              </label>
              <input
                type="text"
                value={bossName}
                onChange={(e) => setBossName(e.target.value)}
                placeholder="Antharas, Baium, etc."
                className="w-full rounded-xl px-3 py-2 text-sm"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.9)',
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Nivel
                </label>
                <input
                  type="number"
                  value={bossLevel}
                  onChange={(e) => setBossLevel(e.target.value)}
                  placeholder="85"
                  className="w-full rounded-xl px-3 py-2 text-sm"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.9)',
                  }}
                />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Imagen oficial (URL)
                </label>
                <input
                  type="text"
                  value={bossImage}
                  onChange={(e) => setBossImage(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-xl px-3 py-2 text-sm"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.9)',
                  }}
                />
              </div>
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Notas
              </label>
              <textarea
                value={bossNotes}
                onChange={(e) => setBossNotes(e.target.value)}
                rows={2}
                placeholder="Estrategia, drops típicos..."
                className="w-full rounded-xl px-3 py-2 text-sm resize-none"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.9)',
                }}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createBoss.isPending || updateBoss.isPending}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(232,121,249,0.25), rgba(167,139,250,0.25))',
                  border: '1px solid rgba(232,121,249,0.3)',
                  color: '#e879f9',
                }}
              >
                {editingBossId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {editingBossId ? 'Guardar cambios' : 'Crear Boss'}
              </button>
              {editingBossId && (
                <button
                  type="button"
                  onClick={resetBossForm}
                  className="rounded-xl px-4 py-2 text-sm font-semibold transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.7)',
                  }}
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {bosses.length === 0 ? (
              <p
                className="text-xs text-center py-6"
                style={{ color: 'rgba(255,255,255,0.3)' }}
              >
                No hay raid bosses registrados. Creá el primero arriba.
              </p>
            ) : (
              bosses.map((b: any) => (
                <div
                  key={b.id}
                  className="flex items-center gap-3 rounded-xl p-2.5"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div
                    className="h-10 w-10 shrink-0 rounded-lg flex items-center justify-center overflow-hidden"
                    style={{
                      background: 'rgba(232,121,249,0.1)',
                      border: '1px solid rgba(232,121,249,0.25)',
                    }}
                  >
                    {b.officialImageUrl ? (
                      <img
                        src={b.officialImageUrl}
                        alt={b.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Skull className="h-5 w-5" style={{ color: '#e879f9' }} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-sm font-medium truncate"
                      style={{ color: 'rgba(255,255,255,0.9)' }}
                    >
                      {b.name}
                    </p>
                    <p
                      className="text-xs truncate"
                      style={{ color: 'rgba(255,255,255,0.4)' }}
                    >
                      {b.level ? `Lv ${b.level} · ` : ''}
                      {b.notes || 'Sin notas'}
                    </p>
                  </div>
                  <button
                    onClick={() => editBoss(b)}
                    className="rounded-lg p-1.5 transition-all hover:bg-white/5"
                    style={{ color: 'rgba(255,255,255,0.5)' }}
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {(() => {
                    const usage = Number(b.usageCount) || 0;
                    const blocked = usage > 0;
                    return (
                      <button
                        onClick={() => {
                          if (!blocked) setBossToDelete(b);
                        }}
                        disabled={blocked}
                        className="rounded-lg p-1.5 transition-all"
                        style={{
                          color: blocked
                            ? 'rgba(255,120,120,0.25)'
                            : 'rgba(255,120,120,0.7)',
                          cursor: blocked ? 'not-allowed' : 'pointer',
                        }}
                        title={
                          blocked
                            ? `No se puede eliminar · está asociado a ${usage} evento${usage === 1 ? '' : 's'}. Editalo en vez de borrarlo.`
                            : 'Eliminar'
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    );
                  })()}
                </div>
              ))
            )}
          </div>
        </div>

        {/* ===== Clanes ===== */}
        <div className="card-glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Flag className="h-5 w-5" style={{ color: '#7bf1d6' }} />
              <h3 className="text-base font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>
                Catálogo de Clanes
              </h3>
            </div>
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={{
                background: 'rgba(123,241,214,0.12)',
                color: '#7bf1d6',
                border: '1px solid rgba(123,241,214,0.25)',
              }}
            >
              {clans.length} clanes
            </span>
          </div>

          {canAdminClans ? (
            <form onSubmit={submitClan} className="space-y-3 mb-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    Nombre del clan *
                  </label>
                  <input
                    type="text"
                    value={clanName}
                    onChange={(e) => setClanName(e.target.value)}
                    placeholder="Dragon Slayers"
                    className="w-full rounded-xl px-3 py-2 text-sm"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: 'rgba(255,255,255,0.9)',
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    Tag
                  </label>
                  <input
                    type="text"
                    value={clanTag}
                    onChange={(e) => setClanTag(e.target.value)}
                    placeholder="DRG"
                    maxLength={20}
                    className="w-full rounded-xl px-3 py-2 text-sm"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: 'rgba(255,255,255,0.9)',
                    }}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Descripción
                </label>
                <textarea
                  value={clanDesc}
                  onChange={(e) => setClanDesc(e.target.value)}
                  rows={2}
                  placeholder="Descripción del clan..."
                  className="w-full rounded-xl px-3 py-2 text-sm resize-none"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.9)',
                  }}
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={createClan.isPending || updateClan.isPending}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all"
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(123,241,214,0.25), rgba(167,139,250,0.25))',
                    border: '1px solid rgba(123,241,214,0.3)',
                    color: '#7bf1d6',
                  }}
                >
                  {editingClanId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {editingClanId ? 'Guardar cambios' : 'Crear Clan'}
                </button>
                {editingClanId && (
                  <button
                    type="button"
                    onClick={resetClanForm}
                    className="rounded-xl px-4 py-2 text-sm font-semibold transition-all"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'rgba(255,255,255,0.7)',
                    }}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          ) : (
            <p
              className="text-xs text-center py-3 mb-3"
              style={{ color: 'rgba(255,255,255,0.4)' }}
            >
              Solo raid_admin o Super Admin pueden crear/editar clanes.
            </p>
          )}

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {clans.length === 0 ? (
              <p
                className="text-xs text-center py-6"
                style={{ color: 'rgba(255,255,255,0.3)' }}
              >
                No hay clanes registrados. Creá el primero arriba.
              </p>
            ) : (
              clans.map((c: any) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 rounded-xl p-2.5"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div
                    className="h-10 w-10 shrink-0 rounded-lg flex items-center justify-center"
                    style={{
                      background: 'rgba(123,241,214,0.1)',
                      border: '1px solid rgba(123,241,214,0.25)',
                    }}
                  >
                    <Flag className="h-5 w-5" style={{ color: '#7bf1d6' }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-sm font-medium truncate"
                      style={{ color: 'rgba(255,255,255,0.9)' }}
                    >
                      {c.name}{' '}
                      {c.tag && (
                        <span className="text-xs" style={{ color: '#7bf1d6' }}>
                          [{c.tag}]
                        </span>
                      )}
                    </p>
                    <p
                      className="text-xs truncate"
                      style={{ color: 'rgba(255,255,255,0.4)' }}
                    >
                      {c.description || 'Sin descripción'}
                    </p>
                  </div>
                  {canAdminClans && (
                    <>
                      <button
                        onClick={() => editClan(c)}
                        className="rounded-lg p-1.5 transition-all hover:bg-white/5"
                        style={{ color: 'rgba(255,255,255,0.5)' }}
                        title="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {(() => {
                        const usage = Number(c.usageCount) || 0;
                        const blocked = usage > 0;
                        return (
                          <button
                            onClick={() => {
                              if (!blocked) setClanToDelete(c);
                            }}
                            disabled={blocked}
                            className="rounded-lg p-1.5 transition-all"
                            style={{
                              color: blocked
                                ? 'rgba(255,120,120,0.25)'
                                : 'rgba(255,120,120,0.7)',
                              cursor: blocked ? 'not-allowed' : 'pointer',
                            }}
                            title={
                              blocked
                                ? `No se puede eliminar · está asociado a ${usage} evento${usage === 1 ? '' : 's'}. Editalo en vez de borrarlo.`
                                : 'Eliminar'
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        );
                      })()}
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ===== Iconos por categoría de drop (super admin only) ===== */}
      {raidAccess?.accessLevel === 'super_admin' && <CategoryIconsSection />}

      {/* ===== Gestión de Accesos Raid (super admin only) ===== */}
      {raidAccess?.accessLevel === 'super_admin' && <RaidAccessSection />}

      {/* ===== Modales de confirmación de borrado ===== */}
      {bossToDelete && (
        <ConfirmDeleteModal
          title="Eliminar Raid Boss"
          description="Esta acción es irreversible. El boss dejará de aparecer en el catálogo para nuevos eventos; los eventos ya creados que lo referenciaban conservan su imagen."
          itemLabel={bossToDelete.name}
          itemDetail={bossToDelete.level ? `Lv ${bossToDelete.level}` : undefined}
          itemImage={bossToDelete.officialImageUrl || null}
          isPending={deleteBoss.isPending}
          onCancel={() => {
            if (!deleteBoss.isPending) setBossToDelete(null);
          }}
          onConfirm={() =>
            deleteBoss.mutate(
              { id: Number(bossToDelete.id) },
              { onSuccess: () => setBossToDelete(null) }
            )
          }
        />
      )}

      {clanToDelete && (
        <ConfirmDeleteModal
          title="Eliminar Clan"
          description="Esta acción es irreversible. El clan dejará de aparecer como destinatario en nuevos eventos; sus asignaciones previas y estadísticas históricas se conservan."
          itemLabel={clanToDelete.name}
          itemDetail={clanToDelete.tag ? `[${clanToDelete.tag}]` : undefined}
          itemImage={null}
          isPending={deleteClan.isPending}
          onCancel={() => {
            if (!deleteClan.isPending) setClanToDelete(null);
          }}
          onConfirm={() =>
            deleteClan.mutate(
              { id: Number(clanToDelete.id) },
              { onSuccess: () => setClanToDelete(null) }
            )
          }
        />
      )}
    </AppShell>
  );
}

// ============================================================================
// Modal reutilizable de confirmación de borrado
// ============================================================================

function ConfirmDeleteModal({
  title,
  description,
  itemLabel,
  itemDetail,
  itemImage,
  isPending,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  itemLabel: string;
  itemDetail?: string;
  itemImage: string | null;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl p-5"
        style={{
          background: 'linear-gradient(180deg, rgba(24,24,40,0.96), rgba(18,18,30,0.96))',
          border: '1px solid rgba(239,68,68,0.3)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <Trash2 className="h-5 w-5" style={{ color: '#ef4444' }} />
              <h3 className="text-lg font-bold" style={{ color: 'rgba(255,255,255,0.95)' }}>
                {title}
              </h3>
            </div>
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
              {description}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-lg p-1.5"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.6)',
            }}
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          className="rounded-xl p-3 mb-4 flex items-center gap-3"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div
            className="h-10 w-10 shrink-0 rounded-lg overflow-hidden flex items-center justify-center"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {itemImage ? (
              <img src={itemImage} alt={itemLabel} className="h-full w-full object-cover" />
            ) : (
              <Trash2 className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.25)' }} />
            )}
          </div>
          <div className="min-w-0">
            <div
              className="text-sm font-semibold truncate"
              style={{ color: 'rgba(255,255,255,0.9)' }}
            >
              {itemLabel}
            </div>
            {itemDetail && (
              <div
                className="text-[11px] mt-0.5"
                style={{ color: 'rgba(255,255,255,0.45)' }}
              >
                {itemDetail}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.75)',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
            style={{
              background: 'linear-gradient(90deg, rgba(239,68,68,0.9), rgba(232,121,249,0.9))',
              border: '1px solid rgba(239,68,68,0.5)',
              color: '#fff',
              opacity: isPending ? 0.6 : 1,
            }}
          >
            <Trash2 className="h-4 w-4" />
            {isPending ? 'Eliminando…' : 'Sí, eliminar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Sección: iconos por categoría de drop
// ============================================================================

function CategoryIconsSection() {
  const utils = trpc.useUtils();
  const iconsQ = trpc.raid.categoryIcons.list.useQuery();
  const setIcon = trpc.raid.categoryIcons.set.useMutation({
    onSuccess: () => {
      toast.success('Icono guardado');
      utils.raid.categoryIcons.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteIcon = trpc.raid.categoryIcons.delete.useMutation({
    onSuccess: () => {
      toast.success('Icono eliminado');
      utils.raid.categoryIcons.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const icons = iconsQ.data || [];
  const iconByCat: Record<string, string> = {};
  icons.forEach((r: any) => {
    iconByCat[String(r.category).toUpperCase()] = r.imageUrl;
  });

  // Confirmación para borrar ícono de categoría.
  const [iconToDelete, setIconToDelete] = useState<{
    category: string;
    label: string;
    emoji: string;
    imageUrl: string;
  } | null>(null);

  return (
    <div className="mt-5 rounded-2xl p-5" style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div className="flex items-center gap-2 mb-1">
        <Palette className="h-5 w-5" style={{ color: '#a78bfa' }} />
        <h3 className="text-lg font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>
          Iconos por categoría de drop
        </h3>
      </div>
      <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>
        Estos iconos se asignan automáticamente a los items dropeados según la categoría que
        elija el raid_mapper al registrar el evento. El mapper no puede cambiarlo manualmente.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        {CATEGORIES.map((cat) => {
          const meta = categoryMeta[cat] || { emoji: '📦', label: cat };
          const current = iconByCat[cat] || '';
          return (
            <CategoryIconRow
              key={cat}
              category={cat}
              label={meta.label}
              emoji={meta.emoji}
              color={meta.color}
              currentUrl={current}
              onSave={(url) => setIcon.mutate({ category: cat, imageUrl: url })}
              onDelete={() =>
                setIconToDelete({
                  category: cat,
                  label: meta.label,
                  emoji: meta.emoji,
                  imageUrl: current,
                })
              }
              saving={setIcon.isPending || deleteIcon.isPending}
            />
          );
        })}
      </div>

      {iconToDelete && (
        <ConfirmDeleteModal
          title="Eliminar ícono de categoría"
          description="Esta acción es irreversible. Los drops nuevos de esta categoría volverán a usar el ícono genérico hasta que asignes uno nuevo."
          itemLabel={`${iconToDelete.emoji} ${iconToDelete.label}`}
          itemDetail={`Categoría ${iconToDelete.category}`}
          itemImage={iconToDelete.imageUrl || null}
          isPending={deleteIcon.isPending}
          onCancel={() => {
            if (!deleteIcon.isPending) setIconToDelete(null);
          }}
          onConfirm={() =>
            deleteIcon.mutate(
              { category: iconToDelete.category },
              { onSuccess: () => setIconToDelete(null) }
            )
          }
        />
      )}
    </div>
  );
}

function CategoryIconRow({
  category,
  label,
  emoji,
  color,
  currentUrl,
  onSave,
  onDelete,
  saving,
}: {
  category: string;
  label: string;
  emoji: string;
  color: string;
  currentUrl: string;
  onSave: (url: string) => void;
  onDelete: () => void;
  saving: boolean;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [manualUrl, setManualUrl] = useState('');
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('El archivo debe ser una imagen');
      return;
    }
    if (file.size > ICON_MAX_BYTES) {
      toast.error(`Máximo ${Math.round(ICON_MAX_BYTES / 1024)} KB`);
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await iconFileToDataUrl(file);
      onSave(dataUrl);
      if (fileRef.current) fileRef.current.value = '';
    } catch {
      toast.error('No se pudo leer el archivo');
    } finally {
      setUploading(false);
    }
  };

  const submitUrl = () => {
    const url = manualUrl.trim();
    if (!url) {
      toast.error('Pegá una URL');
      return;
    }
    onSave(url);
    setManualUrl('');
  };

  return (
    <div
      className="rounded-xl p-3 flex flex-col gap-2"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${color}22`,
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="h-12 w-12 shrink-0 rounded-xl overflow-hidden flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {currentUrl ? (
            <img src={currentUrl} alt={category} className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-5 w-5" style={{ color: 'rgba(255,255,255,0.25)' }} />
          )}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold" style={{ color }}>
            {emoji} {label}
          </div>
          <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
            {currentUrl
              ? currentUrl.startsWith('data:')
                ? `archivo inline (${Math.round(currentUrl.length / 1024)} KB)`
                : currentUrl
              : 'sin icono asignado'}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] || null)}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={saving || uploading}
          className="rounded-lg px-2 py-1.5 text-xs flex items-center gap-1 transition-all"
          style={{
            background: 'rgba(167,139,250,0.1)',
            border: '1px solid rgba(167,139,250,0.25)',
            color: '#a78bfa',
          }}
        >
          <Upload className="h-3 w-3" />
          {uploading ? 'Subiendo…' : 'Subir archivo'}
        </button>
        <input
          type="text"
          value={manualUrl}
          onChange={(e) => setManualUrl(e.target.value)}
          placeholder="o pegá una URL…"
          className="flex-1 min-w-0 rounded-lg px-2 py-1.5 text-xs"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.9)',
          }}
        />
        <button
          type="button"
          onClick={submitUrl}
          disabled={saving || !manualUrl.trim()}
          className="rounded-lg px-2 py-1.5 text-xs flex items-center gap-1 transition-all"
          style={{
            background: 'rgba(123,241,214,0.1)',
            border: '1px solid rgba(123,241,214,0.25)',
            color: '#7bf1d6',
            opacity: saving || !manualUrl.trim() ? 0.4 : 1,
          }}
        >
          <Save className="h-3 w-3" />
          Guardar
        </button>
        {currentUrl && (
          <button
            type="button"
            onClick={onDelete}
            disabled={saving}
            className="rounded-lg px-2 py-1.5 text-xs flex items-center transition-all"
            style={{
              background: 'rgba(255,120,120,0.08)',
              border: '1px solid rgba(255,120,120,0.25)',
              color: 'rgba(255,120,120,0.9)',
            }}
            title="Quitar icono"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Sección: asignación de accesos raid a usuarios
// ============================================================================

function RaidAccessSection() {
  const utils = trpc.useUtils();
  const usersQ = trpc.raid.access.listAll.useQuery();
  const setAccess = trpc.raid.access.set.useMutation({
    onSuccess: () => {
      toast.success('Acceso actualizado');
      utils.raid.access.listAll.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const setBulk = trpc.raid.access.setBulk.useMutation({
    onSuccess: (d) => {
      toast.success(`Acceso actualizado para ${d.results.length} usuarios`);
      setSelectedIds([]);
      utils.raid.access.listAll.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkLevel, setBulkLevel] = useState<
    'raid_admin' | 'raid_mapper' | 'raid_user' | 'viewer_only' | 'revoke'
  >('raid_user');

  const users = usersQ.data || [];
  const filteredUsers = users.filter((u: any) => u.role !== 'super_admin');

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const applyBulk = () => {
    if (selectedIds.length === 0) {
      toast.error('Seleccioná al menos un usuario');
      return;
    }
    const level = bulkLevel === 'revoke' ? null : bulkLevel;
    setBulk.mutate({ userIds: selectedIds, accessLevel: level });
  };

  const levelLabel = (lvl: string | null | undefined) => {
    if (!lvl) return 'Sin acceso';
    if (lvl === 'raid_admin') return 'Raid Admin';
    if (lvl === 'raid_mapper') return 'Raid Mapper';
    if (lvl === 'raid_user') return 'Raid User';
    if (lvl === 'viewer_only') return 'Solo lectura';
    return lvl;
  };

  const levelColor = (lvl: string | null | undefined) => {
    if (!lvl) return 'rgba(255,255,255,0.3)';
    if (lvl === 'raid_admin') return '#fbbf24';
    if (lvl === 'raid_mapper') return '#7bf1d6';
    if (lvl === 'raid_user') return '#a78bfa';
    if (lvl === 'viewer_only') return '#e879f9';
    return 'rgba(255,255,255,0.5)';
  };

  return (
    <div className="card-glass rounded-2xl p-5 mt-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Crown className="h-5 w-5" style={{ color: '#fbbf24' }} />
          <h3 className="text-base font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>
            Gestión de Accesos al Módulo Raid
          </h3>
        </div>
        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Asignar roles raid a usuarios del sistema (sin afectar su rol principal).
        </span>
      </div>

      <div
        className="flex flex-wrap items-center gap-3 mb-4 rounded-xl p-3"
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
          Acción masiva ({selectedIds.length} seleccionados):
        </span>
        <select
          value={bulkLevel}
          onChange={(e) => setBulkLevel(e.target.value as any)}
          className="rounded-lg px-2 py-1 text-xs"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.9)',
          }}
        >
          <option value="raid_admin">Raid Admin</option>
          <option value="raid_mapper">Raid Mapper</option>
          <option value="raid_user">Raid User</option>
          <option value="viewer_only">Solo lectura (viewer_only)</option>
          <option value="revoke">Revocar acceso</option>
        </select>
        <button
          onClick={applyBulk}
          disabled={selectedIds.length === 0 || setBulk.isPending}
          className="rounded-lg px-3 py-1 text-xs font-semibold transition-all"
          style={{
            background:
              'linear-gradient(135deg, rgba(251,191,36,0.2), rgba(232,121,249,0.2))',
            border: '1px solid rgba(251,191,36,0.3)',
            color: '#fbbf24',
          }}
        >
          Aplicar
        </button>
      </div>

      <div
        className="rounded-xl overflow-hidden"
        style={{ border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <table className="w-full text-sm">
          <thead style={{ background: 'rgba(255,255,255,0.03)' }}>
            <tr>
              <th className="p-3 w-10"></th>
              <th
                className="p-3 text-left text-xs uppercase tracking-wider"
                style={{ color: 'rgba(255,255,255,0.4)' }}
              >
                Usuario
              </th>
              <th
                className="p-3 text-left text-xs uppercase tracking-wider"
                style={{ color: 'rgba(255,255,255,0.4)' }}
              >
                Personaje
              </th>
              <th
                className="p-3 text-left text-xs uppercase tracking-wider"
                style={{ color: 'rgba(255,255,255,0.4)' }}
              >
                Rol principal
              </th>
              <th
                className="p-3 text-left text-xs uppercase tracking-wider"
                style={{ color: 'rgba(255,255,255,0.4)' }}
              >
                Acceso Raid
              </th>
              <th
                className="p-3 text-left text-xs uppercase tracking-wider"
                style={{ color: 'rgba(255,255,255,0.4)' }}
              >
                Acción
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="p-6 text-center text-xs"
                  style={{ color: 'rgba(255,255,255,0.3)' }}
                >
                  No hay usuarios para asignar acceso.
                </td>
              </tr>
            )}
            {filteredUsers.map((u: any) => (
              <tr
                key={u.id}
                className="border-t"
                style={{ borderColor: 'rgba(255,255,255,0.04)' }}
              >
                <td className="p-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(Number(u.id))}
                    onChange={() => toggleSelect(Number(u.id))}
                    className="accent-amber-400"
                  />
                </td>
                <td className="p-3">
                  <p
                    className="text-sm font-medium"
                    style={{ color: 'rgba(255,255,255,0.9)' }}
                  >
                    {u.name || u.email}
                  </p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {u.email}
                  </p>
                </td>
                <td className="p-3">
                  {u.characterName ? (
                    <span
                      className="text-xs rounded-full px-2 py-0.5"
                      style={{
                        background: 'rgba(167,139,250,0.08)',
                        color: '#a78bfa',
                        border: '1px solid rgba(167,139,250,0.25)',
                      }}
                      title="Nombre de personaje ingresado al crear la cuenta"
                    >
                      {u.characterName}
                    </span>
                  ) : (
                    <span
                      className="text-xs"
                      style={{ color: 'rgba(255,255,255,0.3)' }}
                    >
                      —
                    </span>
                  )}
                </td>
                <td className="p-3">
                  <span
                    className="text-xs rounded-full px-2 py-0.5"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      color: 'rgba(255,255,255,0.6)',
                      border: '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    {u.role}
                  </span>
                </td>
                <td className="p-3">
                  <span
                    className="text-xs rounded-full px-2 py-0.5"
                    style={{
                      color: levelColor(u.raidAccess?.accessLevel),
                      border: `1px solid ${levelColor(u.raidAccess?.accessLevel)}40`,
                      background: 'rgba(255,255,255,0.02)',
                    }}
                  >
                    {levelLabel(u.raidAccess?.accessLevel)}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-1.5">
                    <select
                      value={u.raidAccess?.accessLevel || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAccess.mutate({
                          userId: Number(u.id),
                          accessLevel: val === '' ? null : (val as any),
                        });
                      }}
                      className="rounded-lg px-2 py-1 text-xs"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: 'rgba(255,255,255,0.9)',
                      }}
                    >
                      <option value="">Sin acceso</option>
                      <option value="viewer_only">Solo lectura</option>
                      <option value="raid_user">Raid User</option>
                      <option value="raid_mapper">Raid Mapper</option>
                      <option value="raid_admin">Raid Admin</option>
                    </select>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
