import React, { useMemo, useState } from 'react';
import { Swords, Skull, Flag, Plus, Trash2, Image as ImageIcon, Check, X, AlertCircle, PlayCircle } from 'lucide-react';
import { AppShell } from '../../components/layout/AppShell';
import { trpc } from '../../lib/trpc';
import { toast } from 'sonner';
import type { RaidAccessInfo } from '../../components/RaidProtectedRoute';

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
  const eventsQ = trpc.raid.events.list.useQuery({});

  const canInteract = !!raidAccess?.canInteract;

  const createEvent = trpc.raid.events.create.useMutation({
    onSuccess: () => {
      toast.success('Evento de raid registrado');
      resetForm();
      utils.raid.events.list.invalidate();
      utils.raid.dashboard.invalidate();
      utils.raid.clans.stats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteEvent = trpc.raid.events.delete.useMutation({
    onSuccess: () => {
      toast.success('Evento eliminado');
      utils.raid.events.list.invalidate();
      utils.raid.dashboard.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const sellDrop = trpc.raid.drops.sell.useMutation({
    onSuccess: () => {
      toast.success('Drop vendido — ganancias distribuidas a los clanes');
      utils.raid.events.list.invalidate();
      utils.raid.dashboard.invalidate();
      utils.raid.clans.stats.invalidate();
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
  const [notes, setNotes] = useState('');
  const [selectedClanIds, setSelectedClanIds] = useState<number[]>([]);
  const [drops, setDrops] = useState<DropItemInput[]>([emptyDrop()]);

  // Autocomplete de categoría basado en drops previos
  const categorySuggestions = useMemo(() => {
    const set = new Set<string>();
    events.forEach((e: any) => {
      (e.dropItems || []).forEach((d: any) => {
        if (d.category) set.add(d.category);
      });
    });
    return Array.from(set).sort();
  }, [events]);

  const resetForm = () => {
    setRaidBossId(null);
    setEvidenceUrl('');
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
    setDrops((prev) => prev.map((d, i) => (i === idx ? { ...d, [key]: value } : d)));
  };

  const addDrop = () => setDrops((prev) => [...prev, emptyDrop()]);
  const removeDrop = (idx: number) =>
    setDrops((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCycle) {
      toast.error('No hay ciclo de raid abierto. Andá a Ciclos de Raids y abrí uno.');
      return;
    }
    if (!raidBossId) {
      toast.error('Seleccioná el Raid Boss eliminado');
      return;
    }
    if (selectedClanIds.length === 0) {
      toast.error('Seleccioná al menos un clan asociado');
      return;
    }
    const validDrops = drops.filter((d) => d.name.trim());
    if (validDrops.length === 0) {
      toast.error('Registrá al menos un item dropeado');
      return;
    }
    for (const d of validDrops) {
      if (!d.category.trim()) {
        toast.error(`Falta la categoría del item "${d.name}"`);
        return;
      }
    }
    createEvent.mutate({
      raidBossId,
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
    });
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

      {/* Banner de ciclo actual */}
      <div
        className="rounded-2xl p-4 mb-5 flex flex-wrap items-center justify-between gap-3"
        style={{
          background: currentCycle
            ? 'linear-gradient(135deg, rgba(123,241,214,0.08), rgba(232,121,249,0.08))'
            : 'rgba(251,191,36,0.05)',
          border: currentCycle
            ? '1px solid rgba(123,241,214,0.2)'
            : '1px solid rgba(251,191,36,0.25)',
        }}
      >
        <div className="flex items-center gap-3">
          {currentCycle ? (
            <PlayCircle className="h-5 w-5" style={{ color: '#7bf1d6' }} />
          ) : (
            <AlertCircle className="h-5 w-5" style={{ color: '#fbbf24' }} />
          )}
          <div>
            <p className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>
              {currentCycle
                ? `Ciclo activo: ${currentCycle.label}`
                : 'No hay ciclo de raid abierto'}
            </p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {currentCycle
                ? `Iniciado el ${new Date(
                    currentCycle.startedAt
                  ).toLocaleString('es-CL')}`
                : 'Abrí un ciclo desde "Ciclos de Raids" para registrar eventos.'}
            </p>
          </div>
        </div>
      </div>

      {canInteract && currentCycle && (
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

              {/* Evidencia */}
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Imagen de evidencia (URL) *
                </label>
                <input
                  type="text"
                  value={evidenceUrl}
                  onChange={(e) => setEvidenceUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-xl px-3 py-2 text-sm"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.9)',
                  }}
                />
                {evidenceUrl && (
                  <img
                    src={evidenceUrl}
                    alt="evidencia"
                    className="mt-2 rounded-xl max-h-32"
                    style={{ border: '1px solid rgba(255,255,255,0.08)' }}
                  />
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

              <div className="space-y-2">
                {drops.map((d, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl p-3"
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <div className="grid gap-2 sm:grid-cols-12">
                      <input
                        type="text"
                        value={d.name}
                        onChange={(e) => updateDrop(idx, 'name', e.target.value)}
                        placeholder="Nombre item"
                        className="rounded-lg px-2 py-1.5 text-xs sm:col-span-3"
                        style={{
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          color: 'rgba(255,255,255,0.9)',
                        }}
                      />
                      <input
                        type="text"
                        value={d.category}
                        onChange={(e) => updateDrop(idx, 'category', e.target.value)}
                        placeholder="Categoría"
                        list="raid-drop-categories"
                        className="rounded-lg px-2 py-1.5 text-xs sm:col-span-2"
                        style={{
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          color: 'rgba(255,255,255,0.9)',
                        }}
                      />
                      <input
                        type="number"
                        min="0"
                        value={d.price}
                        onChange={(e) => updateDrop(idx, 'price', e.target.value)}
                        placeholder="Precio"
                        className="rounded-lg px-2 py-1.5 text-xs sm:col-span-2"
                        style={{
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          color: 'rgba(255,255,255,0.9)',
                        }}
                      />
                      <input
                        type="number"
                        min="1"
                        value={d.quantity}
                        onChange={(e) => updateDrop(idx, 'quantity', e.target.value)}
                        placeholder="Cant."
                        className="rounded-lg px-2 py-1.5 text-xs sm:col-span-1"
                        style={{
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          color: 'rgba(255,255,255,0.9)',
                        }}
                      />
                      <input
                        type="text"
                        value={d.imageUrl}
                        onChange={(e) => updateDrop(idx, 'imageUrl', e.target.value)}
                        placeholder="URL imagen"
                        className="rounded-lg px-2 py-1.5 text-xs sm:col-span-3"
                        style={{
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          color: 'rgba(255,255,255,0.9)',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => removeDrop(idx)}
                        disabled={drops.length <= 1}
                        className="rounded-lg px-2 py-1.5 text-xs transition-all sm:col-span-1 flex items-center justify-center"
                        style={{
                          background: 'rgba(255,120,120,0.05)',
                          border: '1px solid rgba(255,120,120,0.15)',
                          color: 'rgba(255,120,120,0.7)',
                          opacity: drops.length <= 1 ? 0.3 : 1,
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
                <datalist id="raid-drop-categories">
                  {categorySuggestions.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
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
          <div className="space-y-3">
            {events.map((e: any) => (
              <EventCard
                key={e.id}
                event={e}
                canInteract={canInteract}
                canAdmin={!!raidAccess?.canAdmin}
                onDelete={() => {
                  if (confirm(`¿Eliminar el evento #${e.id}?`)) {
                    deleteEvent.mutate({ id: Number(e.id) });
                  }
                }}
                onSellDrop={(dropId, qty) => {
                  sellDrop.mutate({ id: dropId, quantity: qty });
                }}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function EventCard({
  event,
  canInteract,
  canAdmin,
  onDelete,
  onSellDrop,
}: {
  event: any;
  canInteract: boolean;
  canAdmin: boolean;
  onDelete: () => void;
  onSellDrop: (id: number, qty: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const createdAt = event.createdAt
    ? new Date(event.createdAt).toLocaleString('es-CL')
    : '';
  const drops = event.dropItems || [];

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
                onDelete();
              }}
              className="rounded-lg p-1.5"
              style={{ color: 'rgba(255,120,120,0.7)' }}
              title="Eliminar evento"
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
                      onSell={(qty) => onSellDrop(Number(d.id), qty)}
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

function SellDropControl({ max, onSell }: { max: number; onSell: (qty: number) => void }) {
  const [qty, setQty] = useState('1');
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
      <button
        type="button"
        onClick={() => {
          const n = parseInt(qty) || 1;
          if (n > max) {
            toast.error(`Solo hay ${max} disp.`);
            return;
          }
          onSell(n);
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
