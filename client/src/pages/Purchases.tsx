import React, { useState } from 'react';
import { ShoppingBag, Search, User, Calendar } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { AppShell } from '../components/layout/AppShell';
import type { Purchase } from '../lib/types';

export default function Purchases() {
  const { purchases, currentUser } = useApp();
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'public' | 'private'>('public');

  const filteredPurchases = (Array.isArray(purchases) ? purchases : []).filter(p => {
    const itemName = p.itemName || '';
    const buyerName = p.buyerName || '';
    const matchesSearch = itemName.toLowerCase().includes(search.toLowerCase()) || 
                         buyerName.toLowerCase().includes(search.toLowerCase());
    const matchesView = view === 'public' || p.buyerId === currentUser?.id;
    return matchesSearch && matchesView;
  });

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gradient">Historial de Compras</h2>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {view === 'public' 
                ? 'Registro global de todas las adquisiciones realizadas en el sistema.' 
                : 'Tus adquisiciones personales y registros de cuenta.'}
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-xl p-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <button
              onClick={() => setView('public')}
              className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${view === 'public' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/60'}`}
            >
              Historial Público
            </button>
            <button
              onClick={() => setView('private')}
              className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${view === 'private' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/60'}`}
            >
              Mis Compras
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="card-glass flex items-center gap-3 px-4 py-3 rounded-2xl">
          <Search className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
          <input
            type="text"
            placeholder="Buscar por ítem o comprador..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent text-sm outline-none w-full"
            style={{ color: 'rgba(255,255,255,0.8)' }}
          />
        </div>

        {/* List */}
        <div className="grid gap-4">
          {filteredPurchases.length === 0 ? (
            <div className="card-glass flex flex-col items-center justify-center py-20 rounded-3xl border-dashed">
              <div className="h-16 w-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <ShoppingBag className="h-8 w-8" style={{ color: 'rgba(255,255,255,0.1)' }} />
              </div>
              <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.3)' }}>
                No se encontraron registros de compra
              </p>
            </div>
          ) : (
            filteredPurchases.map((purchase) => (
              <div key={purchase.id} className="card-glass group relative overflow-hidden rounded-2xl p-4 transition-all hover:translate-y-[-2px]" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: 'rgba(123,241,214,0.1)', border: '1px solid rgba(123,241,214,0.2)' }}>
                      <ShoppingBag className="h-6 w-6" style={{ color: '#7bf1d6' }} />
                    </div>
                    <div>
                      <h3 className="font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>{purchase.itemName}</h3>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                          <User className="h-3 w-3" />
                          <span style={{ color: purchase.buyerId === currentUser.id ? '#7bf1d6' : 'inherit' }}>
                            {purchase.buyerName} {purchase.buyerId === currentUser.id && '(Tú)'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                          <Calendar className="h-3 w-3" />
                          {purchase.createdAt ? new Date(purchase.createdAt).toLocaleString() : '—'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t pt-4 sm:border-t-0 sm:pt-0 sm:text-right">
                    <div className="sm:hidden text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Total Pagado</div>
                    <div>
                      <p className="text-lg font-bold font-mono" style={{ color: '#7bf1d6' }}>
                        ${(purchase.total ?? 0).toLocaleString()}
                      </p>
                      <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'rgba(255,255,255,0.25)' }}>
                        {(purchase.quantity ?? 0)} unidad(es) × ${(purchase.price ?? 0).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Decorative element */}
                <div className="absolute right-0 top-0 h-full w-1 bg-gradient-to-b from-transparent via-[#7bf1d6]/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
