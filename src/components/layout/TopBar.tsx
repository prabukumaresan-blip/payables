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

  const [zohoStatus, setZohoStatus] = React.useState<{
    configured: boolean;
    syncing: boolean;
    lastSynced?: string;
    message?: string;
  }>({
    configured: true,
    syncing: false
  });

  const checkZohoStatus = async () => {
    try {
      const res = await fetch('/api/zoho/status');
      const data = await res.json();
      setZohoStatus(prev => ({
        ...prev,
        configured: Boolean(data.configured)
      }));
    } catch (e) {
      console.warn('Failed to fetch Zoho status:', e);
    }
  };

  const handleManualSync = async () => {
    if (zohoStatus.syncing) return;
    setZohoStatus(prev => ({ ...prev, syncing: true, message: undefined }));
    try {
      const res = await fetch('/api/zoho/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const timeStr = format(new Date(), 'hh:mm a');
        setZohoStatus(prev => ({
          ...prev,
          syncing: false,
          lastSynced: timeStr,
          message: `Synced ${data.data?.syncedBillsCount || 0} bills & ${data.data?.totalZohoVendors || 0} vendors`
        }));
        router.refresh();
      } else {
        setZohoStatus(prev => ({
          ...prev,
          syncing: false,
          message: data.error || 'Sync failed'
        }));
      }
    } catch (err: any) {
      setZohoStatus(prev => ({
        ...prev,
        syncing: false,
        message: err.message || 'Sync network error'
      }));
    }
  };

  React.useEffect(() => {
    checkZohoStatus();
  }, []);

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

      {/* Global Actions: Zoho Sync Status & Month Picker */}
      <div className="flex items-center gap-3">
        {/* Zoho Sync Live Status Indicator */}
        <div className="hidden md:flex items-center gap-2">
          <button
            onClick={handleManualSync}
            disabled={zohoStatus.syncing}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
              zohoStatus.syncing 
                ? 'bg-blue-50 border-blue-200 text-blue-700' 
                : 'bg-emerald-50/80 border-emerald-200/80 text-emerald-800 hover:bg-emerald-100/80 cursor-pointer shadow-xs'
            }`}
            title="Default: Bank Muscat Corparate Account (3095712000000075328)"
          >
            <span className={`h-2 w-2 rounded-full ${zohoStatus.syncing ? 'bg-blue-500 animate-ping' : 'bg-emerald-500'}`} />
            <span className="font-bold tracking-wide">Zoho Books:</span>
            <span>{zohoStatus.syncing ? 'Syncing...' : (zohoStatus.lastSynced ? `Synced at ${zohoStatus.lastSynced}` : 'Active (Bank Muscat)')}</span>
          </button>
          {zohoStatus.message && (
            <span className="text-[11px] text-slate-500 italic max-w-[200px] truncate" title={zohoStatus.message}>
              {zohoStatus.message}
            </span>
          )}
        </div>

        {/* Primary Global Filter: Month Picker */}
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
