import React, { useState, useMemo } from 'react';
import { ShoppingBag, Search, User, Calendar, Flag, Swords } from 'lucide-react';
import { AppShell } from '../../components/layout/AppShell';
import { trpc } from '../../lib/trpc';
import { useAuth } from '../../contexts/AuthContext';
import type { RaidAccessInfo } from '../../components/RaidProtectedRoute';

interface Props {
  raidAccess?: RaidAccessInfo;
}

/**
 * Historial de Compras del módulo Raid.
 *
 * Replica el layout de /purchases (menú antiguo) pero 100% aislado:
 *  - Se alimenta del endpoint `raid.purchases.list` (derivado de `raidAuditLogs`
 *    con action === 'RAID_DROP_SOLD'), no del AppContext legacy.
 *  - Las compras raid no aparecen en /purchases y viceversa.
 *  - Mantiene tabs "Historial Público" / "Mis Compras" + buscador por
 *    ítem/comprador, para que la UX se sienta idéntica al módulo antiguo.
 *
 * Tema visual: paleta raid (rojo/dorado) en vez del turquesa del módulo legacy
 * para reforzar visualmente que los datasets son distintos.
 */
export default function RaidPurchases(_: Props) {
  const { user: authUser } = useAuth();
  const purchasesQ = trpc.raid.purchases.list.useQuery();
  const clansQ = trpc.raid.clans.list.useQuery();

  const [search, setSearch] = useState('');
  const [view, setView] = useState<'public' | 'private'>('public');

  // Mapa clanId → nombre para resolver los ids compartidos que vienen del log
  const clansById = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of clansQ.data || []) map.set(Number(c.id), String(c.name));
    return map;
  }, [clansQ.data]);

  const currentUserId = Number(authUser?.id);

  const filtered = useMemo(() => {
    const all = purchasesQ.data || [];
    const q = search.trim().toLowerCase();
    return all.filter((p) => {
      const matchesSearch =
        !q ||
        (p.itemName || '').toLowerCase().includes(q) ||
        (p.buyerName || '').toLowerCase().includes(q);
      const matchesView =
        view === 'public' || (p.buyerId != null && Number(p.buyerId) === currentUserId);
      return matchesSearch && matchesView;
    });
  }, [purchasesQ.data, search, view, currentUserId]);

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gradient flex items-center gap-2">
              <Swords className="h-6 w-6" style={{ color: '#f87171' }} />
              Historial de Compras Raid
            </h2>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {view === 'public'
                ? 'Registro global de todas las adquisiciones de drops realizadas en el módulo raid.'
                : 'Tus adquisiciones personales de drops de raid.'}
            </p>
          </div>

          <div
            className="flex items-center gap-2 rounded-xl p-1"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <button
              onClick={() => setView('public')}
              className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
                view === 'public'
                  ? 'bg-white/10 text-white shadow-sm'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              Historial Público
            </button>
            <button
              onClick={() => setView('private')}
              className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
                view === 'private'
                  ? 'bg-white/10 text-white shadow-sm'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              Mis Compras
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="card-glass flex items-center gap-3 px-4 py-3 rounded-2xl">
          <Search className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
          <input
            type="text"
            placeholder="Buscar por ítem o comprador..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-sm outline-none w-full"
            style={{ color: 'rgba(255,255,255,0.8)' }}
          />
          {!!(purchasesQ.data?.length) && (
            <span
              className="text-[10px] uppercase tracking-wider font-semibold shrink-0"
              style={{ color: 'rgba(255,255,255,0.25)' }}
            >
              {filtered.length} / {purchasesQ.data?.length} compras
            </span>
          )}
        </div>

        {/* List */}
        <div className="grid gap-4">
          {purchasesQ.isLoading ? (
            <div className="card-glass flex items-center justify-center py-20 rounded-3xl">
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
                Cargando compras…
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="card-glass flex flex-col items-center justify-center py-20 rounded-3xl border-dashed">
              <div
                className="h-16 w-16 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: 'rgba(255,255,255,0.03)' }}
              >
                <ShoppingBag className="h-8 w-8" style={{ color: 'rgba(255,255,255,0.1)' }} />
              </div>
              <p
                className="text-sm font-medium"
                style={{ color: 'rgba(255,255,255,0.3)' }}
              >
                {view === 'private'
                  ? 'Todavía no registraste compras propias en el módulo raid'
                  : 'No se encontraron registros de compra'}
              </p>
            </div>
          ) : (
            filtered.map((purchase) => {
              const isMine =
                purchase.buyerId != null && Number(purchase.buyerId) === currentUserId;
              const clanNames = ((purchase.clansShared || []) as number[])
                .map((id: number) => clansById.get(Number(id)))
                .filter(Boolean) as string[];
              return (
                <div
                  key={purchase.id}
                  className="card-glass group relative overflow-hidden rounded-2xl p-4 transition-all hover:translate-y-[-2px]"
                  style={{ border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                      <div
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                        style={{
                          background: 'rgba(248,113,113,0.1)',
                          border: '1px solid rgba(248,113,113,0.25)',
                        }}
                      >
                        <ShoppingBag className="h-6 w-6" style={{ color: '#f87171' }} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3
                            className="font-semibold"
                            style={{ color: 'rgba(255,255,255,0.9)' }}
                          >
                            {purchase.itemName}
                          </h3>
                          <span
                            className="text-[9px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full"
                            style={{
                              background: 'rgba(248,113,113,0.1)',
                              border: '1px solid rgba(248,113,113,0.25)',
                              color: '#f87171',
                            }}
                          >
                            Raid
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                          <div
                            className="flex items-center gap-1.5 text-xs"
                            style={{ color: 'rgba(255,255,255,0.4)' }}
                          >
                            <User className="h-3 w-3" />
                            <span style={{ color: isMine ? '#f87171' : 'inherit' }}>
                              {purchase.buyerName} {isMine && '(Tú)'}
                            </span>
                          </div>
                          <div
                            className="flex items-center gap-1.5 text-xs"
                            style={{ color: 'rgba(255,255,255,0.4)' }}
                          >
                            <Calendar className="h-3 w-3" />
                            {purchase.createdAt
                              ? new Date(purchase.createdAt).toLocaleString()
                              : '—'}
                          </div>
                          {clanNames.length > 0 && (
                            <div
                              className="flex items-center gap-1.5 text-xs"
                              style={{ color: 'rgba(255,255,255,0.4)' }}
                            >
                              <Flag className="h-3 w-3" />
                              <span>{clanNames.join(', ')}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t pt-4 sm:border-t-0 sm:pt-0 sm:text-right shrink-0">
                      <div
                        className="sm:hidden text-xs"
                        style={{ color: 'rgba(255,255,255,0.3)' }}
                      >
                        Total Pagado
                      </div>
                      <div>
                        <p
                          className="text-lg font-bold font-mono"
                          style={{ color: '#f87171' }}
                        >
                          ${(purchase.total ?? 0).toLocaleString()}
                        </p>
                        <p
                          className="text-[10px] uppercase tracking-wider font-semibold"
                          style={{ color: 'rgba(255,255,255,0.25)' }}
                        >
                          {(purchase.quantity ?? 0)} unidad(es) × $
                          {(purchase.price ?? 0).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Decorative element (raid theme: rojo) */}
                  <div className="absolute right-0 top-0 h-full w-1 bg-gradient-to-b from-transparent via-[#f87171]/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              );
            })
          )}
        </div>
      </div>
    </AppShell>
  );
}
