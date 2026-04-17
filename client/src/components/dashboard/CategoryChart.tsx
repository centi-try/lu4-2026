import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { ItemCategory } from '../../lib/types';
import { categoryMeta } from '../../lib/category-meta';

interface Props {
  data: { category: ItemCategory; count: number }[];
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload?.length) {
    const d = payload[0].payload;
    const meta = categoryMeta[d.category as ItemCategory] || { color: '#7bf1d6', emoji: '📦', label: d.category };
    return (
      <div className="rounded-xl border px-3 py-2 text-sm shadow-xl"
        style={{ background: 'rgba(10,14,22,0.95)', borderColor: 'rgba(255,255,255,0.1)' }}>
        <p className="font-semibold" style={{ color: meta.color }}>{meta.emoji} {meta.label}</p>
        <p style={{ color: 'rgba(255,255,255,0.6)' }}>{d.count} ítem{d.count !== 1 ? 's' : ''}</p>
      </div>
    );
  }
  return null;
};

export function CategoryChart({ data }: Props) {
  return (
    <div className="card-glass rounded-2xl p-5">
      <div className="mb-1">
        <h3 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>Distribución por Categoría</h3>
        <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Cantidad de ítems registrados en cada categoría del sistema de inventario
        </p>
      </div>
      <div className="mt-4 h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barSize={28} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <XAxis dataKey="category" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
              tickFormatter={(v) => categoryMeta[v as ItemCategory]?.label.slice(0, 4) ?? v}
              axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
              {data.map((entry) => (
                <Cell key={entry.category} fill={categoryMeta[entry.category]?.color ?? '#7bf1d6'} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
