import React, { useRef, useState } from 'react';
import { Swords, Skull, Flag, Plus, Trash2, Image as ImageIcon, Check, X, AlertCircle, PlayCircle, StopCircle, Upload, ChevronDown, ChevronUp, Archive, Calendar, Package } from 'lucide-react';
import { AppShell } from '../../components/layout/AppShell';
import { trpc } from '../../lib/trpc';
import { toast } from 'sonner';
import type { RaidAccessInfo } from '../../components/RaidProtectedRoute';
import { CATEGORIES, categoryMeta } from '../../lib/category-meta';
import type { ItemCategory } from '../../lib/types';
import EventsGroupedByCycle from './EventsGroupedByCycle';
import RaidDropsTable from './RaidDropsTable';

// Nota: las imágenes de categoría ya no están hardcodeadas. El super admin las
// carga desde /raids/settings → "Iconos por categoría de drop" y el frontend
// las lee vía trpc.raid.categoryIcons.list. Ver CategoryIconsSection.

const MAX_EVIDENCE_BYTES = 3 * 1024 * 1024; // 3 MB

async function fileToDataUrl(file: File): Promise<string> {
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

interface DropItemInput {
  name: string;
  category: string;
  price: string;
  quantity: string;
  imageUrl: string;
}

const emptyDrop = (): DropItemInput => ({
  name: '',
  category: '',
  price: '0',
  quantity: '1',
  imageUrl: '',
});

export default function RaidInventory({ raidAccess }: Props) {
  const utils = trpc.useUtils();
  const bossesQ = trpc.raid.bosses.list.useQuery();
  const clansQ = trpc.raid.clans.list.useQuery();
  const currentCycleQ = trpc.raid.cycles.current.useQuery();
  const cyclesListQ = trpc.raid.cycles.list.useQuery();
  const eventsQ = trpc.raid.events.list.useQuery({});
  const categoryIconsQ = trpc.raid.categoryIcons.list.useQuery();
  // Lista de usuarios elegibles como "Comprador/Cuenta" al vender un drop
  // (solo usuarios con acceso raid: raid_admin, raid_mapper, raid_user).
  const buyersListQ = trpc.raid.buyers.list.useQuery(undefined, { staleTime: 30_000 });

  // Mapa categoría → imageUrl (seteado por super admin en /raids/settings).
  const categoryIconMap: Record<string, string> = {};
  (categoryIconsQ.data || []).forEach((r: any) => {
    categoryIconMap[String(r.category).toUpperCase()] = r.imageUrl;
  });

  const canInteract = !!raidAccess?.canInteract;
  const canAdmin = !!raidAccess?.canAdmin;

  const openCycle = trpc.raid.cycles.open.useMutation({
    onSuccess: () => {
      toast.success('Ciclo de raid abierto');
      utils.raid.cycles.current.invalidate();
      utils.raid.cycles.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const closeCycle = trpc.raid.cycles.close.useMutation({
    onSuccess: () => {
      toast.success('Ciclo de raid cerrado');
      utils.raid.cycles.current.invalidate();
      utils.raid.cycles.list.invalidate();
      utils.raid.dashboard.invalidate();
      utils.raid.events.list.invalidate();
      utils.raid.clans.stats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const createEvent = trpc.raid.events.create.useMutation({
    onSuccess: () => {
      toast.success('Evento de raid registrado');
      resetForm();
      utils.raid.events.list.invalidate();
      utils.raid.dashboard.invalidate();
      utils.raid.clans.stats.invalidate();
      // Al crear un evento se registran drops dentro del rango del sales cycle
      // abierto (si existe), por lo que el potential remanente cambia.
      utils.raid.salesCycles.livePreview.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteEvent = trpc.raid.events.delete.useMutation({
    onSuccess: () => {
      toast.success('Evento eliminado');
      utils.raid.events.list.invalidate();
      utils.raid.dashboard.invalidate();
      // Borrar un evento cambia eventsParticipated y dropItemsAssociated
      // de los clanes que estaban asociados.
      utils.raid.clans.stats.invalidate();
      utils.raid.salesCycles.livePreview.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const sellDrop = trpc.raid.drops.sell.useMutation({
    onSuccess: () => {
      toast.success('Drop vendido — ganancias distribuidas a los clanes');
      utils.raid.events.list.invalidate();
      utils.raid.dashboard.invalidate();
      utils.raid.clans.stats.invalidate();
      utils.raid.salesCycles.livePreview.invalidate();
      utils.raid.salesCycles.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const bosses = bossesQ.data || [];
  const clans = clansQ.data || [];
  const currentCycle = currentCycleQ.data;
  const events = eventsQ.data || [];

  // Form state
  const [raidBossId, setRaidBossId] = useState<number | null>(null);
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [evidenceUploading, setEvidenceUploading] = useState(false);
  const evidenceFileRef = useRef<HTMLInputElement | null>(null);
  const [notes, setNotes] = useState('');
  const [selectedClanIds, setSelectedClanIds] = useState<number[]>([]);
  const [drops, setDrops] = useState<DropItemInput[]>([emptyDrop()]);

  const handleEvidenceFile = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('El archivo debe ser una imagen');
      return;
    }
    if (file.size > MAX_EVIDENCE_BYTES) {
      toast.error(`La imagen no puede superar los ${Math.round(MAX_EVIDENCE_BYTES / (1024 * 1024))} MB`);
      return;
    }
    setEvidenceUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      setEvidenceUrl(dataUrl);
    } catch (err) {
      toast.error('No se pudo leer el archivo');
    } finally {
      setEvidenceUploading(false);
    }
  };

  const resetForm = () => {
    setRaidBossId(null);
    setEvidenceUrl('');
    if (evidenceFileRef.current) evidenceFileRef.current.value = '';
    setNotes('');
    setSelectedClanIds([]);
    setDrops([emptyDrop()]);
  };

  const toggleClan = (id: number) => {
    setSelectedClanIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const updateDrop = (idx: number, key: keyof DropItemInput, value: string) => {
    setDrops((prev) =>
      prev.map((d, i) => {
        if (i !== idx) return d;
        const next = { ...d, [key]: value };
        // Al elegir categoría, la imagen del drop se setea SIEMPRE al icono
        // configurado por el super admin para esa categoría. El mapper no
        // puede editarla manualmente.
        if (key === 'category') {
          next.imageUrl = categoryIconMap[String(value).toUpperCase()] || '';
        }
        return next;
      })
    );
  };

  const addDrop = () => setDrops((prev) => [...prev, emptyDrop()]);
  const removeDrop = (idx: number) =>
    setDrops((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));

  // Modal de confirmación — se abre cuando los datos pasan validación
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Modal de confirmación de cierre de ciclo
  const [closeCycleOpen, setCloseCycleOpen] = useState(false);
  // Modal de confirmación para eliminar un evento de raid (reemplaza confirm() nativo)
  const [deleteEventTarget, setDeleteEventTarget] = useState<any | null>(null);
  // Tab activa: 'register' (form + ciclo + eventos) | 'drops' (tabla consolidada)
  const [tab, setTab] = useState<'register' | 'drops'>('register');

  // Validación del form. Retorna los drops válidos si todo está OK, o null si
  // faltan datos (y ya mostró el toast correspondiente).
  const validateForm = (): DropItemInput[] | null => {
    if (!currentCycle) {
      toast.error('No hay ciclo de raid abierto. Abrí uno arriba para continuar.');
      return null;
    }
    if (!raidBossId) {
      toast.error('Seleccioná el Raid Boss eliminado');
      return null;
    }
    if (selectedClanIds.length === 0) {
      toast.error('Seleccioná al menos un clan asociado');
      return null;
    }
    const validDrops = drops.filter((d) => d.name.trim());
    if (validDrops.length === 0) {
      toast.error('Registrá al menos un item dropeado');
      return null;
    }
    for (const d of validDrops) {
      if (!d.category.trim()) {
        toast.error(`Falta la categoría del item "${d.name}"`);
        return null;
      }
    }
    return validDrops;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const valid = validateForm();
    if (!valid) return;
    // En vez de enviar, abrimos modal de confirmación.
    setConfirmOpen(true);
  };

  const confirmAndSubmit = () => {
    const validDrops = validateForm();
    if (!validDrops) {
      setConfirmOpen(false);
      return;
    }
    createEvent.mutate(
      {
        raidBossId: raidBossId as number,
        evidenceImageUrl: evidenceUrl.trim() || null,
        notes: notes.trim() || null,
        clanIds: selectedClanIds,
        dropItems: validDrops.map((d) => ({
          name: d.name.trim(),
          category: d.category.trim(),
          price: Number(d.price) || 0,
          quantity: parseInt(d.quantity) || 1,
          imageUrl: d.imageUrl.trim() || null,
        })),
      },
      {
        onSuccess: () => setConfirmOpen(false),
      }
    );
  };

  return (
    <AppShell>
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Swords className="h-5 w-5" style={{ color: '#e879f9' }} />
          <h2 className="text-2xl font-bold text-gradient">Raid Inventario</h2>
        </div>
        <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Registrá los raid bosses eliminados, la evidencia, los clanes participantes y los
          items que dropearon (1 o varios). Todo queda asociado al ciclo de raid activo.
        </p>
      </div>

      {/* Ciclo actual — ahora vive aquí, integrado con el flujo de registro */}
      <div className="card-glass rounded-2xl p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <PlayCircle className="h-5 w-5" style={{ color: currentCycle ? '#10b981' : '#fbbf24' }} />
            <h3 className="text-base font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>
              Ciclo actual
            </h3>
          </div>
          {currentCycle && (
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={{
                background: 'rgba(16,185,129,0.12)',
                color: '#10b981',
                border: '1px solid rgba(16,185,129,0.25)',
              }}
            >
              {currentCycle.type} · ABIERTO
            </span>
          )}
        </div>

        {currentCycle ? (
          <div className="space-y-4">
            <div
              className="grid gap-3 sm:grid-cols-4 rounded-xl p-4"
              style={{
                background:
                  'linear-gradient(135deg, rgba(123,241,214,0.08), rgba(232,121,249,0.08))',
                border: '1px solid rgba(123,241,214,0.2)',
              }}
            >
              <div>
                <p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Nombre
                </p>
                <p className="text-base font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>
                  {currentCycle.label}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Iniciado
                </p>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.9)' }}>
                  {new Date(currentCycle.startedAt).toLocaleString('es-CL')}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Estado
                </p>
                <p className="text-sm font-semibold" style={{ color: '#10b981' }}>
                  ABIERTO
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  ID
                </p>
                <p className="text-sm font-mono" style={{ color: 'rgba(255,255,255,0.9)' }}>
                  #{currentCycle.id}
                </p>
              </div>
            </div>

            {canAdmin && (
              <button
                onClick={() => setCloseCycleOpen(true)}
                disabled={closeCycle.isPending}
                className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(232,121,249,0.25), rgba(239,68,68,0.25))',
                  border: '1px solid rgba(232,121,249,0.3)',
                  color: '#e879f9',
                }}
              >
                <StopCircle className="h-4 w-4" />
                {closeCycle.isPending ? 'Cerrando…' : 'Cerrar Ciclo de Raids'}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div
              className="rounded-xl p-4 flex items-start gap-3"
              style={{
                background: 'rgba(251,191,36,0.05)',
                border: '1px solid rgba(251,191,36,0.2)',
              }}
            >
              <AlertCircle className="h-5 w-5 shrink-0" style={{ color: '#fbbf24' }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: '#fbbf24' }}>
                  No hay ciclo abierto
                </p>
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  Sin ciclo abierto no podés registrar raid bosses. Abrí uno para comenzar.
                </p>
              </div>
            </div>

            {canAdmin && (
              <button
                onClick={() => openCycle.mutate({ type: 'DIARIO' })}
                disabled={openCycle.isPending}
                className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(123,241,214,0.25), rgba(16,185,129,0.25))',
                  border: '1px solid rgba(123,241,214,0.3)',
                  color: '#7bf1d6',
                }}
              >
                <PlayCircle className="h-4 w-4" />
                {openCycle.isPending ? 'Abriendo…' : 'Abrir Ciclo Diario'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs: Registrar | Tabla de Drops */}
      <div
        className="flex items-center gap-1 mb-5 rounded-xl p-1"
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <button
          type="button"
          onClick={() => setTab('register')}
          className="flex-1 rounded-lg px-3 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-all"
          style={{
            background:
              tab === 'register'
                ? 'linear-gradient(135deg, rgba(232,121,249,0.25), rgba(167,139,250,0.25))'
                : 'transparent',
            color: tab === 'register' ? '#e879f9' : 'rgba(255,255,255,0.55)',
            border:
              tab === 'register' ? '1px solid rgba(232,121,249,0.25)' : '1px solid transparent',
          }}
        >
          <Plus className="h-4 w-4" />
          Registrar evento
        </button>
        <button
          type="button"
          onClick={() => setTab('drops')}
          className="flex-1 rounded-lg px-3 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-all"
          style={{
            background:
              tab === 'drops'
                ? 'linear-gradient(135deg, rgba(167,139,250,0.25), rgba(123,241,214,0.25))'
                : 'transparent',
            color: tab === 'drops' ? '#a78bfa' : 'rgba(255,255,255,0.55)',
            border:
              tab === 'drops' ? '1px solid rgba(167,139,250,0.25)' : '1px solid transparent',
          }}
        >
          <Package className="h-4 w-4" />
          Drops disponibles
        </button>
      </div>

      {tab === 'drops' && <RaidDropsTable raidAccess={raidAccess} />}

      {tab === 'register' && canInteract && currentCycle && (
        <div className="card-glass rounded-2xl p-5 mb-5">
          <div className="flex items-center gap-2 mb-4">
            <Plus className="h-4 w-4" style={{ color: '#7bf1d6' }} />
            <h3 className="text-base font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>
              Registrar nuevo evento de raid
            </h3>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Boss */}
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Raid Boss eliminado *
                </label>
                <select
                  value={raidBossId || ''}
                  onChange={(e) =>
                    setRaidBossId(e.target.value ? Number(e.target.value) : null)
                  }
                  className="w-full rounded-xl px-3 py-2 text-sm"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.9)',
                  }}
                >
                  <option value="">-- seleccioná un boss --</option>
                  {bosses.map((b: any) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                      {b.level ? ` (Lv ${b.level})` : ''}
                    </option>
                  ))}
                </select>
                {bosses.length === 0 && (
                  <p
                    className="text-xs mt-1"
                    style={{ color: 'rgba(251,191,36,0.8)' }}
                  >
                    No hay bosses cargados. Super Admin debe crearlos en Config. Raids.
                  </p>
                )}
                {raidBossId && (
                  <div
                    className="mt-2 rounded-xl p-2 flex items-center gap-2"
                    style={{
                      background: 'rgba(232,121,249,0.05)',
                      border: '1px solid rgba(232,121,249,0.15)',
                    }}
                  >
                    {bosses.find((b: any) => Number(b.id) === raidBossId)
                      ?.officialImageUrl ? (
                      <img
                        src={
                          bosses.find((b: any) => Number(b.id) === raidBossId)!
                            .officialImageUrl
                        }
                        alt=""
                        className="h-10 w-10 rounded-lg object-cover"
                      />
                    ) : (
                      <div
                        className="h-10 w-10 rounded-lg flex items-center justify-center"
                        style={{
                          background: 'rgba(232,121,249,0.1)',
                          border: '1px solid rgba(232,121,249,0.25)',
                        }}
                      >
                        <Skull className="h-5 w-5" style={{ color: '#e879f9' }} />
                      </div>
                    )}
                    <div>
                      <p
                        className="text-sm font-medium"
                        style={{ color: 'rgba(255,255,255,0.9)' }}
                      >
                        {bosses.find((b: any) => Number(b.id) === raidBossId)?.name}
                      </p>
                      <p
                        className="text-xs"
                        style={{ color: 'rgba(255,255,255,0.4)' }}
                      >
                        Boss seleccionado para el registro
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Evidencia — ahora por carga manual de archivo */}
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Imagen de evidencia *
                </label>
                <input
                  ref={evidenceFileRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleEvidenceFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => evidenceFileRef.current?.click()}
                  disabled={evidenceUploading}
                  className="w-full rounded-xl px-3 py-2 text-xs flex items-center justify-center gap-2 transition-all"
                  style={{
                    background: evidenceUrl
                      ? 'rgba(123,241,214,0.08)'
                      : 'rgba(255,255,255,0.03)',
                    border: `1px dashed ${evidenceUrl ? 'rgba(123,241,214,0.3)' : 'rgba(255,255,255,0.15)'}`,
                    color: evidenceUrl ? '#7bf1d6' : 'rgba(255,255,255,0.6)',
                  }}
                >
                  <Upload className="h-3.5 w-3.5" />
                  {evidenceUploading
                    ? 'Cargando…'
                    : evidenceUrl
                    ? 'Cambiar imagen de evidencia'
                    : 'Subir imagen de evidencia (JPG/PNG)'}
                </button>
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  Máx. {Math.round(MAX_EVIDENCE_BYTES / (1024 * 1024))} MB. La imagen se guarda inline en el evento.
                </p>
                {evidenceUrl && (
                  <div className="mt-2 relative inline-block">
                    <img
                      src={evidenceUrl}
                      alt="evidencia"
                      className="rounded-xl max-h-32"
                      style={{ border: '1px solid rgba(255,255,255,0.08)' }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setEvidenceUrl('');
                        if (evidenceFileRef.current) evidenceFileRef.current.value = '';
                      }}
                      className="absolute -top-2 -right-2 rounded-full h-6 w-6 flex items-center justify-center"
                      style={{
                        background: 'rgba(239,68,68,0.9)',
                        color: 'white',
                      }}
                      aria-label="Quitar evidencia"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Notas */}
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Notas (opcional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Cualquier nota sobre el raid..."
                className="w-full rounded-xl px-3 py-2 text-sm"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.9)',
                }}
              />
            </div>

            {/* Clanes asociados */}
            <div>
              <label className="text-xs mb-2 block" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Clanes asociados * ({selectedClanIds.length} seleccionados)
              </label>
              <div className="flex flex-wrap gap-2">
                {clans.length === 0 && (
                  <p className="text-xs" style={{ color: 'rgba(251,191,36,0.8)' }}>
                    No hay clanes cargados. Creá algunos en Config. Raids.
                  </p>
                )}
                {clans.map((c: any) => {
                  const active = selectedClanIds.includes(Number(c.id));
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleClan(Number(c.id))}
                      className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all"
                      style={{
                        background: active
                          ? 'rgba(123,241,214,0.15)'
                          : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${active ? 'rgba(123,241,214,0.3)' : 'rgba(255,255,255,0.08)'}`,
                        color: active ? '#7bf1d6' : 'rgba(255,255,255,0.7)',
                      }}
                    >
                      <Flag className="h-3 w-3" />
                      {c.name}
                      {active && <Check className="h-3 w-3" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Items dropeados */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs block" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Items que dropearon * ({drops.filter((d) => d.name.trim()).length})
                </label>
                <button
                  type="button"
                  onClick={addDrop}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition-all"
                  style={{
                    background: 'rgba(167,139,250,0.1)',
                    border: '1px solid rgba(167,139,250,0.25)',
                    color: '#a78bfa',
                  }}
                >
                  <Plus className="h-3 w-3" /> Añadir item
                </button>
              </div>

              <div className="space-y-3">
                {drops.map((d, idx) => {
                  const catOk = d.category && CATEGORIES.includes(d.category as ItemCategory);
                  return (
                    <div
                      key={idx}
                      className="rounded-xl p-3"
                      style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.7)' }}>
                          Item #{idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeDrop(idx)}
                          disabled={drops.length <= 1}
                          className="rounded-lg px-2 py-1 text-xs transition-all flex items-center gap-1"
                          style={{
                            background: 'rgba(255,120,120,0.05)',
                            border: '1px solid rgba(255,120,120,0.15)',
                            color: 'rgba(255,120,120,0.7)',
                            opacity: drops.length <= 1 ? 0.3 : 1,
                          }}
                        >
                          <Trash2 className="h-3 w-3" /> quitar
                        </button>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-12">
                        {/* Nombre */}
                        <div className="sm:col-span-4">
                          <label
                            className="mb-1 block text-xs font-medium"
                            style={{ color: 'rgba(255,255,255,0.55)' }}
                          >
                            Nombre del item <span style={{ color: '#f87171' }}>*</span>
                          </label>
                          <input
                            type="text"
                            value={d.name}
                            onChange={(e) => updateDrop(idx, 'name', e.target.value)}
                            placeholder="Ej: Dynasty Leather"
                            className="w-full rounded-lg px-2 py-1.5 text-xs"
                            style={{
                              background: 'rgba(255,255,255,0.03)',
                              border: '1px solid rgba(255,255,255,0.08)',
                              color: 'rgba(255,255,255,0.9)',
                            }}
                          />
                        </div>

                        {/* Categoría */}
                        <div className="sm:col-span-3">
                          <label
                            className="mb-1 block text-xs font-medium"
                            style={{ color: 'rgba(255,255,255,0.55)' }}
                          >
                            Categoría <span style={{ color: '#f87171' }}>*</span>
                          </label>
                          <select
                            value={catOk ? d.category : ''}
                            onChange={(e) => updateDrop(idx, 'category', e.target.value)}
                            className="select-dark w-full rounded-lg px-2 py-1.5 text-xs"
                            style={{
                              background: 'rgba(255,255,255,0.03)',
                              border: '1px solid rgba(255,255,255,0.08)',
                              color: 'rgba(255,255,255,0.9)',
                            }}
                          >
                            <option value="" className="bg-[#0a0e16]">-- Seleccionar --</option>
                            {CATEGORIES.map((cat) => {
                              const meta = categoryMeta[cat] || { emoji: '📦', label: cat };
                              return (
                                <option key={cat} value={cat} className="bg-[#0a0e16]">
                                  {meta.emoji} {meta.label}
                                </option>
                              );
                            })}
                          </select>
                        </div>

                        {/* Precio */}
                        <div className="sm:col-span-2">
                          <label
                            className="mb-1 block text-xs font-medium"
                            style={{ color: 'rgba(255,255,255,0.55)' }}
                          >
                            Precio (Adena)
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={d.price}
                            onChange={(e) => updateDrop(idx, 'price', e.target.value)}
                            placeholder="0"
                            className="w-full rounded-lg px-2 py-1.5 text-xs"
                            style={{
                              background: 'rgba(255,255,255,0.03)',
                              border: '1px solid rgba(255,255,255,0.08)',
                              color: 'rgba(255,255,255,0.9)',
                            }}
                          />
                        </div>

                        {/* Cantidad */}
                        <div className="sm:col-span-1">
                          <label
                            className="mb-1 block text-xs font-medium"
                            style={{ color: 'rgba(255,255,255,0.55)' }}
                          >
                            Cant. *
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={d.quantity}
                            onChange={(e) => updateDrop(idx, 'quantity', e.target.value)}
                            placeholder="1"
                            className="w-full rounded-lg px-2 py-1.5 text-xs"
                            style={{
                              background: 'rgba(255,255,255,0.03)',
                              border: '1px solid rgba(255,255,255,0.08)',
                              color: 'rgba(255,255,255,0.9)',
                            }}
                          />
                        </div>

                        {/* Imagen (solo preview - se asigna automáticamente por categoría) */}
                        <div className="sm:col-span-2">
                          <label
                            className="mb-1 block text-xs font-medium"
                            style={{ color: 'rgba(255,255,255,0.55)' }}
                          >
                            Imagen
                          </label>
                          <div
                            className="h-9 rounded-lg overflow-hidden flex items-center justify-center px-2 gap-2"
                            style={{
                              background: 'rgba(255,255,255,0.03)',
                              border: '1px dashed rgba(255,255,255,0.08)',
                            }}
                            title={
                              d.imageUrl
                                ? 'Asignada automáticamente por categoría'
                                : 'Elegí una categoría para asignar el icono'
                            }
                          >
                            {d.imageUrl ? (
                              <>
                                <img
                                  src={d.imageUrl}
                                  alt=""
                                  className="h-7 w-7 rounded object-cover shrink-0"
                                />
                                <span className="text-[10px] truncate" style={{ color: 'rgba(255,255,255,0.5)' }}>
                                  auto · {catOk ? d.category : ''}
                                </span>
                              </>
                            ) : (
                              <>
                                <ImageIcon
                                  className="h-4 w-4 shrink-0"
                                  style={{ color: 'rgba(255,255,255,0.25)' }}
                                />
                                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                  elegí categoría
                                </span>
                              </>
                            )}
                          </div>
                          {catOk && !d.imageUrl && (
                            <p className="text-[10px] mt-1" style={{ color: '#f59e0b' }}>
                              El super admin no configuró icono para esta categoría.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={createEvent.isPending}
              className="w-full rounded-xl px-4 py-3 text-sm font-semibold transition-all"
              style={{
                background:
                  'linear-gradient(135deg, rgba(232,121,249,0.3), rgba(167,139,250,0.3))',
                border: '1px solid rgba(232,121,249,0.4)',
                color: '#e879f9',
              }}
            >
              {createEvent.isPending ? 'Registrando…' : 'Registrar evento de raid'}
            </button>
          </form>
        </div>
      )}

      {/* Listado de eventos del ciclo actual */}
      {tab === 'register' && (
      <div className="card-glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>
            Eventos registrados
          </h3>
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {events.length} total
          </span>
        </div>

        {events.length === 0 ? (
          <p
            className="text-xs text-center py-6"
            style={{ color: 'rgba(255,255,255,0.3)' }}
          >
            Aún no hay eventos registrados. Registrá el primero arriba.
          </p>
        ) : (
          <EventsGroupedByCycle
            events={events}
            cycles={cyclesListQ.data || []}
            renderEvent={(e: any) => (
              <EventCard
                key={e.id}
                event={e}
                canInteract={canInteract}
                canAdmin={!!raidAccess?.canAdmin}
                onDelete={() => setDeleteEventTarget(e)}
                buyers={(buyersListQ.data as any[]) || []}
                onSellDrop={(dropId, qty, buyerId, buyerName) => {
                  sellDrop.mutate({
                    id: dropId,
                    quantity: qty,
                    buyerId,
                    buyerName,
                  });
                }}
              />
            )}
          />
        )}
      </div>
      )}

      {/* Modal de confirmación de cierre de ciclo */}
      {closeCycleOpen && currentCycle && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => {
            if (!closeCycle.isPending) setCloseCycleOpen(false);
          }}
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
                  <StopCircle className="h-5 w-5" style={{ color: '#ef4444' }} />
                  <h3 className="text-lg font-bold" style={{ color: 'rgba(255,255,255,0.95)' }}>
                    Cerrar ciclo de raids
                  </h3>
                </div>
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  Esta acción consolida el resumen y resetea el contador de ganancias. No se puede deshacer.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCloseCycleOpen(false)}
                disabled={closeCycle.isPending}
                className="rounded-lg p-1.5 transition-all"
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
              className="rounded-xl p-3 mb-4"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Ciclo actual
              </div>
              <div className="font-semibold mt-0.5" style={{ color: '#7bf1d6' }}>
                {currentCycle.label}
              </div>
              <div className="text-[11px] font-mono mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                #{currentCycle.id}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCloseCycleOpen(false)}
                disabled={closeCycle.isPending}
                className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
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
                onClick={() => {
                  closeCycle.mutate(
                    { cycleId: Number(currentCycle.id) },
                    { onSuccess: () => setCloseCycleOpen(false) }
                  );
                }}
                disabled={closeCycle.isPending}
                className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all flex items-center justify-center gap-2"
                style={{
                  background: 'linear-gradient(90deg, rgba(239,68,68,0.9), rgba(232,121,249,0.9))',
                  border: '1px solid rgba(239,68,68,0.5)',
                  color: '#fff',
                  opacity: closeCycle.isPending ? 0.6 : 1,
                }}
              >
                <StopCircle className="h-4 w-4" />
                {closeCycle.isPending ? 'Cerrando…' : 'Sí, cerrar ciclo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación para eliminar un evento de raid. Reemplaza al
          confirm() nativo con un modal estilizado, en línea con los otros
          modales del módulo (cerrar ciclo, eliminar drop). Defensivamente
          también bloquea la acción si el evento tiene drops con ventas —
          aunque el botón de EventCard ya está deshabilitado en ese caso. */}
      {deleteEventTarget && (() => {
        const targetDrops = deleteEventTarget.dropItems || [];
        const soldInTarget = targetDrops.filter(
          (d: any) => Number(d.quantitySold) > 0
        );
        const blockedByHistory = soldInTarget.length > 0;
        return (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => {
            if (!deleteEvent.isPending) setDeleteEventTarget(null);
          }}
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
                  <h3
                    className="text-lg font-bold"
                    style={{ color: 'rgba(255,255,255,0.95)' }}
                  >
                    Eliminar evento de raid
                  </h3>
                </div>
                <p
                  className="text-xs mt-1"
                  style={{ color: 'rgba(255,255,255,0.45)' }}
                >
                  {blockedByHistory
                    ? 'Este evento tiene drops con ventas registradas. No se puede eliminar para proteger el histórico de reparto de adena.'
                    : 'Se eliminarán el evento, sus drops asociados y la evidencia. Esta acción no se puede deshacer.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeleteEventTarget(null)}
                disabled={deleteEvent.isPending}
                className="rounded-lg p-1.5 transition-all"
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
              {deleteEventTarget.bossImageUrl ? (
                <img
                  src={deleteEventTarget.bossImageUrl}
                  alt={deleteEventTarget.bossName || ''}
                  className="h-12 w-12 shrink-0 rounded-lg object-cover"
                  style={{ border: '1px solid rgba(239,68,68,0.3)' }}
                />
              ) : (
                <div
                  className="h-12 w-12 shrink-0 rounded-lg flex items-center justify-center"
                  style={{
                    background: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.25)',
                  }}
                >
                  <Skull className="h-5 w-5" style={{ color: '#ef4444' }} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div
                  className="font-semibold truncate"
                  style={{ color: 'rgba(255,255,255,0.92)' }}
                >
                  {deleteEventTarget.bossName ||
                    `Evento #${deleteEventTarget.id}`}
                </div>
                <div
                  className="text-[11px] mt-0.5"
                  style={{ color: 'rgba(255,255,255,0.4)' }}
                >
                  #{deleteEventTarget.id}
                  {deleteEventTarget.createdAt && (
                    <>
                      {' · '}
                      {new Date(deleteEventTarget.createdAt).toLocaleString(
                        'es-AR'
                      )}
                    </>
                  )}
                </div>
                {(deleteEventTarget.dropsCount != null ||
                  (deleteEventTarget.clans || []).length > 0) && (
                  <div
                    className="text-[11px] mt-1 flex items-center gap-2 flex-wrap"
                    style={{ color: 'rgba(255,255,255,0.5)' }}
                  >
                    {deleteEventTarget.dropsCount != null && (
                      <span>
                        {deleteEventTarget.dropsCount} drop
                        {deleteEventTarget.dropsCount === 1 ? '' : 's'}
                      </span>
                    )}
                    {(deleteEventTarget.clans || []).length > 0 && (
                      <span>
                        {deleteEventTarget.clans.length} clan
                        {deleteEventTarget.clans.length === 1 ? '' : 'es'}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {blockedByHistory && (
              <div
                className="rounded-xl p-3 mb-4 text-xs"
                style={{
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  color: '#fca5a5',
                }}
              >
                <div className="font-semibold mb-1" style={{ color: '#f87171' }}>
                  {soldInTarget.length} drop{soldInTarget.length === 1 ? '' : 's'} con ventas registradas
                </div>
                <ul className="list-disc pl-4 space-y-0.5">
                  {soldInTarget.slice(0, 5).map((d: any) => (
                    <li key={d.id}>
                      {d.name}{' '}
                      <span style={{ color: 'rgba(248,113,113,0.7)' }}>
                        · {d.quantitySold} vendida{d.quantitySold === 1 ? '' : 's'}
                      </span>
                    </li>
                  ))}
                  {soldInTarget.length > 5 && (
                    <li style={{ color: 'rgba(248,113,113,0.7)' }}>
                      … y {soldInTarget.length - 5} más
                    </li>
                  )}
                </ul>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteEventTarget(null)}
                disabled={deleteEvent.isPending}
                className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.75)',
                }}
              >
                {blockedByHistory ? 'Entendido' : 'Cancelar'}
              </button>
              {!blockedByHistory && (
                <button
                  type="button"
                  onClick={() => {
                    deleteEvent.mutate(
                      { id: Number(deleteEventTarget.id) },
                      { onSettled: () => setDeleteEventTarget(null) }
                    );
                  }}
                  disabled={deleteEvent.isPending}
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all flex items-center justify-center gap-2"
                  style={{
                    background:
                      'linear-gradient(90deg, rgba(239,68,68,0.9), rgba(232,121,249,0.9))',
                    border: '1px solid rgba(239,68,68,0.5)',
                    color: '#fff',
                    opacity: deleteEvent.isPending ? 0.6 : 1,
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  {deleteEvent.isPending
                    ? 'Eliminando…'
                    : 'Sí, eliminar evento'}
                </button>
              )}
            </div>
          </div>
        </div>
        );
      })()}

      {/* Modal de confirmación de registro de evento */}
      {confirmOpen && (() => {
        const boss = bosses.find((b: any) => Number(b.id) === raidBossId);
        const selectedClans = clans.filter((c: any) => selectedClanIds.includes(Number(c.id)));
        const previewDrops = drops.filter((d) => d.name.trim());
        const totalAdena = previewDrops.reduce(
          (acc, d) => acc + (Number(d.price) || 0) * (parseInt(d.quantity) || 1),
          0
        );
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
            onClick={() => {
              if (!createEvent.isPending) setConfirmOpen(false);
            }}
          >
            <div
              className="w-full max-w-lg rounded-2xl p-5 max-h-[90vh] overflow-y-auto"
              style={{
                background: 'linear-gradient(180deg, rgba(24,24,40,0.96), rgba(18,18,30,0.96))',
                border: '1px solid rgba(232,121,249,0.25)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5" style={{ color: '#e879f9' }} />
                    <h3 className="text-lg font-bold" style={{ color: 'rgba(255,255,255,0.95)' }}>
                      Confirmar registro de evento
                    </h3>
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    Revisá la información antes de confirmar. Esta acción queda registrada en el ciclo actual.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  disabled={createEvent.isPending}
                  className="rounded-lg p-1.5 transition-all"
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

              <div className="space-y-3 text-sm">
                {/* Boss */}
                <div className="rounded-xl p-3" style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <div className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    Raid Boss
                  </div>
                  <div className="flex items-center gap-2">
                    {boss?.officialImageUrl && (
                      <img src={boss.officialImageUrl} alt="" className="h-8 w-8 rounded object-cover" />
                    )}
                    <div className="font-semibold" style={{ color: '#e879f9' }}>
                      {boss?.name || '—'}
                    </div>
                  </div>
                </div>

                {/* Clanes */}
                <div className="rounded-xl p-3" style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <div className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    Clanes participantes ({selectedClans.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedClans.map((c: any) => (
                      <span
                        key={c.id}
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{
                          background: 'rgba(123,241,214,0.1)',
                          border: '1px solid rgba(123,241,214,0.25)',
                          color: '#7bf1d6',
                        }}
                      >
                        {c.tag ? `${c.tag} ` : ''}{c.name}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Evidencia */}
                <div className="rounded-xl p-3 flex items-center gap-3" style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <div className="text-xs flex-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    Evidencia
                  </div>
                  {evidenceUrl ? (
                    <div className="flex items-center gap-2">
                      <img src={evidenceUrl} alt="" className="h-10 w-10 rounded object-cover" />
                      <span className="text-xs" style={{ color: '#7bf1d6' }}>Cargada</span>
                    </div>
                  ) : (
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      Sin evidencia
                    </span>
                  )}
                </div>

                {/* Drops */}
                <div className="rounded-xl p-3" style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <div className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    Items dropeados ({previewDrops.length})
                  </div>
                  <div className="space-y-1.5">
                    {previewDrops.map((d, i) => {
                      const meta = categoryMeta[d.category] || { emoji: '📦', label: d.category };
                      const subtotal = (Number(d.price) || 0) * (parseInt(d.quantity) || 1);
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-2 text-xs"
                          style={{ color: 'rgba(255,255,255,0.8)' }}
                        >
                          {d.imageUrl && (
                            <img src={d.imageUrl} alt="" className="h-6 w-6 rounded object-cover shrink-0" />
                          )}
                          <span className="flex-1 truncate">
                            <span style={{ color: 'rgba(255,255,255,0.5)' }}>{meta.emoji}</span>{' '}
                            {d.name}
                          </span>
                          <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                            x{parseInt(d.quantity) || 1}
                          </span>
                          <span className="font-semibold" style={{ color: '#fbbf24' }}>
                            {subtotal.toLocaleString()}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div
                    className="mt-2 pt-2 flex justify-between items-center text-xs"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <span style={{ color: 'rgba(255,255,255,0.5)' }}>Valor total estimado</span>
                    <span className="font-bold" style={{ color: '#fbbf24' }}>
                      {totalAdena.toLocaleString()} adena
                    </span>
                  </div>
                </div>

                {notes.trim() && (
                  <div className="rounded-xl p-3" style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <div className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      Notas
                    </div>
                    <div className="text-xs" style={{ color: 'rgba(255,255,255,0.8)' }}>
                      {notes.trim()}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  disabled={createEvent.isPending}
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
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
                  onClick={confirmAndSubmit}
                  disabled={createEvent.isPending}
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all flex items-center justify-center gap-2"
                  style={{
                    background: 'linear-gradient(90deg, rgba(232,121,249,0.9), rgba(167,139,250,0.9))',
                    border: '1px solid rgba(232,121,249,0.5)',
                    color: '#fff',
                    opacity: createEvent.isPending ? 0.6 : 1,
                  }}
                >
                  <Check className="h-4 w-4" />
                  {createEvent.isPending ? 'Registrando…' : 'Confirmar y registrar'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </AppShell>
  );
}

function EventCard({
  event,
  canInteract,
  canAdmin,
  onDelete,
  onSellDrop,
  buyers,
}: {
  event: any;
  canInteract: boolean;
  canAdmin: boolean;
  onDelete: () => void;
  onSellDrop: (id: number, qty: number, buyerId: number, buyerName: string) => void;
  buyers: any[];
}) {
  const [open, setOpen] = useState(false);
  const createdAt = event.createdAt
    ? new Date(event.createdAt).toLocaleString('es-CL')
    : '';
  const drops = event.dropItems || [];
  // Si algún drop del evento ya tiene ventas, no permitimos eliminar el evento
  // porque las métricas de reparto por clan (`raidClanStats`) quedarían
  // huérfanas de su evento de origen. El backend también valida esto.
  const soldDropsCount = drops.reduce(
    (n: number, d: any) => n + (Number(d.quantitySold) > 0 ? 1 : 0),
    0
  );
  const hasSoldDrops = soldDropsCount > 0;
  // Adena del evento: "vendido" crece con cada venta; "potencial" es el sticker
  // price si se vende todo. Se muestra en el header de la tarjeta y sirve para
  // que el operador vea, de un vistazo, cuánta adena lleva cobrada de ese raid.
  const soldRevenue = drops.reduce(
    (acc: number, d: any) => acc + (Number(d.price) || 0) * (Number(d.quantitySold) || 0),
    0
  );
  const potentialRevenue = drops.reduce(
    (acc: number, d: any) => acc + (Number(d.price) || 0) * (Number(d.quantity) || 0),
    0
  );

  return (
    <div
      className="rounded-xl"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 p-3 text-left"
      >
        <div
          className="h-12 w-12 shrink-0 rounded-lg flex items-center justify-center overflow-hidden"
          style={{
            background: 'rgba(232,121,249,0.1)',
            border: '1px solid rgba(232,121,249,0.25)',
          }}
        >
          {event.bossImageUrl ? (
            <img src={event.bossImageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Skull className="h-6 w-6" style={{ color: '#e879f9' }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>
            {event.bossName}
          </p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {createdAt} · {event.clans?.length || 0} clan(es) · {drops.length} drop(s)
          </p>
          <p className="text-xs font-mono mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
            <span style={{ color: '#fbbf24' }}>${soldRevenue.toLocaleString()}</span>
            <span> / ${potentialRevenue.toLocaleString()} adena</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {event.evidenceImageUrl && (
            <a
              href={event.evidenceImageUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(ev) => ev.stopPropagation()}
              className="rounded-lg px-2 py-1 text-xs flex items-center gap-1"
              style={{
                background: 'rgba(123,241,214,0.08)',
                color: '#7bf1d6',
                border: '1px solid rgba(123,241,214,0.25)',
              }}
            >
              <ImageIcon className="h-3 w-3" /> evidencia
            </a>
          )}
          {canAdmin && (
            <button
              type="button"
              onClick={(ev) => {
                ev.stopPropagation();
                if (!hasSoldDrops) onDelete();
              }}
              disabled={hasSoldDrops}
              className="rounded-lg p-1.5 transition-all"
              style={{
                color: hasSoldDrops
                  ? 'rgba(255,255,255,0.25)'
                  : 'rgba(255,120,120,0.7)',
                cursor: hasSoldDrops ? 'not-allowed' : 'pointer',
                opacity: hasSoldDrops ? 0.5 : 1,
              }}
              title={
                hasSoldDrops
                  ? `No se puede eliminar: ${soldDropsCount} drop${soldDropsCount === 1 ? '' : 's'} con ventas registradas`
                  : 'Eliminar evento'
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </button>

      {open && (
        <div
          className="border-t p-3 space-y-2"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}
        >
          <div className="flex flex-wrap gap-1.5">
            {(event.clans || []).map((c: any) => (
              <span
                key={c.id}
                className="rounded-full px-2 py-0.5 text-xs"
                style={{
                  background: 'rgba(123,241,214,0.08)',
                  color: '#7bf1d6',
                  border: '1px solid rgba(123,241,214,0.25)',
                }}
              >
                <Flag className="h-3 w-3 inline mr-1" />
                {c.name}
              </span>
            ))}
          </div>

          {event.notes && (
            <p className="text-xs italic" style={{ color: 'rgba(255,255,255,0.5)' }}>
              "{event.notes}"
            </p>
          )}

          {event.evidenceImageUrl && (
            <img
              src={event.evidenceImageUrl}
              alt="evidencia"
              className="rounded-lg max-h-48"
              style={{ border: '1px solid rgba(255,255,255,0.08)' }}
            />
          )}

          <div className="space-y-1.5">
            {drops.map((d: any) => {
              const available =
                (Number(d.quantity) || 0) - (Number(d.quantitySold) || 0);
              return (
                <div
                  key={d.id}
                  className="flex items-center gap-2 rounded-lg p-2"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <div
                    className="h-9 w-9 shrink-0 rounded-lg flex items-center justify-center overflow-hidden"
                    style={{ background: 'rgba(255,255,255,0.05)' }}
                  >
                    {d.imageUrl ? (
                      <img src={d.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-xs font-medium"
                      style={{ color: 'rgba(255,255,255,0.9)' }}
                    >
                      {d.name}
                    </p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      {d.category} · ${Number(d.price).toLocaleString()} · {available}/
                      {d.quantity} disp.
                    </p>
                  </div>
                  {canInteract && available > 0 && (
                    <SellDropControl
                      max={available}
                      buyers={buyers}
                      onSell={(qty, buyerId, buyerName) =>
                        onSellDrop(Number(d.id), qty, buyerId, buyerName)
                      }
                    />
                  )}
                  {available === 0 && (
                    <span
                      className="text-xs rounded-full px-2 py-0.5"
                      style={{
                        background: 'rgba(16,185,129,0.1)',
                        color: '#10b981',
                        border: '1px solid rgba(16,185,129,0.25)',
                      }}
                    >
                      vendido
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SellDropControl({
  max,
  buyers,
  onSell,
}: {
  max: number;
  buyers: any[];
  onSell: (qty: number, buyerId: number, buyerName: string) => void;
}) {
  // La venta dentro del EventCard ahora requiere seleccionar comprador/cuenta,
  // igual que el modal de la tab "Tabla de drops". La UI sigue siendo inline
  // (qty + select + botón) para no quebrar el layout compacto de cada evento.
  const [qty, setQty] = useState('1');
  const [buyerId, setBuyerId] = useState<string>('');
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min="1"
        max={max}
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        className="w-12 rounded-lg px-1.5 py-1 text-xs text-center"
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: 'rgba(255,255,255,0.9)',
        }}
      />
      <select
        value={buyerId}
        onChange={(e) => setBuyerId(e.target.value)}
        className="rounded-lg px-1.5 py-1 text-xs max-w-[120px] select-dark"
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: 'rgba(255,255,255,0.9)',
        }}
        title="Comprador/Cuenta"
      >
        <option value="" className="bg-[#0a0e16]">
          Comprador…
        </option>
        {buyers.map((b: any) => (
          <option key={b.id} value={String(b.id)} className="bg-[#0a0e16]">
            {b.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => {
          const n = parseInt(qty) || 1;
          if (n > max) {
            toast.error(`Solo hay ${max} disp.`);
            return;
          }
          if (!buyerId) {
            toast.error('Seleccioná un comprador/cuenta');
            return;
          }
          const b = buyers.find((x: any) => String(x.id) === String(buyerId));
          if (!b) {
            toast.error('Comprador no válido');
            return;
          }
          onSell(n, Number(b.id), String(b.name));
          setBuyerId('');
          setQty('1');
        }}
        className="rounded-lg px-2 py-1 text-xs font-semibold"
        style={{
          background: 'rgba(16,185,129,0.15)',
          border: '1px solid rgba(16,185,129,0.3)',
          color: '#10b981',
        }}
      >
        Vender
      </button>
    </div>
  );
}
