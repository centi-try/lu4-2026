import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: LucideIcon;
  accentColor: string;
  trend?: string;
}

export function KpiCard({ title, value, subtitle, icon: Icon, accentColor, trend }: KpiCardProps) {
  return (
    <div className="card-glass rounded-2xl p-5 flex flex-col gap-4 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full opacity-20 blur-2xl" style={{ background: accentColor }} />
      
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `${accentColor}18`, border: `1px solid ${accentColor}30` }}>
          <Icon className="h-5 w-5" style={{ color: accentColor }} />
        </div>
        {trend && (
          <span className="text-xs font-medium px-2 py-1 rounded-full" style={{ background: 'rgba(123,241,214,0.1)', color: '#7bf1d6' }}>
            {trend}
          </span>
        )}
      </div>

      <div>
        <p className="text-3xl font-bold tracking-tight font-mono" style={{ color: 'rgba(255,255,255,0.95)' }}>{value}</p>
        <p className="mt-1 text-sm font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>{title}</p>
        <p className="mt-0.5 text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{subtitle}</p>
      </div>
    </div>
  );
}
