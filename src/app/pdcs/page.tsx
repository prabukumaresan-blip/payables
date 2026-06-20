'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { format, parseISO, addDays } from 'date-fns';
import AppLayout from '@/components/layout/AppLayout';
import { getPdcs, updatePdcStatus } from '@/lib/supabase/queries';
import { Payable, PDC } from '@/lib/supabase/mockDb';
import { formatOMR } from '@/lib/utils/formatCurrency';
import { 
  Receipt, 
  Check, 
  ChevronDown, 
  Calendar,
  AlertTriangle,
  ArrowUpRight,
  Filter
} from 'lucide-react';
import { cn } from '@/lib/utils';

import { Suspense } from 'react';

function PdcsContent() {
  const [pdcPayables, setPdcPayables] = useState<Payable[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  
  // Track open popovers
  const [activePopoverId, setActivePopoverId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const list = await getPdcs({ status: statusFilter });
      setPdcPayables(list);
    } catch (e) {
      console.error('Error loading PDCs:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const handleStatusChange = async (payableId: string, status: PDC['status']) => {
    setUpdatingId(payableId);
    try {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      await updatePdcStatus(payableId, status, status === 'cleared' || status === 'presented' ? todayStr : null);
      await loadData();
      setActivePopoverId(null);
    } catch (e) {
      console.error('Error updating PDC status:', e);
    } finally {
      setUpdatingId(null);
    }
  };

  const statusStyles = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200/50 hover:bg-amber-100/50',
    presented: 'bg-blue-50 text-blue-700 border-blue-200/50 hover:bg-blue-100/50',
    cleared: 'bg-emerald-50 text-emerald-700 border-emerald-200/50 hover:bg-emerald-100/50',
    bounced: 'bg-rose-50 text-rose-700 border-rose-200/50 hover:bg-rose-100/50',
  };

  return (
    <AppLayout title="Post-Dated Cheque (PDC) Tracker">
      <div className="space-y-6">
        {/* Filter Bar */}
        <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <Filter className="h-4.5 w-4.5 text-indigo-600" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 mr-2">Filter Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs text-slate-800 outline-none cursor-pointer focus:border-indigo-500"
          >
            <option value="all">All PDCs</option>
            <option value="pending">Pending</option>
            <option value="presented">Presented</option>
            <option value="cleared">Cleared</option>
            <option value="bounced">Bounced</option>
          </select>
        </div>

        {/* PDCs Table */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="space-y-4 p-8 animate-pulse">
              <div className="h-8 rounded bg-slate-100 w-full" />
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-12 rounded bg-slate-100 w-full" />
              ))}
            </div>
          ) : pdcPayables.length === 0 ? (
            <div className="py-20 text-center text-slate-400">
              <p className="text-sm">No Post-Dated Cheques found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto min-h-[300px]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                    <th className="py-3.5 px-6">Cheque No.</th>
                    <th className="py-3.5 px-6">Bank Name</th>
                    <th className="py-3.5 px-6">Payee / Vendor</th>
                    <th className="py-3.5 px-6">Cheque Date</th>
                    <th className="py-3.5 px-6 text-right">Amount</th>
                    <th className="py-3.5 px-6">PDC Status</th>
                    <th className="py-3.5 px-6">Presented Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                  {pdcPayables.map((payable) => {
                    const pdc = payable.pdc;
                    if (!pdc || !pdc.cheque_date || !pdc.cheque_no) return null;
                    const isBounced = pdc.status === 'bounced';
                    return (
                      <tr key={payable.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-4 px-6 font-numeric font-bold text-slate-900 flex items-center gap-2">
                          <Receipt className="h-4 w-4 text-indigo-600 shrink-0" />
                          {pdc.cheque_no}
                        </td>
                        <td className="py-4 px-6 text-slate-550">{pdc.bank_name || '—'}</td>
                        <td className="py-4 px-6 text-slate-600 font-medium">{payable.vendor_name || '—'}</td>
                        <td className="py-4 px-6 text-slate-550">
                          <div className="flex flex-col">
                            <span>{format(parseISO(pdc.cheque_date), 'dd MMM yyyy')}</span>
                            {(() => {
                              if (pdc.status === 'cleared' || pdc.status === 'presented') return null;
                              const todayStr = format(new Date(), 'yyyy-MM-dd');
                              const rDays = pdc.reminder_days !== undefined && pdc.reminder_days !== null ? pdc.reminder_days : 3;
                              const alertLimitStr = format(addDays(new Date(), rDays), 'yyyy-MM-dd');
                              const isAlert = pdc.cheque_date >= todayStr && pdc.cheque_date <= alertLimitStr;
                              if (!isAlert) return null;
                              const daysLeft = Math.ceil(
                                (new Date(pdc.cheque_date).getTime() - new Date(todayStr).getTime()) / (1000 * 60 * 60 * 24)
                              );
                              return (
                                <span className="text-[10px] text-orange-600 font-bold flex items-center gap-0.5 mt-0.5">
                                  <AlertTriangle className="h-3 w-3 shrink-0 animate-pulse" />
                                  Action Alert ({daysLeft === 0 ? 'Today' : daysLeft === 1 ? '1 day left' : `${daysLeft} days left`})
                                </span>
                              );
                            })()}
                          </div>
                        </td>
                        <td className="py-4 px-6 font-bold text-slate-900 text-right font-numeric">
                          {formatOMR(payable.amount)}
                        </td>
                        <td className="py-4 px-6">
                          <div className="relative inline-block">
                            <button
                              disabled={updatingId === payable.id}
                              onClick={() => setActivePopoverId(activePopoverId === pdc.id ? null : pdc.id)}
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50",
                                statusStyles[pdc.status]
                              )}
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-current" />
                              {pdc.status}
                              <ChevronDown className="h-3 w-3 opacity-60" />
                            </button>

                            {/* Dropdown popup centered modal */}
                            {activePopoverId === pdc.id && (
                              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                                {/* Backdrop */}
                                <div 
                                  onClick={() => setActivePopoverId(null)}
                                  className="fixed inset-0 bg-black/40 backdrop-blur-sm"
                                />

                                {/* Modal Card */}
                                <div className="relative w-full max-w-xs bg-white border border-slate-200 rounded-2xl p-5 shadow-2xl transition-all">
                                  <div className="flex items-center justify-between mb-3.5 pb-2 border-b border-slate-100">
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                      Set PDC Status
                                    </p>
                                    <button 
                                      onClick={() => setActivePopoverId(null)}
                                      className="text-slate-400 hover:text-slate-600 text-[10px] font-bold uppercase tracking-wider"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                  <div className="space-y-1">
                                    {(['pending', 'presented', 'cleared', 'bounced'] as const).map((st) => (
                                      <button
                                        key={st}
                                        onClick={() => handleStatusChange(payable.id, st)}
                                        className={cn(
                                          "flex w-full items-center justify-between rounded px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-slate-50 text-left capitalize",
                                          pdc.status === st ? "text-indigo-600 font-bold" : "text-slate-600"
                                        )}
                                      >
                                        {st}
                                        {pdc.status === st && <Check className="h-3.5 w-3.5" />}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-6 text-slate-500">
                          {pdc.presented_date ? format(parseISO(pdc.presented_date), 'dd MMM yyyy') : '—'}
                          {isBounced && (
                            <span className="text-rose-600 font-semibold text-xs flex items-center gap-1 mt-0.5">
                              <AlertTriangle className="h-3.5 w-3.5" /> Bounced Cheque!
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

export default function PdcsPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-slate-900">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    }>
      <PdcsContent />
    </Suspense>
  );
}

