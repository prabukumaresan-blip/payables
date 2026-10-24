import React from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string;
  subtext?: string;
  icon: LucideIcon;
  iconColor?: string;
  highlightColor?: 'default' | 'rose' | 'green' | 'amber' | 'indigo';
}

export default function KPICard({
  title,
  value,
  subtext,
  icon: Icon,
  iconColor = 'text-slate-400',
  highlightColor = 'default'
}: KPICardProps) {
  const borderClasses = {
    default: 'border-slate-200/90 bg-white hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5',
    rose: 'border-slate-200/90 bg-white hover:border-rose-200 hover:shadow-md hover:-translate-y-0.5',
    green: 'border-slate-200/90 bg-white hover:border-emerald-200 hover:shadow-md hover:-translate-y-0.5',
    amber: 'border-slate-200/90 bg-white hover:border-amber-200 hover:shadow-md hover:-translate-y-0.5',
    indigo: 'border-slate-200/90 bg-white hover:border-indigo-200 hover:shadow-md hover:-translate-y-0.5',
  };

  const topBarClasses = {
    default: 'bg-slate-300',
    rose: 'bg-rose-500',
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
    indigo: 'bg-slate-900',
  };

  const titleClasses = {
    default: 'text-slate-400',
    rose: 'text-rose-600',
    green: 'text-emerald-700',
    amber: 'text-amber-700',
    indigo: 'text-slate-600',
  };

  const iconBgClasses = {
    default: 'bg-slate-100 text-slate-600 border border-slate-200/60',
    rose: 'bg-rose-50 text-rose-600 border border-rose-100',
    green: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
    amber: 'bg-amber-50 text-amber-600 border border-amber-100',
    indigo: 'bg-slate-100 text-slate-800 border border-slate-200/60',
  };

  return (
    <div className={cn(
      "rounded-2xl border p-5 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)] relative overflow-hidden transition-all duration-200 group",
      borderClasses[highlightColor]
    )}>
      {/* Top Accent Line */}
      <div className={cn("absolute top-0 left-0 right-0 h-1", topBarClasses[highlightColor])} />

      {/* Top section: Title & Icon */}
      <div className="flex items-center justify-between mb-3.5 mt-0.5">
        <span className={cn("text-[10px] font-bold uppercase tracking-wider", titleClasses[highlightColor])}>
          {title}
        </span>
        <div className={cn("rounded-xl p-2.5 transition-transform duration-200 group-hover:scale-105 shadow-2xs", iconBgClasses[highlightColor])}>
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>

      {/* Main section: Value & Subtext */}
      <div>
        <h3 className="text-2xl font-bold tracking-tight text-slate-900 font-numeric font-sans">
          {value}
        </h3>
        {subtext && (
          <p className="text-[11px] font-medium text-slate-400 mt-1.5 flex items-center gap-1.5">
            {subtext}
          </p>
        )}
      </div>

      {/* Decorative gradient overlay */}
      <div className="absolute top-0 right-0 h-20 w-20 bg-slate-100/40 rounded-full blur-xl pointer-events-none" />
    </div>
  );
}
