import React, { useRef, useState, useCallback } from 'react';
import { Crown, Skull, Flag, Trash2, Pencil, Plus, X, Image as ImageIcon, Save, Upload, Palette, Package, Search, Video, Type, GripVertical, ExternalLink } from 'lucide-react';
import { AppShell } from '../../components/layout/AppShell';
import { trpc } from '../../lib/trpc';
import { toast } from 'sonner';
import type { RaidAccessInfo } from '../../components/RaidProtectedRoute';
import { CATEGORIES, categoryMeta } from '../../lib/category-meta';
import { FancySelect } from '../../components/ui/FancySelect';
import { ImageHoverPreview } from '../../components/ui/ImageHoverPreview';

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

  // ---- Material Catalog ----
  const catalogQ = trpc.warehouse.catalog.list.useQuery();
  const createCatalogItem = trpc.warehouse.catalog.create.useMutation({
    onSuccess: () => { toast.success('Material agregado al catálogo'); utils.warehouse.catalog.list.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteCatalogItem = trpc.warehouse.catalog.delete.useMutation({
    onSuccess: () => { toast.success('Material eliminado del catálogo'); utils.warehouse.catalog.list.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateCatalogItem = trpc.warehouse.catalog.update.useMutation({
    onSuccess: () => { toast.success('Material actualizado'); utils.warehouse.catalog.list.invalidate(); utils.warehouse.list.invalidate(); utils.warehouse.listIncoming.invalidate(); setEditingCatMatId(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const catalogItems = catalogQ.data || [];
  const [catMatName, setCatMatName] = useState('');
  const [catMatCategory, setCatMatCategory] = useState('');
  const [catMatImage, setCatMatImage] = useState('');
  const [catMatSearch, setCatMatSearch] = useState('');
  const [catMatToDelete, setCatMatToDelete] = useState<any | null>(null);
  const [editingCatMatId, setEditingCatMatId] = useState<number | null>(null);
  const [editCatMatName, setEditCatMatName] = useState('');
  const [editCatMatCategory, setEditCatMatCategory] = useState('');
  const [editCatMatImage, setEditCatMatImage] = useState('');
  const startEditCatMat = (m: any) => {
    setEditingCatMatId(Number(m.id));
    setEditCatMatName(m.name || '');
    setEditCatMatCategory(m.category || '');
    setEditCatMatImage(m.imageUrl || '');
  };
  const saveEditCatMat = () => {
    if (!editingCatMatId || !editCatMatName.trim() || !editCatMatCategory) return;
    updateCatalogItem.mutate({ id: editingCatMatId, name: editCatMatName.trim(), category: editCatMatCategory, imageUrl: editCatMatImage.trim() || undefined });
  };

  const submitCatalogMat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!catMatName.trim()) { toast.error('Nombre es obligatorio'); return; }
    if (!catMatCategory) { toast.error('Selecciona una categoría'); return; }
    createCatalogItem.mutate({
      name: catMatName.trim(),
      category: catMatCategory,
      imageUrl: catMatImage.trim() || undefined,
    }, {
      onSuccess: () => { setCatMatName(''); setCatMatCategory(''); setCatMatImage(''); },
    });
  };

  const filteredCatalog = (catalogItems as any[]).filter((m: any) => {
    if (!catMatSearch) return true;
    return String(m.name || '').toLowerCase().includes(catMatSearch.toLowerCase());
  });

  // Confirmaciones de borrado (reemplazan window.confirm() feos)
  const [bossToDelete, setBossToDelete] = useState<any | null>(null);
  const [clanToDelete, setClanToDelete] = useState<any | null>(null);

  // Tab state
  const [configTab, setConfigTab] = useState<'catalogs' | 'classes' | 'presentation' | 'access' | 'materials'>('access');

  const configTabs: { key: typeof configTab; label: string; icon: React.ReactNode; color: string }[] = [
    { key: 'access', label: 'Accesos', icon: <Flag className="h-4 w-4" />, color: '#60a5fa' },
    { key: 'materials', label: 'Catálogo', icon: <Package className="h-4 w-4" />, color: '#34d399' },
    { key: 'classes', label: 'Clases', icon: <Crown className="h-4 w-4" />, color: '#fbbf24' },
    { key: 'catalogs', label: 'Bosses & Clanes', icon: <Skull className="h-4 w-4" />, color: '#e879f9' },
    { key: 'presentation', label: 'Presentación', icon: <Palette className="h-4 w-4" />, color: '#a78bfa' },
  ];

  return (
    <AppShell>
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Crown className="h-5 w-5" style={{ color: '#fbbf24' }} />
          <h2 className="text-2xl font-bold text-gradient">Configuración</h2>
        </div>
        <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Catálogos del sistema: Bosses, Clanes, Clases, Íconos, Accesos y Materiales. Solo Super Admin puede gestionar.
        </p>
      </div>

      {/* Pill tabs */}
      <div
        className="flex items-center gap-1 mb-5 rounded-xl p-1 flex-wrap"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        {configTabs.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setConfigTab(t.key)}
            className="flex-1 rounded-lg px-3 py-2 text-xs font-medium flex items-center justify-center gap-1.5 transition-all whitespace-nowrap"
            style={{
              background: configTab === t.key
                ? `linear-gradient(135deg, ${t.color}30, ${t.color}15)`
                : 'transparent',
              color: configTab === t.key ? t.color : 'rgba(255,255,255,0.55)',
              border: configTab === t.key ? `1px solid ${t.color}35` : '1px solid transparent',
            }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Bosses & Clanes */}
      {configTab === 'catalogs' && <div className="grid gap-5 lg:grid-cols-2">
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
                  <ImageHoverPreview src={b.officialImageUrl} caption={b.name} size={400}>
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
                  </ImageHoverPreview>
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
      </div>}

      {/* Tab: Clases de Personaje */}
      {configTab === 'classes' && raidAccess?.accessLevel === 'super_admin' && <CharacterClassesSection />}
      {configTab === 'classes' && raidAccess?.accessLevel !== 'super_admin' && (
        <div className="card-glass rounded-2xl p-8 text-center"><p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>Solo Super Admin puede gestionar clases.</p></div>
      )}

      {/* Tab: Presentación del Login */}
      {configTab === 'presentation' && raidAccess?.accessLevel === 'super_admin' && <PresentationSection />}
      {configTab === 'presentation' && raidAccess?.accessLevel !== 'super_admin' && (
        <div className="card-glass rounded-2xl p-8 text-center"><p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>Solo Super Admin puede gestionar la presentación.</p></div>
      )}

      {/* Tab: Gestión de Accesos */}
      {configTab === 'access' && raidAccess?.accessLevel === 'super_admin' && <RaidAccessSection />}
      {configTab === 'access' && raidAccess?.accessLevel !== 'super_admin' && (
        <div className="card-glass rounded-2xl p-8 text-center"><p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>Solo Super Admin puede gestionar accesos.</p></div>
      )}

      {/* Tab: Catálogo de Materiales */}
      {configTab === 'materials' &&
      <div className="card-glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5" style={{ color: '#34d399' }} />
            <h3 className="text-base font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>
              Catálogo de Materiales
            </h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399' }}>
              {(catalogItems as any[]).length}
            </span>
          </div>
        </div>
        <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Registra materiales una vez (nombre, categoría, imagen). Se autocompletan al registrar en Warehouse Clan.
        </p>

        {/* Form para agregar material */}
        <form onSubmit={submitCatalogMat} className="rounded-xl p-4 mb-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-4">
              <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Nombre *</label>
              <input
                value={catMatName}
                onChange={e => setCatMatName(e.target.value)}
                placeholder="Coal, Iron Ore, Lance Blade..."
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }}
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Categoría *</label>
              <FancySelect<string>
                value={catMatCategory || null}
                onChange={setCatMatCategory}
                accent="turquoise"
                size="md"
                placeholder="— Seleccionar —"
                options={CATEGORIES.map(c => {
                  const meta = categoryMeta[c] || { emoji: '📦', label: c };
                  return { value: c, label: meta.label, emoji: meta.emoji };
                })}
              />
            </div>
            <div className="sm:col-span-4">
              <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>URL Imagen</label>
              <input
                value={catMatImage}
                onChange={e => setCatMatImage(e.target.value)}
                placeholder="https://wikipedia1.mw2.wiki/i64/..."
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }}
              />
            </div>
            <div className="sm:col-span-1">
              <button
                type="submit"
                disabled={createCatalogItem.isPending}
                className="w-full rounded-lg px-3 py-2 text-xs font-semibold transition-all"
                style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}
              >
                <Plus className="h-4 w-4 mx-auto" />
              </button>
            </div>
          </div>
          {catMatImage && (
            <div className="mt-2 flex items-center gap-2">
              <img src={catMatImage} alt="preview" className="h-8 w-8 rounded object-cover border" style={{ borderColor: 'rgba(255,255,255,0.1)' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Vista previa de la imagen</span>
            </div>
          )}
        </form>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.3)' }} />
          <input
            type="text"
            placeholder="Buscar en catálogo..."
            value={catMatSearch}
            onChange={e => setCatMatSearch(e.target.value)}
            className="w-full rounded-lg pl-9 pr-3 py-1.5 text-xs"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)' }}
          />
        </div>

        {/* Catalog list */}
        <div className="space-y-1">
          {filteredCatalog.length === 0 && (
            <p className="text-xs text-center py-6" style={{ color: 'rgba(255,255,255,0.25)' }}>
              {catMatSearch ? 'Sin resultados.' : 'Catálogo vacío. Agrega el primer material arriba.'}
            </p>
          )}
          {filteredCatalog.map((m: any) => (
            <div key={m.id}>
              {editingCatMatId === Number(m.id) ? (
                <div className="rounded-lg p-3" style={{ background: 'rgba(52,211,153,0.04)', border: '1px solid rgba(52,211,153,0.15)' }}>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                    <div className="sm:col-span-4">
                      <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Nombre</label>
                      <input value={editCatMatName} onChange={e => setEditCatMatName(e.target.value)} className="w-full rounded-lg px-3 py-1.5 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }} autoFocus onKeyDown={e => { if (e.key === 'Enter') saveEditCatMat(); if (e.key === 'Escape') setEditingCatMatId(null); }} />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Categoría</label>
                      <FancySelect<string>
                        value={editCatMatCategory || null}
                        onChange={setEditCatMatCategory}
                        accent="turquoise"
                        size="sm"
                        placeholder="— Seleccionar —"
                        options={CATEGORIES.map(c => {
                          const meta = categoryMeta[c] || { emoji: '📦', label: c };
                          return { value: c, label: meta.label, emoji: meta.emoji };
                        })}
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>URL Imagen</label>
                      <input value={editCatMatImage} onChange={e => setEditCatMatImage(e.target.value)} className="w-full rounded-lg px-3 py-1.5 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }} onKeyDown={e => { if (e.key === 'Enter') saveEditCatMat(); if (e.key === 'Escape') setEditingCatMatId(null); }} />
                    </div>
                    <div className="sm:col-span-2 flex gap-1.5">
                      <button onClick={saveEditCatMat} disabled={!editCatMatName.trim() || !editCatMatCategory || updateCatalogItem.isPending} className="p-1.5 rounded-lg" style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }} title="Guardar"><Save className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setEditingCatMatId(null)} className="p-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)' }} title="Cancelar"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                  {editCatMatImage && (
                    <div className="mt-2 flex items-center gap-2">
                      <img src={editCatMatImage} alt="preview" className="h-7 w-7 rounded object-cover border" style={{ borderColor: 'rgba(255,255,255,0.1)' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Vista previa</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-white/[0.02] transition-colors" style={{ border: '1px solid rgba(255,255,255,0.04)' }}>
                  <div className="flex items-center gap-3">
                    {m.imageUrl ? (
                      <img src={m.imageUrl} alt="" className="h-7 w-7 rounded object-cover border" style={{ borderColor: 'rgba(255,255,255,0.1)' }} />
                    ) : (
                      <div className="h-7 w-7 rounded flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <Package className="h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.2)' }} />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.85)' }}>{m.name}</p>
                      <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{categoryMeta[m.category as keyof typeof categoryMeta]?.emoji} {categoryMeta[m.category as keyof typeof categoryMeta]?.label || m.category}</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => startEditCatMat(m)}
                      className="p-1.5 rounded-lg transition-all hover:bg-white/5"
                      style={{ color: 'rgba(255,200,100,0.6)' }}
                      title="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setCatMatToDelete(m)}
                      className="p-1.5 rounded-lg transition-all hover:bg-white/5"
                      style={{ color: 'rgba(255,120,120,0.6)' }}
                      title="Eliminar del catálogo"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>}

      {/* Modal confirmación eliminar material del catálogo */}
      {catMatToDelete && (
        <ConfirmDeleteModal
          title="Eliminar Material del Catálogo"
          description="El material se eliminará del catálogo. Los ítems ya registrados en la bodega no se verán afectados."
          itemLabel={catMatToDelete.name}
          itemImage={catMatToDelete.imageUrl || null}
          isPending={deleteCatalogItem.isPending}
          onCancel={() => { if (!deleteCatalogItem.isPending) setCatMatToDelete(null); }}
          onConfirm={() => deleteCatalogItem.mutate(
            { id: Number(catMatToDelete.id) },
            { onSuccess: () => setCatMatToDelete(null) }
          )}
        />
      )}

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
        <ImageHoverPreview src={currentUrl} caption={`${emoji} ${label}`} size={220}>
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
        </ImageHoverPreview>
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
      toast.error('Selecciona al menos un usuario');
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
        <div className="min-w-[200px]">
          <FancySelect<string>
            value={bulkLevel}
            onChange={(v) => setBulkLevel(String(v) as any)}
            accent="amber"
            size="sm"
            options={[
              { value: 'raid_admin', label: 'Raid Admin', emoji: '👑' },
              { value: 'raid_mapper', label: 'Raid Mapper', emoji: '🗺️' },
              { value: 'raid_user', label: 'Raid User', emoji: '⚔️' },
              { value: 'viewer_only', label: 'Solo lectura', emoji: '👁️', description: 'viewer_only' },
              { value: 'revoke', label: 'Revocar acceso', emoji: '🚫' },
            ]}
          />
        </div>
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
                    <div className="min-w-[160px]">
                      <FancySelect<string>
                        value={u.raidAccess?.accessLevel || ''}
                        onChange={(v) => {
                          const val = String(v);
                          setAccess.mutate({
                            userId: Number(u.id),
                            accessLevel: val === '' ? null : (val as any),
                          });
                        }}
                        accent="amber"
                        size="sm"
                        placeholder="Sin acceso"
                        panelWidth="auto"
                        panelAlign="right"
                        options={[
                          { value: '', label: 'Sin acceso', emoji: '—' },
                          { value: 'viewer_only', label: 'Solo lectura', emoji: '👁️' },
                          { value: 'raid_user', label: 'Raid User', emoji: '⚔️' },
                          { value: 'raid_mapper', label: 'Raid Mapper', emoji: '🗺️' },
                          { value: 'raid_admin', label: 'Raid Admin', emoji: '👑' },
                        ]}
                      />
                    </div>
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

// ============================================================================
// Gestión de clases de personaje (Super Admin)
// ============================================================================

function CharacterClassesSection() {
  const utils = trpc.useUtils();
  const classesQ = trpc.raid.commandParties.listClasses.useQuery();
  const classes = (classesQ.data || []) as any[];

  const addClass = trpc.raid.commandParties.addClass.useMutation({
    onSuccess: () => {
      utils.raid.commandParties.listClasses.invalidate();
      toast.success('Clase agregada');
    },
    onError: (e: any) => toast.error(e.message),
  });
  const updateClass = trpc.raid.commandParties.updateClass.useMutation({
    onSuccess: () => {
      utils.raid.commandParties.listClasses.invalidate();
      toast.success('Clase actualizada');
      setEditingClassId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteClass = trpc.raid.commandParties.deleteClass.useMutation({
    onSuccess: () => {
      utils.raid.commandParties.listClasses.invalidate();
      toast.success('Clase eliminada');
      setClassToDelete(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [newClassName, setNewClassName] = useState('');
  const [editingClassId, setEditingClassId] = useState<number | null>(null);
  const [editClassName, setEditClassName] = useState('');
  const [classToDelete, setClassToDelete] = useState<any | null>(null);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim()) return;
    addClass.mutate({ name: newClassName.trim() });
    setNewClassName('');
  };

  const startEdit = (c: any) => {
    setEditingClassId(Number(c.id));
    setEditClassName(c.name || '');
  };

  const handleUpdate = () => {
    if (!editingClassId || !editClassName.trim()) return;
    updateClass.mutate({ id: editingClassId, name: editClassName.trim() });
  };

  return (
    <>
      <div className="card-glass rounded-2xl p-5 mt-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5" style={{ color: '#38bdf8' }} />
            <h3 className="text-base font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>
              Clases de Personaje
            </h3>
          </div>
          <span className="rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ background: 'rgba(56,189,248,0.12)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.25)' }}>
            {classes.length} clases
          </span>
        </div>

        <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Estas clases aparecen en el dropdown de registro y en la vista de Clanes & CPs.
        </p>

        <form onSubmit={handleAdd} className="flex gap-2 mb-4">
          <input
            value={newClassName}
            onChange={e => setNewClassName(e.target.value)}
            placeholder="Nombre de la clase (ej: Dark Wizard, Temple Knight)..."
            className="input-dark flex-1"
          />
          <button
            type="submit"
            disabled={!newClassName.trim() || addClass.isPending}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium"
            style={{
              background: 'rgba(56,189,248,0.15)',
              border: '1px solid rgba(56,189,248,0.3)',
              color: '#38bdf8',
              opacity: newClassName.trim() ? 1 : 0.4,
            }}
          >
            <Plus className="h-4 w-4" /> Agregar
          </button>
        </form>

        <div className="space-y-1">
          {classes.length === 0 && (
            <p className="text-xs py-3 text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
              No hay clases definidas. Agrega una para que aparezca en el registro.
            </p>
          )}
          {classes.map((c: any) => (
            <div key={c.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/[0.02]"
              style={{ border: '1px solid rgba(255,255,255,0.04)' }}>
              {editingClassId === Number(c.id) ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    value={editClassName}
                    onChange={e => setEditClassName(e.target.value)}
                    className="input-dark flex-1 text-sm py-1"
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleUpdate(); if (e.key === 'Escape') setEditingClassId(null); }}
                  />
                  <button onClick={handleUpdate} disabled={!editClassName.trim() || updateClass.isPending}
                    className="p-1.5 rounded hover:bg-white/5 transition" title="Guardar"
                    style={{ color: '#22c55e', opacity: editClassName.trim() ? 1 : 0.4 }}>
                    <Save className="h-4 w-4" />
                  </button>
                  <button onClick={() => setEditingClassId(null)}
                    className="p-1.5 rounded hover:bg-white/5 transition" title="Cancelar"
                    style={{ color: 'rgba(255,255,255,0.4)' }}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <>
                  <span className="text-sm" style={{ color: 'rgba(255,255,255,0.8)' }}>{c.name}</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => startEdit(c)}
                      className="p-1.5 rounded hover:bg-white/5 transition"
                      style={{ color: '#a78bfa' }}
                      title="Editar clase"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setClassToDelete(c)}
                      disabled={deleteClass.isPending}
                      className="p-1.5 rounded hover:bg-white/5 transition"
                      style={{ color: '#ef4444' }}
                      title="Eliminar clase"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Modal confirmación eliminar clase */}
      {classToDelete && (
        <ConfirmDeleteModal
          title="Eliminar Clase"
          description="Esta acción es irreversible. La clase dejará de aparecer en el dropdown de registro. Los usuarios que ya tienen esta clase asignada conservarán el valor."
          itemLabel={classToDelete.name}
          itemImage={null}
          isPending={deleteClass.isPending}
          onCancel={() => { if (!deleteClass.isPending) setClassToDelete(null); }}
          onConfirm={() => deleteClass.mutate({ id: Number(classToDelete.id) })}
        />
      )}
    </>
  );
}

// ============================================================================
// Sección: Presentación del Login
// ============================================================================

function PresentationSection() {
  const utils = trpc.useUtils();
  const listQ = trpc.presentation.list.useQuery({ page: 1, limit: 100 });
  const createMut = trpc.presentation.create.useMutation({
    onSuccess: () => { utils.presentation.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.presentation.update.useMutation({
    onSuccess: () => { toast.success('Item actualizado'); utils.presentation.list.invalidate(); setEditItem(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.presentation.delete.useMutation({
    onSuccess: () => { toast.success('Item eliminado'); utils.presentation.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);
  const [formType, setFormType] = useState<'image' | 'video' | 'text'>('video');
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [duplicateError, setDuplicateError] = useState('');
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const items = listQ.data?.items || [];
  // Sort: text first, then newest first (reverse order for videos/images)
  const sortedItems = [...items].sort((a: any, b: any) => {
    if (a.type === 'text' && b.type !== 'text') return -1;
    if (a.type !== 'text' && b.type === 'text') return 1;
    return 0;
  }).reverse();
  // But text still at top after reverse
  const finalItems = [
    ...sortedItems.filter((i: any) => i.type === 'text'),
    ...sortedItems.filter((i: any) => i.type !== 'text'),
  ];

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newPreviews: string[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 5 * 1024 * 1024) { toast.error(`${file.name} excede 5 MB`); continue; }
      const data = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      newPreviews.push(data);
    }
    setPendingImages(prev => [...prev, ...newPreviews]);
    if (newPreviews.length === 1) setFormContent(newPreviews[0]);
    e.target.value = '';
  }, []);

  const handleSubmit = async () => {
    setDuplicateError('');

    // Handle multiple pending images
    if (formType === 'image' && pendingImages.length > 0) {
      const existingContents = items.map((it: any) => it.content);
      let added = 0;
      for (let i = 0; i < pendingImages.length; i++) {
        if (existingContents.includes(pendingImages[i])) continue;
        const title = formTitle.trim() || `Imagen ${i + 1}`;
        await createMut.mutateAsync({ type: 'image', title, content: pendingImages[i] });
        added++;
      }
      if (added > 0) {
        toast.success(`${added} imagen(es) agregada(s)`);
      } else {
        setDuplicateError('Todas las imágenes ya existen. No se puede duplicar.');
        return;
      }
      setPendingImages([]);
      setFormContent('');
      setFormTitle('');
      setDuplicateError('');
      utils.presentation.list.invalidate();
      return;
    }

    if (!formContent.trim()) { setDuplicateError('El contenido es obligatorio'); return; }
    if (editItem) {
      updateMut.mutate({ id: editItem.id, title: formTitle, content: formContent });
      return;
    }

    // Duplicate validation: check if content already exists
    const existingContents = items.map((it: any) => it.content);

    if (formType === 'video') {
      const lines = formContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const validLinks = lines.filter(l => extractYoutubeId(l));
      if (validLinks.length === 0) { setDuplicateError('No se detectaron links de YouTube válidos'); return; }

      // Deduplicate within the batch itself
      const uniqueLinks = Array.from(new Set(validLinks));

      // Check against existing items
      const duplicates = uniqueLinks.filter(link => existingContents.includes(link));
      const newLinks = uniqueLinks.filter(link => !existingContents.includes(link));

      if (duplicates.length > 0 && newLinks.length === 0) {
        setDuplicateError(`Todos los links ya existen. No se puede duplicar contenido.`);
        return;
      }
      if (duplicates.length > 0) {
        setDuplicateError(`${duplicates.length} link(s) ya existe(n) y no se agregarán. Se subirán ${newLinks.length} nuevo(s).`);
      }
      if (newLinks.length === 0) return;

      for (let i = 0; i < newLinks.length; i++) {
        await createMut.mutateAsync({ type: 'video', title: formTitle || (newLinks.length > 1 ? `Video ${i + 1}` : ''), content: newLinks[i] });
      }
      toast.success(`${newLinks.length} video(s) agregado(s)`);
      setFormContent('');
      setDuplicateError('');
    } else {
      // Image or text: check duplicate
      if (existingContents.includes(formContent)) {
        setDuplicateError('Este contenido ya existe. No se puede duplicar.');
        return;
      }
      await createMut.mutateAsync({ type: formType, title: formTitle, content: formContent });
      toast.success('Item agregado');
      setFormContent('');
      setFormTitle('');
      setPendingImages([]);
      setDuplicateError('');
    }
  };

  const startEdit = (item: any) => {
    setEditItem(item);
    setFormType(item.type);
    setFormTitle(item.title || '');
    setFormContent(item.content || '');
    setShowForm(true);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditItem(null);
    setFormType('video');
    setFormTitle('');
    setFormContent('');
  };

  return (
    <div className="card-glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-bold" style={{ color: '#a78bfa' }}>Presentación del Login</h3>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Gestiona imágenes, videos de YouTube y textos que se mostrarán en la página de login.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)' }}
          >
            <Plus className="h-3.5 w-3.5" /> Agregar
          </button>
        )}
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="rounded-xl p-4 mb-4" tabIndex={-1} style={{ background: duplicateError ? 'rgba(239,68,68,0.05)' : 'rgba(255,255,255,0.03)', border: duplicateError ? '2px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.08)', outline: 'none' }}
          onPaste={async (e) => {
            if (formType !== 'image') return;
            const clipItems = e.clipboardData?.items;
            if (!clipItems) return;
            for (let i = 0; i < clipItems.length; i++) {
              if (clipItems[i].type.startsWith('image/')) {
                e.preventDefault();
                const file = clipItems[i].getAsFile();
                if (!file) return;
                if (file.size > 5 * 1024 * 1024) { toast.error('Imagen máx 5 MB'); return; }
                const data = await new Promise<string>((resolve) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result as string);
                  reader.readAsDataURL(file);
                });
                setPendingImages(prev => [...prev, data]);
                toast.success('Imagen pegada — haz click en Agregar para guardar');
                return;
              }
            }
          }}
        >
          {duplicateError && (
            <div className="mb-3 px-3 py-2 rounded-lg text-xs font-medium" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
              {duplicateError}
            </div>
          )}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>Tipo:</span>
            {(['video', 'image', 'text'] as const).map(t => (
              <button
                key={t}
                onClick={() => { setFormType(t); setFormContent(''); }}
                className="px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1"
                style={{
                  background: formType === t ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.05)',
                  color: formType === t ? '#a78bfa' : 'rgba(255,255,255,0.5)',
                  border: formType === t ? '1px solid rgba(167,139,250,0.3)' : '1px solid transparent',
                }}
              >
                {t === 'image' && <ImageIcon className="h-3 w-3" />}
                {t === 'video' && <Video className="h-3 w-3" />}
                {t === 'text' && <Type className="h-3 w-3" />}
                {t === 'video' ? 'Video' : t === 'image' ? 'Imagen' : 'Texto'}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={formTitle}
            onChange={e => setFormTitle(e.target.value)}
            placeholder="Título (opcional)"
            className="w-full rounded-lg px-3 py-2 text-sm mb-2"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
          />

          {formType === 'image' && (
            <div>
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}
                >
                  <Upload className="h-3.5 w-3.5" /> Subir imagen(es) (máx 5 MB c/u)
                </button>
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>o pega con Ctrl+V</span>
              </div>
              {pendingImages.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {pendingImages.map((img, idx) => (
                    <div key={idx} className="relative">
                      <img src={img} alt={`preview ${idx + 1}`} className="w-20 h-14 object-cover rounded-lg" />
                      <button
                        onClick={() => setPendingImages(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[10px]"
                        style={{ background: '#ef4444', color: '#fff' }}
                      >×</button>
                    </div>
                  ))}
                  <p className="w-full text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{pendingImages.length} imagen(es) lista(s) — haz click en "Agregar" para guardar</p>
                </div>
              )}
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>O pega una URL de imagen:</p>
              <input
                type="text"
                value={formContent.startsWith('data:') ? '' : formContent}
                onChange={e => setFormContent(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-lg px-3 py-2 text-sm mt-1"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                onPaste={async (e) => {
                  const clipItems = e.clipboardData?.items;
                  if (!clipItems) return;
                  for (let i = 0; i < clipItems.length; i++) {
                    if (clipItems[i].type.startsWith('image/')) {
                      e.preventDefault();
                      const file = clipItems[i].getAsFile();
                      if (!file) return;
                      if (file.size > 5 * 1024 * 1024) { toast.error('Imagen máx 5 MB'); return; }
                      const data = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result as string);
                        reader.readAsDataURL(file);
                      });
                      setPendingImages(prev => [...prev, data]);
                      toast.success('Imagen pegada — haz click en Agregar para guardar');
                      return;
                    }
                  }
                }}
              />
            </div>
          )}

          {formType === 'video' && (
            <div>
              <textarea
                value={formContent}
                onChange={e => setFormContent(e.target.value)}
                placeholder="Pega links de YouTube (uno por línea para subir múltiples)&#10;https://www.youtube.com/watch?v=XXXXX&#10;https://www.youtube.com/watch?v=YYYYY"
                rows={3}
                className="w-full rounded-lg px-3 py-2 text-sm resize-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
              />
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Pega uno o varios links de YouTube (uno por línea). Se subirán todos al hacer clic en Agregar.</p>
              {formContent && extractYoutubeId(formContent.split('\n')[0]) && (
                <div className="mt-2 rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                  <img
                    src={`https://img.youtube.com/vi/${extractYoutubeId(formContent.split('\n')[0])}/mqdefault.jpg`}
                    alt="Preview"
                    className="w-full h-28 object-cover"
                  />
                  <p className="text-xs px-2 py-1" style={{ color: 'rgba(255,255,255,0.4)', background: 'rgba(0,0,0,0.3)' }}>
                    ✓ {formContent.split('\n').filter(l => extractYoutubeId(l.trim())).length} video(s) detectado(s)
                  </p>
                </div>
              )}
            </div>
          )}

          {formType === 'text' && (
            <textarea
              value={formContent}
              onChange={e => setFormContent(e.target.value)}
              placeholder="Escribe tu texto aquí... (HTML básico permitido: <b>, <i>, <br>)"
              rows={4}
              className="w-full rounded-lg px-3 py-2 text-sm resize-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
            />
          )}

          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={handleSubmit}
              disabled={createMut.isPending || updateMut.isPending}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all hover:scale-[1.02]"
              style={{ background: 'linear-gradient(135deg, #7bf1d6, #34d399)', color: '#000', boxShadow: '0 2px 8px rgba(123,241,214,0.25)' }}
            >
              <Save className="h-3.5 w-3.5" /> {editItem ? 'Guardar cambios' : 'Agregar'}
            </button>
            <button
              onClick={resetForm}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-all hover:bg-white/5"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <X className="h-3.5 w-3.5" /> Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Items History — ALWAYS visible */}
      {items.length === 0 && (
        <div className="text-center py-8">
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No hay contenido de presentación todavía.</p>
          <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>Agrega imágenes, videos o textos para mostrar en el login.</p>
        </div>
      )}

      {finalItems.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Contenido cargado ({finalItems.length} item{finalItems.length !== 1 ? 's' : ''}) — texto primero, luego recientes
          </p>
          <div className="space-y-2">
            {finalItems.map((item: any) => {
              const ytId = item.type === 'video' ? extractYoutubeId(item.content) : null;
              return (
                <div key={item.id} className="flex items-center gap-3 rounded-xl p-3 group" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  {/* Preview thumbnail */}
                  <div className="w-20 h-14 flex-shrink-0 rounded-lg overflow-hidden" style={{ background: 'rgba(0,0,0,0.3)' }}>
                    {item.type === 'image' && <img src={item.content} alt="" className="w-full h-full object-cover" />}
                    {item.type === 'video' && ytId && <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt="" className="w-full h-full object-cover" />}
                    {item.type === 'video' && !ytId && <div className="w-full h-full flex items-center justify-center"><Video className="h-5 w-5" style={{ color: '#ef4444' }} /></div>}
                    {item.type === 'text' && <div className="w-full h-full flex items-center justify-center"><Type className="h-5 w-5" style={{ color: '#60a5fa' }} /></div>}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: '#fff' }}>{item.title || '(Sin título)'}</p>
                    <p className="text-[10px] truncate mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      {item.type === 'video' ? `Video: ${item.content.slice(0, 50)}` : item.type === 'image' ? 'Imagen' : `Texto: ${item.content.replace(/<[^>]*>/g, '').slice(0, 50)}`}
                    </p>
                    <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-medium" style={{
                      background: item.type === 'video' ? 'rgba(239,68,68,0.15)' : item.type === 'image' ? 'rgba(34,197,94,0.15)' : 'rgba(96,165,250,0.15)',
                      color: item.type === 'video' ? '#f87171' : item.type === 'image' ? '#4ade80' : '#60a5fa',
                    }}>
                      {item.type === 'video' ? 'VIDEO' : item.type === 'image' ? 'IMAGEN' : 'TEXTO'}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button onClick={() => startEdit(item)} className="p-1.5 rounded-lg transition-all hover:bg-white/5" title="Editar">
                      <Pencil className="h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.4)' }} />
                    </button>
                    <button
                      onClick={() => { if (confirm('¿Eliminar este item?')) deleteMut.mutate({ id: item.id }); }}
                      className="p-1.5 rounded-lg transition-all hover:bg-red-500/10"
                      title="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5" style={{ color: '#ef4444' }} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function extractYoutubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}
