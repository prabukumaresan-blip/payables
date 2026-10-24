'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { format, parseISO, addDays } from 'date-fns';
import AppLayout from '@/components/layout/AppLayout';
import { getPdcs, updatePdcStatus } from '@/lib/supabase/queries';
import { Payable, PDC } from '@/lib/supabase/mockDb';
import { formatOMR } from '@/lib/utils/formatCurrency';
import { useCompany } from '@/context/CompanyContext';
import { 
  Receipt, 
  Check, 
  ChevronDown, 
  Calendar,
  AlertTriangle,
  ArrowUpRight,
  Filter,
  Search,
  Building2,
  Clock,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

import { Suspense } from 'react';

function PdcsContent() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const [pdcPayables, setPdcPayables] = useState<Payable[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  
  // Track open popovers
  const [activePopoverId, setActivePopoverId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const companyFilter = selectedCompanyId !== 'ALL' ? selectedCompanyId : undefined;
      const list = await getPdcs({ status: statusFilter, companyId: companyFilter });
      setPdcPayables(list);
    } catch (e) {
      console.error('Error loading PDCs:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, selectedCompanyId]);

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

  // Calculate PDC metrics
  const totalAmount = pdcPayables.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
  const pendingCount = pdcPayables.filter(p => !p.pdc || p.pdc.status === 'pending').length;
  const clearedCount = pdcPayables.filter(p => p.pdc?.status === 'cleared').length;
  const bouncedCount = pdcPayables.filter(p => p.pdc?.status === 'bounced').length;

  // Filtered PDCs based on search query
  const filteredPdcs = pdcPayables.filter(p => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const chequeNo = p.pdc?.cheque_no || p.reference_no || '';
    const vendorName = p.vendor_name || p.title || '';
    const bankName = p.pdc?.bank_name || p.bank_account || '';
    return (
      chequeNo.toLowerCase().includes(q) ||
      vendorName.toLowerCase().includes(q) ||
      bankName.toLowerCase().includes(q) ||
      p.title.toLowerCase().includes(q)
    );
  });

  return (
    <AppLayout title="Post-Dated Cheque (PDC) Tracker" showMonthSelector={false}>
      <div className="space-y-6">
        
        {/* Corporate Summary Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total PDCs</span>
              <div className="rounded-xl p-2 bg-slate-100 text-slate-700">
                <Receipt className="h-4 w-4" />
              </div>
            </div>
            <p className="text-2xl font-bold tracking-tight text-slate-900 font-numeric">{pdcPayables.length}</p>
            <p className="text-[11px] text-slate-400 mt-1 font-mono">{formatOMR(totalAmount)}</p>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Pending / In Hand</span>
              <div className="rounded-xl p-2 bg-amber-50 text-amber-600 border border-amber-100">
                <Clock className="h-4 w-4" />
              </div>
            </div>
            <p className="text-2xl font-bold tracking-tight text-slate-900 font-numeric">{pendingCount}</p>
            <p className="text-[11px] text-amber-600 mt-1">Awaiting presentation</p>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Cleared Cheques</span>
              <div className="rounded-xl p-2 bg-emerald-50 text-emerald-600 border border-emerald-100">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            <p className="text-2xl font-bold tracking-tight text-slate-900 font-numeric">{clearedCount}</p>
            <p className="text-[11px] text-emerald-600 mt-1">Settled & Debited</p>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_3px_0_rgba(15,23,42,0.04)]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700">Bounced / Returned</span>
              <div className="rounded-xl p-2 bg-rose-50 text-rose-600 border border-rose-100">
                <AlertCircle className="h-4 w-4" />
              </div>
            </div>
            <p className="text-2xl font-bold tracking-tight text-slate-900 font-numeric">{bouncedCount}</p>
            <p className="text-[11px] text-rose-600 mt-1">Needs immediate review</p>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search cheques, payee, bank..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-4 text-xs font-medium text-slate-800 placeholder-slate-400 outline-none focus:border-slate-400"
            />
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <Filter className="h-4 w-4 text-slate-400 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none cursor-pointer hover:border-slate-300"
            >
              <option value="all">All PDCs ({pdcPayables.length})</option>
              <option value="pending">Pending ({pendingCount})</option>
              <option value="presented">Presented</option>
              <option value="cleared">Cleared ({clearedCount})</option>
              <option value="bounced">Bounced ({bouncedCount})</option>
            </select>
          </div>
        </div>

        {/* PDCs Table */}
        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
          {loading ? (
            <div className="space-y-4 p-8 animate-pulse">
              <div className="h-8 rounded-xl bg-slate-100 w-full" />
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 rounded-xl bg-slate-100 w-full" />
              ))}
            </div>
          ) : filteredPdcs.length === 0 ? (
            <div className="py-20 text-center text-slate-400">
              <Receipt className="h-10 w-10 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-semibold text-slate-700">No Post-Dated Cheques found.</p>
              <p className="text-xs text-slate-400 mt-1">Try resetting your filter or search query.</p>
            </div>
          ) : (
            <div className="overflow-x-auto min-h-[300px]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-slate-50/70 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                    <th className="py-3.5 px-6">Cheque No.</th>
                    <th className="py-3.5 px-6">Payee / Description</th>
                    <th className="py-3.5 px-6">Corporate Entity</th>
                    <th className="py-3.5 px-6">Bank Name</th>
                    <th className="py-3.5 px-6">Cheque Date</th>
                    <th className="py-3.5 px-6 text-right">Amount</th>
                    <th className="py-3.5 px-6">PDC Status</th>
                    <th className="py-3.5 px-6">Presented Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                  {filteredPdcs.map((payable) => {
                    const pdc = payable.pdc || {
                      id: 'pdc-' + payable.id,
                      payable_id: payable.id,
                      cheque_no: payable.reference_no || '',
                      bank_name: payable.bank_account || null,
                      cheque_date: payable.due_date,
                      presented_date: payable.payment_date || null,
                      status: payable.status === 'paid' ? 'cleared' : 'pending',
                      reminder_days: 3
                    };
                    
                    const chequeDateStr = pdc.cheque_date || payable.due_date;
                    const chequeNumber = pdc.cheque_no && pdc.cheque_no.trim() !== '' 
                      ? pdc.cheque_no 
                      : (payable.reference_no || `CHQ-${payable.id.slice(0, 6).toUpperCase()}`);

                    return (
                      <tr key={payable.id} className="hover:bg-slate-50/60 transition-colors group">
                        <td className="py-3.5 px-6 font-mono font-bold text-slate-900">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-lg bg-indigo-50 border border-indigo-150 flex items-center justify-center text-indigo-650 shrink-0">
                              <Receipt className="h-3.5 w-3.5" />
                            </div>
                            <span>{chequeNumber}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-6">
                          <div>
                            <p className="font-semibold text-slate-900 leading-tight">
                              {payable.vendor_name || payable.title}
                            </p>
                            {payable.vendor_name && payable.title !== payable.vendor_name && (
                              <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[220px]">
                                {payable.title}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-6">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200/60">
                            <Building2 className="h-2.5 w-2.5" />
                            {payable.company?.short_name || payable.company?.name || 'Bright Flowers'}
                          </span>
                        </td>
                        <td className="py-3.5 px-6 text-xs text-slate-600 font-medium">
                          {pdc.bank_name || payable.bank_account || '—'}
                        </td>
                        <td className="py-3.5 px-6 text-slate-600">
                          <div className="flex flex-col text-xs">
                            <span className="font-medium text-slate-850">
                              {chequeDateStr ? format(parseISO(chequeDateStr), 'dd MMM yyyy') : '—'}
                            </span>
                            {(() => {
                              if (!chequeDateStr || pdc.status === 'cleared' || pdc.status === 'presented') return null;
                              const todayStr = format(new Date(), 'yyyy-MM-dd');
                              const rDays = pdc.reminder_days !== undefined && pdc.reminder_days !== null ? pdc.reminder_days : 3;
                              const alertLimitStr = format(addDays(new Date(), rDays), 'yyyy-MM-dd');
                              const isAlert = chequeDateStr >= todayStr && chequeDateStr <= alertLimitStr;
                              if (!isAlert) return null;
                              const daysLeft = Math.ceil(
                                (new Date(chequeDateStr).getTime() - new Date(todayStr).getTime()) / (1000 * 60 * 60 * 24)
                              );
                              return (
                                <span className="text-[10px] text-amber-600 font-bold flex items-center gap-0.5 mt-0.5">
                                  <AlertTriangle className="h-3 w-3 shrink-0 animate-pulse" />
                                  Action Alert ({daysLeft === 0 ? 'Due Today' : daysLeft === 1 ? '1 day left' : `${daysLeft} days left`})
                                </span>
                              );
                            })()}
                          </div>
                        </td>
                        <td className="py-3.5 px-6 font-bold text-slate-900 text-right font-numeric font-mono text-xs">
                          {formatOMR(payable.amount)}
                        </td>
                        <td className="py-3.5 px-6">
                          <div className="relative inline-block">
                            <button
                              disabled={updatingId === payable.id}
                              onClick={() => setActivePopoverId(activePopoverId === pdc.id ? null : pdc.id)}
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50",
                                statusStyles[pdc.status as keyof typeof statusStyles] || statusStyles.pending
                              )}
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-current" />
                              {pdc.status}
                              <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
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
                        <td className="py-3.5 px-6 text-xs text-slate-500">
                          {pdc.presented_date ? format(parseISO(pdc.presented_date), 'dd MMM yyyy') : '—'}
                          {pdc.status === 'bounced' && (
                            <span className="text-rose-600 font-semibold text-[10px] flex items-center gap-1 mt-0.5">
                              <AlertTriangle className="h-3 w-3" /> Bounced Cheque!
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

