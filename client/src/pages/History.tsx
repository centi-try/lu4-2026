import React, { useState } from 'react';
import { CheckCircle, ImageIcon, Plus, Pencil, Trash2, Shield, Search, Filter, DollarSign } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { useApp } from '../contexts/AppContext';
import type { AuditLog } from '../lib/types';

const actionMeta: Record<string, { icon: React.ElementType; color: string; label: string; desc: string }> = {
  // Acciones del cliente (nombres en español/snake_case)
  CREATED_ITEM:    { icon: Plus,        color: '#7bf1d6', label: 'Creó ítem',        desc: 'Nuevo ítem registrado en el sistema' },
  CONFIRMED_ITEM:  { icon: CheckCircle, color: '#34d399', label: 'Confirmó ítem',    desc: 'Ítem confirmado y bloqueado para Mapper' },
  CORRECTED_IMAGE: { icon: ImageIcon,   color: '#e879f9', label: 'Corrigió imagen',  desc: 'Imagen del ítem reemplazada por Super Admin' },
  UPDATED_PRICE:   { icon: Pencil,      color: '#fbbf24', label: 'Actualizó precio', desc: 'Precio del ítem modificado' },
  UPDATED_ITEM:    { icon: Pencil,      color: '#60a5fa', label: 'Actualizó ítem',   desc: 'Datos del ítem modificados' },
  DELETED_ITEM:    { icon: Trash2,      color: '#f87171', label: 'Eliminó ítem',     desc: 'Ítem eliminado del inventario' },
  SOLD_ITEM:       { icon: DollarSign,  color: '#a78bfa', label: 'Vendió ítem',      desc: 'Ítem vendido con ganancia distribuida' },
  CYCLE_STARTED:   { icon: CheckCircle, color: '#7bf1d6', label: 'Inició ciclo',     desc: 'Nuevo ciclo de ventas iniciado' },
  CYCLE_CLOSED:    { icon: CheckCircle, color: '#34d399', label: 'Cerró ciclo',      desc: 'Ciclo de ventas cerrado y historial guardado' },
  // Acciones del servidor (nombres en inglés/SCREAMING_SNAKE_CASE)
  CREATE_ITEM:     { icon: Plus,        color: '#7bf1d6', label: 'Creó ítem',        desc: 'Nuevo ítem registrado en el sistema' },
  CONFIRM_ITEM:    { icon: CheckCircle, color: '#34d399', label: 'Confirmó ítem',    desc: 'Ítem confirmado y bloqueado para Mapper' },
  DELETE_ITEM:     { icon: Trash2,      color: '#f87171', label: 'Eliminó ítem',     desc: 'Ítem eliminado del inventario' },
  SELL_ITEM:       { icon: DollarSign,  color: '#a78bfa', label: 'Vendió ítem',      desc: 'Ítem vendido con ganancia distribuida' },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Ahora mismo';
  if (m < 60) return `Hace ${m} minuto${m !== 1 ? 's' : ''}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Hace ${h} hora${h !== 1 ? 's' : ''}`;
  return `Hace ${Math.floor(h / 24)} día${Math.floor(h / 24) !== 1 ? 's' : ''}`;
}

function LogRow({ log }: { log: AuditLog }) {
  const meta = actionMeta[log.action] ?? { icon: Pencil, color: '#7bf1d6', label: log.action, desc: '' };
  const Icon = meta.icon;

  return (
    <div className="flex gap-4 border-b py-4 last:border-b-0" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
      {/* Icon */}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl mt-0.5"
        style={{ background: `${meta.color}15`, border: `1px solid ${meta.color}25` }}>
        <Icon className="h-4 w-4" style={{ color: meta.color }} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>{log.actorName}</span>
          {log.actorRole === 'SUPER_ADMIN' && (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
              style={{ background: 'rgba(123,241,214,0.1)', color: '#7bf1d6', border: '1px solid rgba(123,241,214,0.2)' }}>
              <Shield className="h-2.5 w-2.5" /> Super Admin
            </span>
          )}
          <span className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ background: `${meta.color}12`, color: meta.color }}>
            {meta.label}
          </span>
        </div>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>{log.detail}</p>
        <div className="mt-1 flex items-center gap-3">
          <span className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.25)' }}>{timeAgo(log.createdAt)}</span>
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>Ítem: {log.itemName}</span>
        </div>
      </div>

      {/* Time */}
      <div className="shrink-0 text-right hidden sm:block">
        <p className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {new Date(log.createdAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
        </p>
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
          {new Date(log.createdAt).toLocaleDateString('es-CL')}
        </p>
      </div>
    </div>
  );
}

export default function History() {
  const { auditLogs } = useApp();
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');

  const filtered = auditLogs.filter(log => {
    const q = search.toLowerCase();
    return (
      (!q || log.actorName.toLowerCase().includes(q) || log.itemName.toLowerCase().includes(q) || log.detail.toLowerCase().includes(q)) &&
      (actionFilter === 'ALL' || log.action === actionFilter) &&
      (roleFilter === 'ALL' || log.actorRole === roleFilter)
    );
  });

  return (
    <AppShell>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gradient">Historial de Acciones</h2>
        <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Registro completo e inmutable de todas las acciones realizadas sobre el inventario,
          incluyendo ciclos de ventas cerrados. Cada entrada identifica al actor, su rol, la acción ejecutada y el ítem afectado.
        </p>
      </div>

      <div className="card-glass rounded-2xl">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 border-b p-5" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="flex h-9 items-center gap-2 rounded-xl border px-3 flex-1 min-w-[160px]"
            style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
            <Search className="h-3.5 w-3.5 shrink-0" style={{ color: 'rgba(255,255,255,0.35)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por actor, ítem o detalle..." className="bg-transparent text-xs outline-none w-full"
              style={{ color: 'rgba(255,255,255,0.8)' }} />
          </div>
          <select value={actionFilter} onChange={e => setActionFilter(e.target.value)}
            className="h-9 rounded-xl border px-3 text-xs outline-none"
            style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }}>
            <option value="ALL">Todas las acciones</option>
            {Object.entries(actionMeta).map(([key, m]) => (
              <option key={key} value={key}>{m.label}</option>
            ))}
          </select>
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
            className="h-9 rounded-xl border px-3 text-xs outline-none"
            style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }}>
            <option value="ALL">Todos los roles</option>
            <option value="SUPER_ADMIN">⚡ Super Admin</option>
            <option value="MAPPER">🗺️ Mapper</option>
          </select>
          <span className="text-xs px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.4)' }}>
            {filtered.length} registros
          </span>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 gap-3 border-b p-5 sm:grid-cols-4 lg:grid-cols-6 overflow-x-auto" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          {Object.entries(actionMeta).map(([key, m]) => {
            const count = auditLogs.filter(l => l.action === key).length;
            return (
              <div key={key} className="flex items-center gap-3 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={{ background: `${m.color}12` }}>
                  <m.icon className="h-3.5 w-3.5" style={{ color: m.color }} />
                </div>
                <div>
                  <p className="text-lg font-bold font-mono" style={{ color: m.color }}>{count}</p>
                  <p className="text-xs leading-none" style={{ color: 'rgba(255,255,255,0.35)' }}>{m.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Log list */}
        <div className="px-5 overflow-y-auto" style={{ maxHeight: 600 }}>
          {filtered.length === 0 ? (
            <p className="py-12 text-center text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
              No se encontraron registros con los filtros aplicados
            </p>
          ) : (
            filtered.map(log => <LogRow key={log.id} log={log} />)
          )}
        </div>
      </div>
    </AppShell>
  );
}
