import React, { useState, useEffect } from 'react';
import { Shield, User, Package, Search, Coins, TrendingUp, ShoppingCart, Users } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { trpc } from '../lib/trpc';
import { categoryMeta } from '../lib/category-meta';
import { toast } from 'sonner';
import type { Character } from '../lib/types';
import { FancySelect } from '../components/ui/FancySelect';

function CharacterCard({ char, onSelect, isActive }: { char: Character; onSelect: (c: Character) => void; isActive: boolean }) {
  const { items } = useApp();
  const charItems = items.filter(i => i.associatedCharacterIds.includes(char.id) || i.associatedCharacterIds.includes(Number(char.id)));

  return (
    <div
      onClick={() => onSelect(char)}
      className="card-glass rounded-2xl p-4 cursor-pointer transition-all hover:scale-[1.01]"
      style={{
        border: isActive ? '1px solid rgba(123,241,214,0.4)' : undefined,
        boxShadow: isActive ? '0 0 20px rgba(123,241,214,0.1)' : undefined,
      }}>
      {/* Avatar + name */}
      <div className="flex items-center gap-3 mb-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${char.avatar} text-sm font-bold text-white`}>
          {char.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>{char.name}</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{char.class || 'Sin clase'}</p>
        </div>
        {(char.role?.toUpperCase() === 'SUPER_ADMIN' || char.role?.toLowerCase() === 'super_admin') && (
          <Shield className="h-4 w-4 shrink-0 ml-auto" style={{ color: '#7bf1d6' }} />
        )}
      </div>

      {/* Role badge */}
      <div className="mb-3">
        {(() => {
          const r = String(char.role || '').toLowerCase();
          const isSA = r === 'super_admin';
          const isMapper = r === 'mapper';
          const isAdmin = r === 'admin';
          const bg = isSA ? 'rgba(123,241,214,0.1)' : isMapper ? 'rgba(251,191,36,0.1)' : isAdmin ? 'rgba(96,165,250,0.1)' : 'rgba(167,139,250,0.1)';
          const color = isSA ? '#7bf1d6' : isMapper ? '#fbbf24' : isAdmin ? '#60a5fa' : '#a78bfa';
          const border = isSA ? 'rgba(123,241,214,0.25)' : isMapper ? 'rgba(251,191,36,0.25)' : isAdmin ? 'rgba(96,165,250,0.25)' : 'rgba(167,139,250,0.25)';
          const label = isSA ? 'Super Admin' : isMapper ? 'Mapper' : isAdmin ? 'Admin' : 'Usuario';
          return (
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
              style={{ background: bg, color, border: `1px solid ${border}` }}>
              {label}
            </span>
          );
        })()}
      </div>

      {/* Earnings */}
      <div className="mb-2 flex items-center gap-2 rounded-lg p-2" style={{ background: 'rgba(167,139,250,0.1)' }}>
        <Coins className="h-3.5 w-3.5" style={{ color: '#a78bfa' }} />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-mono" style={{ color: '#a78bfa' }}>${(char.totalEarnings ?? 0).toLocaleString()}</span>
          <span className="text-xs ml-1" style={{ color: 'rgba(255,255,255,0.3)' }}>total</span>
        </div>
      </div>

      {/* Current cycle earnings */}
      {char.currentCycleEarnings > 0 && (
        <div className="mb-2 flex items-center gap-2 rounded-lg p-2" style={{ background: 'rgba(123,241,214,0.08)' }}>
          <TrendingUp className="h-3.5 w-3.5" style={{ color: '#7bf1d6' }} />
          <span className="text-xs font-mono" style={{ color: '#7bf1d6' }}>+${(char.currentCycleEarnings ?? 0).toLocaleString()}</span>
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>este ciclo</span>
        </div>
      )}

      {/* Items */}
      <div>
        <p className="text-xs mb-2 flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
          <Package className="h-3 w-3" /> {charItems.length} ítem{charItems.length !== 1 ? 's' : ''} asociado{charItems.length !== 1 ? 's' : ''}
        </p>
        <div className="flex flex-wrap gap-1">
          {charItems.slice(0, 4).map(item => (
            <div key={item.id} className="flex items-center gap-1 rounded-lg px-2 py-1"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
              {item.image?.publicUrl ? (
                <img src={item.image.publicUrl} alt={item.name} className="h-4 w-4 rounded object-cover" />
              ) : (
                <div className="h-4 w-4 rounded bg-white/5 flex items-center justify-center">
                  <Package className="h-2 w-2 text-white/20" />
                </div>
              )}
              <span className="text-xs truncate max-w-[60px]" style={{ color: 'rgba(255,255,255,0.6)' }}>{item.name}</span>
            </div>
          ))}
          {charItems.length > 4 && (
            <span className="text-xs rounded-lg px-2 py-1" style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.3)' }}>
              +{charItems.length - 4}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function CharacterDetail({ char }: { char: Character }) {
  const { items, currentUser, sellItem } = useApp();
  const charItems = items.filter(i => i.associatedCharacterIds.includes(char.id) || i.associatedCharacterIds.includes(Number(char.id)));
  const [sellModalItem, setSellModalItem] = useState<string | null>(null);
  const [sellQty, setSellQty] = useState('1');

  const handleSell = (itemId: string, itemName: string) => {
    if (currentUser && currentUser.role !== 'SUPER_ADMIN') {
      toast.error('Solo Super Admin puede vender ítems');
      return;
    }
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    const qty = parseInt(sellQty) || 1;
    const remaining = item.quantity - item.quantitySold;
    if (qty < 1 || qty > remaining) {
      toast.error(`Cantidad inválida. Disponibles: ${remaining}`);
      return;
    }
    // FIX: Incluir buyerId y buyerName requeridos por el backend
    sellItem({
      itemId,
      quantityToSell: qty,
      buyerId: char.id,
      buyerName: char.name,
    });
    const newRemaining = remaining - qty;
    if (newRemaining === 0) {
      toast.success(`"${itemName}" completamente vendido.`);
    } else {
      toast.success(`Vendidas ${qty} unidad(es) de "${itemName}". Quedan ${newRemaining}.`);
    }
    setSellModalItem(null);
    setSellQty('1');
  };

  return (
    <div className="card-glass rounded-2xl p-5">
      <div className="flex items-center gap-4 mb-5">
        <div className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${char.avatar} text-xl font-bold text-white shadow-neon-cyan`}>
          {char.name.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <h3 className="text-xl font-bold" style={{ color: 'rgba(255,255,255,0.95)' }}>{char.name}</h3>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>{char.class || 'Sin clase'}</p>
          {(() => {
            const r = String(char.role || '').toLowerCase();
            const isSA = r === 'super_admin';
            const isMapper = r === 'mapper';
            const isAdmin = r === 'admin';
            const bg = isSA ? 'rgba(123,241,214,0.1)' : isMapper ? 'rgba(251,191,36,0.1)' : isAdmin ? 'rgba(96,165,250,0.1)' : 'rgba(167,139,250,0.1)';
            const color = isSA ? '#7bf1d6' : isMapper ? '#fbbf24' : isAdmin ? '#60a5fa' : '#a78bfa';
            const border = isSA ? 'rgba(123,241,214,0.25)' : isMapper ? 'rgba(251,191,36,0.25)' : isAdmin ? 'rgba(96,165,250,0.25)' : 'rgba(167,139,250,0.25)';
            const label = isSA ? 'Super Admin' : isMapper ? 'Mapper' : isAdmin ? 'Admin' : 'Usuario';
            return (
              <span className="mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
                style={{ background: bg, color, border: `1px solid ${border}` }}>
                {label}
              </span>
            );
          })()}
        </div>
      </div>

      {/* Earnings section */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl p-3" style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)' }}>
          <div className="flex items-center gap-2 mb-1">
            <Coins className="h-3.5 w-3.5" style={{ color: '#a78bfa' }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)' }}>Ganancia Total</span>
          </div>
          <span className="text-lg font-bold font-mono" style={{ color: '#a78bfa' }}>${(char.totalEarnings ?? 0).toLocaleString()}</span>
        </div>
        <div className="rounded-xl p-3" style={{ background: 'rgba(123,241,214,0.08)', border: '1px solid rgba(123,241,214,0.2)' }}>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-3.5 w-3.5" style={{ color: '#7bf1d6' }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)' }}>Ciclo Actual</span>
          </div>
          <span className="text-lg font-bold font-mono" style={{ color: '#7bf1d6' }}>+${(char.currentCycleEarnings ?? 0).toLocaleString()}</span>
        </div>
      </div>

      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
          <Package className="h-3 w-3" />
          Ítems asociados ({charItems.length})
        </p>
        {charItems.length === 0 ? (
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>Sin ítems asignados</p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {charItems.map(item => {
              const isVendido = item.status === 'VENDIDO';
              const remaining = item.quantity - item.quantitySold;
              const assocCount = item.associatedCharacterIds.length || 1;
              // Ganancia por unidad para el personaje (label "c/u por venta").
              const perUnitShare = item.price ? Math.floor(item.price / assocCount) : 0;
              // Ganancia real acumulada para el personaje por este ítem
              // (price * quantitySold / assocCount) — coherente con el backend.
              const earnedFromItem = item.price
                ? Math.floor((item.price * item.quantitySold) / assocCount)
                : 0;
              const isSellingThis = sellModalItem === item.id;

              return (
                <div key={item.id} className="rounded-xl p-3"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center gap-3">
                    {item.image?.publicUrl ? (
                      <img src={item.image.publicUrl} alt={item.name} className="h-8 w-8 rounded-lg object-cover border" style={{ borderColor: 'rgba(255,255,255,0.1)' }} />
                    ) : (
                      <div className="h-8 w-8 rounded-lg bg-white/5 flex items-center justify-center border" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                        <Package className="h-4 w-4 text-white/20" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" style={{ color: 'rgba(255,255,255,0.85)' }}>{item.name}</p>
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        {(categoryMeta[item.category] || { emoji: '📦', label: item.category }).emoji} {(categoryMeta[item.category] || { emoji: '📦', label: item.category }).label}
                        {' · '}
                        <span style={{ color: 'rgba(255,255,255,0.5)' }}>{remaining}/{item.quantity} disponibles</span>
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-mono" style={{ color: '#a78bfa' }}>
                        {isVendido ? `+$${(earnedFromItem ?? 0).toLocaleString()}` : `$${(item.price ?? 0).toLocaleString() || '—'}`}
                      </p>
                      <p className="text-xs" style={{
                        color: isVendido ? '#a78bfa' : (item.status === 'CONFIRMADO' ? '#34d399' : '#fbbf24')
                      }}>
                        {isVendido ? '💰 Vendido' : (item.status === 'CONFIRMADO' ? '✅ Confirmado' : '🟡 En Registro')}
                      </p>
                    </div>
                  </div>

                  {/* Personajes asociados al item */}
                  <div className="mt-2 flex items-center gap-1">
                    <Users className="h-3 w-3 shrink-0" style={{ color: 'rgba(255,255,255,0.25)' }} />
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      {assocCount} personaje(s) · ${(perUnitShare ?? 0).toLocaleString()} c/u por unidad
                    </span>
                  </div>

                  {/* Venta parcial inline */}
                  {!isVendido && currentUser?.role === 'SUPER_ADMIN' && item.status === 'CONFIRMADO' && (
                    <div className="mt-2">
                      {isSellingThis ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={sellQty}
                            onChange={e => setSellQty(e.target.value)}
                            min="1"
                            max={remaining}
                            className="input-dark h-8 w-20 text-xs text-center"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSell(item.id, item.name)}
                            className="px-2 py-1 rounded text-xs font-medium"
                            style={{ background: '#a78bfa', color: '#000' }}>
                            Vender
                          </button>
                          <button
                            onClick={() => { setSellModalItem(null); setSellQty('1'); }}
                            className="px-2 py-1 rounded text-xs font-medium"
                            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setSellModalItem(item.id); setSellQty('1'); }}
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
                          style={{ background: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.25)' }}>
                          <ShoppingCart className="h-3 w-3" />
                          Vender unidades
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-4 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {char.role === 'SUPER_ADMIN'
            ? 'Este personaje puede vender ítems. La ganancia se divide equitativamente entre todos los personajes asociados al ítem.'
            : 'Este personaje no puede vender ítems. Solo Super Admin tiene permiso para realizar ventas.'}
        </p>
      </div>
    </div>
  );
}

export default function Characters() {
  const { items, currentUser, setCurrentUser } = useApp();
  const { user: authUser } = useAuth();
  const isAuthSuperAdmin = authUser?.role === 'super_admin' || authUser?.role === 'SUPER_ADMIN';
  const { data: legacyBuyersData } = trpc.items.legacyBuyers.useQuery(undefined, { enabled: !!authUser });
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'SUPER_ADMIN' | 'MAPPER' | 'ADMIN' | 'USER'>('ALL');
  const [selected, setSelected] = useState<Character | null>(null);

  const legacyChars: Character[] = (legacyBuyersData as any[] || []).map((u: any) => {
    const r = String(u.role || 'user').toLowerCase();
    const avatarGrad = r === 'super_admin' ? 'from-cyan-400 to-blue-600' : r === 'mapper' ? 'from-amber-400 to-orange-600' : r === 'admin' ? 'from-blue-400 to-indigo-600' : 'from-fuchsia-400 to-purple-600';
    return {
      id: u.id,
      name: u.name,
      role: u.role?.toUpperCase() || 'USER',
      avatar: avatarGrad,
      class: u.classMain || 'Sin clase',
      level: 1,
      itemIds: u.itemIds || [],
      totalEarnings: u.totalEarnings || 0,
      currentCycleEarnings: u.currentCycleEarnings || 0,
    };
  });

  useEffect(() => {
    if (!selected && legacyChars.length > 0) {
      setSelected(legacyChars[0]);
    }
  }, [legacyBuyersData]);

  const filtered = legacyChars.filter(c => {
    const q = search.toLowerCase();
    const nameMatch = c.name.toLowerCase().includes(q);
    const classMatch = c.class.toLowerCase().includes(q);
    
    const rl = String(c.role || '').toLowerCase();
    const roleMatch = roleFilter === 'ALL' || 
       (roleFilter === 'SUPER_ADMIN' && rl === 'super_admin') ||
       (roleFilter === 'MAPPER' && rl === 'mapper') ||
       (roleFilter === 'ADMIN' && rl === 'admin') ||
       (roleFilter === 'USER' && rl === 'user');
       
    return (!q || nameMatch || classMatch) && roleMatch;
  });

  return (
    <AppShell>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gradient">Personajes</h2>
        <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Los personajes del sistema comparten el inventario de ítems. Cada uno tiene un rol que determina
          sus permisos. Las ganancias se distribuyen equitativamente entre los personajes asociados a cada ítem vendido.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        {/* Left: grid */}
        <div>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="flex h-9 items-center gap-2 rounded-xl border px-3 flex-1 min-w-[160px]"
              style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
              <Search className="h-3.5 w-3.5 shrink-0" style={{ color: 'rgba(255,255,255,0.35)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar personaje..." className="bg-transparent text-xs outline-none w-full"
                style={{ color: 'rgba(255,255,255,0.8)' }} />
            </div>
            <div className="min-w-[160px]">
              <FancySelect<string>
                value={roleFilter}
                onChange={(v) => setRoleFilter(String(v) as typeof roleFilter)}
                accent="turquoise"
                size="sm"
                placeholder="Todos los roles"
                options={[
                  { value: 'ALL', label: 'Todos los roles', emoji: '👥' },
                  { value: 'SUPER_ADMIN', label: 'Super Admin', emoji: '⚡' },
                  { value: 'ADMIN', label: 'Admin', emoji: '🛡️' },
                  { value: 'MAPPER', label: 'Mapper', emoji: '🗺️' },
                  { value: 'USER', label: 'Usuario', emoji: '👤' },
                ]}
              />
            </div>
            <span className="text-xs px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.4)' }}>
              {filtered.length} personajes
            </span>
          </div>

          {/* Grid */}
          {filtered.length === 0 ? (
            <div className="card-glass rounded-2xl p-12 text-center">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No se encontraron personajes registrados</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map(char => (
                <CharacterCard
                  key={char.id}
                  char={char}
                  onSelect={setSelected}
                  isActive={selected?.id === char.id}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right: detail */}
        <div className="xl:sticky xl:top-6 xl:self-start">
          {selected ? (
            <>
              <CharacterDetail char={selected} />

              {isAuthSuperAdmin && (
                <div className="mt-4 card-glass rounded-2xl p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    Simular sesión como
                  </p>
                  <button
                    onClick={() => setCurrentUser(selected)}
                    disabled={currentUser?.id === selected.id}
                    className="w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all disabled:opacity-50"
                    style={{
                      background: currentUser?.id === selected.id ? 'rgba(123,241,214,0.06)' : 'rgba(255,255,255,0.03)',
                      borderColor: currentUser?.id === selected.id ? 'rgba(123,241,214,0.3)' : 'rgba(255,255,255,0.08)',
                    }}>
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${selected.avatar} text-xs font-bold text-white`}>
                      {selected.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" style={{ color: 'rgba(255,255,255,0.85)' }}>{selected.name}</p>
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                        {currentUser?.id === selected.id ? '✓ Sesión activa' : 'Clic para activar'}
                      </p>
                    </div>
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="card-glass rounded-2xl p-8 text-center border-dashed" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Selecciona un personaje para ver detalles</p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
