import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { Character } from '../../lib/types';

interface Props {
  characters: Character[];
}

const COLORS = ['#7bf1d6', '#34d399', '#fbbf24', '#e879f9', '#60a5fa'];

export function EarningsChart({ characters }: Props) {
  const topEarners = characters
    .filter(c => c.totalEarnings > 0)
    .sort((a, b) => b.totalEarnings - a.totalEarnings)
    .slice(0, 8)
    .map(c => ({
      name: c.name.split(' ')[0],
      earnings: c.totalEarnings,
      role: c.role,
    }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload?.length) {
      const d = payload[0].payload;
      return (
        <div className="rounded-xl border px-3 py-2 text-sm shadow-xl"
          style={{ background: 'rgba(10,14,22,0.95)', borderColor: 'rgba(255,255,255,0.1)' }}>
          <p className="font-semibold" style={{ color: '#a78bfa' }}>{d.name}</p>
          <p style={{ color: 'rgba(255,255,255,0.6)' }}>${d.earnings.toLocaleString()}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="card-glass rounded-2xl p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>Top Personajes por Ganancia</h3>
        <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Ranking de mayores ganancias acumuladas por venta de ítems
        </p>
      </div>
      {topEarners.length === 0 ? (
        <p className="text-xs text-center py-8" style={{ color: 'rgba(255,255,255,0.3)' }}>
          Sin ganancias registradas aún
        </p>
      ) : (
        <div className="mt-2 h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topEarners}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" style={{ fontSize: 11 }} />
              <YAxis stroke="rgba(255,255,255,0.3)" style={{ fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="earnings" fill="#a78bfa" radius={[4, 4, 0, 0]}>
                {topEarners.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
