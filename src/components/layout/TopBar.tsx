'use client';

import React from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { getMonthsList } from '@/lib/utils/dates';
import { Calendar, Search, Menu } from 'lucide-react';
import { format } from 'date-fns';

interface TopBarProps {
  title?: string;
  showMonthSelector?: boolean;
  onMenuClick?: () => void;
}

export default function TopBar({ title, showMonthSelector = true, onMenuClick }: TopBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const currentMonth = searchParams.get('month') || format(new Date(), 'yyyy-MM');
  const months = getMonthsList(12);

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMonth = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    params.set('month', newMonth);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6 text-slate-900">
      {/* Page Title & Hamburger */}
      <div className="flex items-center gap-3 truncate">
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden cursor-pointer shrink-0"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <h1 className="text-lg font-bold tracking-tight text-slate-950 sm:text-xl truncate">
          {title || 'Dashboard'}
        </h1>
      </div>

      {/* Primary Global Filter: Month Picker */}
      <div className="flex items-center gap-4">
        {showMonthSelector && (
          <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 transition-colors focus-within:border-indigo-500">
            <Calendar className="h-4 w-4 text-indigo-600" />
            <select
              value={currentMonth}
              onChange={handleMonthChange}
              className="bg-transparent text-xs font-semibold text-slate-800 outline-none cursor-pointer pr-2"
            >
              {months.map((m) => (
                <option key={m.value} value={m.value} className="bg-white text-slate-800">
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </header>
  );
}
