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
    default: 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5',
    rose: 'border-rose-200 bg-gradient-to-br from-white to-rose-50/20 hover:border-rose-300 hover:shadow-md hover:-translate-y-0.5',
    green: 'border-emerald-200 bg-gradient-to-br from-white to-emerald-50/20 hover:border-emerald-300 hover:shadow-md hover:-translate-y-0.5',
    amber: 'border-amber-200 bg-gradient-to-br from-white to-amber-50/20 hover:border-amber-300 hover:shadow-md hover:-translate-y-0.5',
    indigo: 'border-indigo-200 bg-gradient-to-br from-white to-indigo-50/20 hover:border-indigo-300 hover:shadow-md hover:-translate-y-0.5',
  };

  const topBarClasses = {
    default: 'bg-slate-200',
    rose: 'bg-rose-500',
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
    indigo: 'bg-indigo-600',
  };

  const titleClasses = {
    default: 'text-slate-500',
    rose: 'text-rose-700',
    green: 'text-emerald-700',
    amber: 'text-amber-700',
    indigo: 'text-indigo-700',
  };

  const iconBgClasses = {
    default: 'bg-slate-100',
    rose: 'bg-rose-100/60',
    green: 'bg-emerald-100/60',
    amber: 'bg-amber-100/60',
    indigo: 'bg-indigo-100/60',
  };

  return (
    <div className={cn(
      "rounded-xl border p-5 shadow-sm relative overflow-hidden transition-all duration-300",
      borderClasses[highlightColor]
    )}>
      {/* Top Accent Line */}
      <div className={cn("absolute top-0 left-0 right-0 h-1", topBarClasses[highlightColor])} />

      {/* Top section: Title & Icon */}
      <div className="flex items-center justify-between mb-3 mt-1">
        <span className={cn("text-xs font-semibold uppercase tracking-wider", titleClasses[highlightColor])}>
          {title}
        </span>
        <div className={cn("rounded-lg p-2 transition-transform duration-300 group-hover:scale-105", iconBgClasses[highlightColor], iconColor)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>

      {/* Main section: Value & Subtext */}
      <div>
        <h3 className="text-2xl font-bold tracking-tight text-slate-900 font-numeric">
          {value}
        </h3>
        {subtext && (
          <p className="text-xs text-slate-500 mt-1">
            {subtext}
          </p>
        )}
      </div>

      {/* Decorative gradient overlay */}
      <div className="absolute top-0 right-0 h-24 w-24 bg-slate-50/[0.1] rounded-full blur-2xl" />
    </div>
  );
}
