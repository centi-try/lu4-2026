import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { ItemStatus } from '../../lib/types';
import { statusMeta } from '../../lib/category-meta';

interface Props {
  data: { status: ItemStatus; count: number }[];
}

const COLORS: Record<ItemStatus, string> = {
  CONFIRMADO: '#34d399',
  EN_REGISTRO: '#fbbf24',
  VENDIDO: '#a78bfa',
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload?.length) {
    const d = payload[0].payload;
    return (
      <div className="rounded-xl border px-3 py-2 text-sm shadow-xl"
        style={{ background: 'rgba(10,14,22,0.95)', borderColor: 'rgba(255,255,255,0.1)' }}>
        <p className="font-semibold" style={{ color: COLORS[d.status as ItemStatus] }}>
          {statusMeta[d.status as ItemStatus]?.label}
        </p>
        <p style={{ color: 'rgba(255,255,255,0.6)' }}>{d.count} ítems</p>
      </div>
    );
  }
  return null;
};

export function StatusChart({ data }: Props) {
  return (
    <div className="card-glass rounded-2xl p-5">
      <div className="mb-1">
        <h3 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>Estado del Inventario</h3>
        <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Proporción de ítems confirmados vs. en proceso de registro
        </p>
      </div>
      <div className="mt-2 h-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={44} outerRadius={68} paddingAngle={3}>
              {data.map((entry) => (
                <Cell key={entry.status} fill={COLORS[entry.status]} fillOpacity={0.85} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              formatter={(value) => <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>{statusMeta[value as ItemStatus]?.label ?? value}</span>}
              iconType="circle" iconSize={8} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
