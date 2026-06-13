'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { format, addDays, parseISO, compareAsc } from 'date-fns';
import AppLayout from '@/components/layout/AppLayout';
import KPICard from '@/components/dashboard/KPICard';
import CategoryBreakdown from '@/components/dashboard/CategoryBreakdown';
import MonthlyTrendChart from '@/components/dashboard/MonthlyTrendChart';
import { getPayables, getAllPayables, getCategories } from '@/lib/supabase/queries';
import { Payable, Category } from '@/lib/supabase/mockDb';
import { formatOMR } from '@/lib/utils/formatCurrency';
import { 
  CreditCard, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  Calendar, 
  Plus, 
  History, 
  ArrowUpRight 
} from 'lucide-react';
import Link from 'next/link';

import { Suspense } from 'react';

function DashboardContent() {
  const searchParams = useSearchParams();
  const selectedMonth = searchParams.get('month') || format(new Date(), 'yyyy-MM');

  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [allPayables, setAllPayables] = useState<Payable[]>([]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const cats = await getCategories();
        const curPayables = await getPayables(selectedMonth);
        const all = await getAllPayables();
        
        setCategories(cats);
        setPayables(curPayables);
        setAllPayables(all);
      } catch (e) {
        console.error('Failed to load dashboard data:', e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [selectedMonth]);

  // Compute KPIs
  const totalPayablesAmount = payables.reduce((sum, p) => sum + p.amount, 0);
  
  const totalPaidAmount = payables
    .reduce((sum, p) => {
      if (p.status === 'paid') return sum + p.amount;
      if (p.status === 'partial') return sum + (p.paid_amount || 0);
      return sum;
    }, 0);

  const totalPendingAmount = payables
    .reduce((sum, p) => {
      if (p.status === 'pending' || p.status === 'overdue') return sum + p.amount;
      if (p.status === 'partial') return sum + (p.amount - (p.paid_amount || 0));
      return sum;
    }, 0);

  // Overdue count: due_date < today and status === pending/overdue/partial (or status === overdue)
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const overdueCount = payables.filter(
    (p) => (p.status === 'overdue' || ((p.status === 'pending' || p.status === 'partial') && p.due_date < todayStr))
  ).length;

  // Upcoming due payables (next 7 days)
  const next7DaysStr = format(addDays(new Date(), 7), 'yyyy-MM-dd');
  const upcomingPayables = allPayables
    .filter((p) => {
      return p.status !== 'paid' && p.status !== 'cancelled' && p.due_date >= todayStr && p.due_date <= next7DaysStr;
    })
    .sort((a, b) => compareAsc(parseISO(a.due_date), parseISO(b.due_date)))
    .slice(0, 7);

  // Recent Activity: last 5 records updated/created
  const recentActivity = [...allPayables]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5);

  // PDC Cheque Alerts (upcoming pending cheques within reminder_days offset)
  const upcomingChequeAlerts = React.useMemo(() => {
    return allPayables.filter((p) => {
      if (!p.pdc || p.pdc.status === 'cleared' || p.pdc.status === 'presented') return false;
      const chqDateStr = p.pdc.cheque_date;
      const rDays = p.pdc.reminder_days !== undefined && p.pdc.reminder_days !== null ? p.pdc.reminder_days : 3;
      const alertLimitStr = format(addDays(new Date(), rDays), 'yyyy-MM-dd');
      return chqDateStr >= todayStr && chqDateStr <= alertLimitStr;
    }).sort((a, b) => a.pdc!.cheque_date.localeCompare(b.pdc!.cheque_date));
  }, [allPayables, todayStr]);

  const categoryColorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200/50',
    violet: 'bg-violet-50 text-violet-700 border-violet-200/50',
    amber: 'bg-amber-50 text-amber-700 border-amber-200/50',
    orange: 'bg-orange-50 text-orange-700 border-orange-200/50',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200/50',
    rose: 'bg-rose-50 text-rose-700 border-rose-200/50',
    slate: 'bg-slate-50 text-slate-700 border-slate-200/50',
  };

  return (
    <AppLayout title="Dashboard">
      {loading ? (
        <div className="space-y-6 animate-pulse">
          {/* KPIs Skeleton */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 rounded-xl bg-white border border-slate-100" />
            ))}
          </div>
          {/* Charts Skeleton */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="h-64 rounded-xl bg-white border border-slate-100" />
            <div className="h-64 rounded-xl bg-white border border-slate-100" />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Cheque Alerts */}
          {upcomingChequeAlerts.length > 0 && (
            <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-4 space-y-3 shadow-sm">
              <div className="flex items-center gap-2 text-orange-900">
                <AlertTriangle className="h-5 w-5 text-orange-600 shrink-0" />
                <h3 className="text-sm font-bold uppercase tracking-wider">
                  Cheque Action Alerts ({upcomingChequeAlerts.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {upcomingChequeAlerts.map((p) => {
                  const daysLeft = Math.ceil(
                    (new Date(p.pdc!.cheque_date).getTime() - new Date(todayStr).getTime()) / (1000 * 60 * 60 * 24)
                  );
                  return (
                    <div key={p.id} className="flex items-center justify-between rounded-lg border border-orange-100 bg-white p-3 text-xs">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-850">Cheque #{p.pdc!.cheque_no}</span>
                          <span className="text-slate-400">|</span>
                          <span className="text-slate-500 font-semibold">{p.vendor_name || 'No Vendor'}</span>
                        </div>
                        <p className="text-slate-500 mt-1">
                          Bank: <span className="font-semibold text-slate-700">{p.pdc!.bank_name || '—'}</span>
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-bold text-slate-900 block font-numeric">{formatOMR(p.amount)}</span>
                        <span className="text-[10px] text-orange-600 font-bold mt-0.5 inline-block">
                          {daysLeft === 0 ? 'Due Today' : daysLeft === 1 ? 'Due Tomorrow' : `Due in ${daysLeft} days`} ({format(parseISO(p.pdc!.cheque_date), 'dd MMM')})
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* KPI Row */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <KPICard
              title="Total Payables"
              value={formatOMR(totalPayablesAmount)}
              subtext="Total due in selected month"
              icon={CreditCard}
              iconColor="text-indigo-600"
              highlightColor="indigo"
            />
            <KPICard
              title="Total Paid"
              value={formatOMR(totalPaidAmount)}
              subtext="Successfully cleared payments"
              icon={CheckCircle}
              iconColor="text-emerald-600"
              highlightColor="green"
            />
            <KPICard
              title="Total Pending"
              value={formatOMR(totalPendingAmount)}
              subtext="Remaining amount due"
              icon={Clock}
              iconColor="text-amber-600"
              highlightColor="amber"
            />
            <KPICard
              title="Overdue Items"
              value={String(overdueCount)}
              subtext="Action required immediately"
              icon={AlertTriangle}
              iconColor="text-rose-600"
              highlightColor={overdueCount > 0 ? 'rose' : 'default'}
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <CategoryBreakdown payables={payables} categories={categories} />
            <MonthlyTrendChart allPayables={allPayables} currentMonthYear={selectedMonth} />
          </div>

          {/* Lists Row: Upcoming Due vs Recent Activity */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Upcoming Due (7 Days) */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-indigo-600" />
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                    Upcoming Due (Next 7 Days)
                  </h3>
                </div>
                <Link 
                  href="/payables"
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-500 flex items-center gap-1"
                >
                  View All <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              {upcomingPayables.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No pending payments due in the next 7 days.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {upcomingPayables.map((p) => {
                    const catColor = categories.find((c) => c.id === p.category_id)?.color || 'slate';
                    return (
                      <div key={p.id} className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0">
                        <div className="flex items-center gap-3 truncate">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${categoryColorMap[catColor] || 'bg-slate-100 text-slate-700'}`}>
                            {categories.find((c) => c.id === p.category_id)?.name || 'Other'}
                          </span>
                          <div className="truncate">
                            <p className="text-sm font-medium text-slate-900 truncate">{p.title}</p>
                            <p className="text-xs text-slate-500 truncate">{p.vendor_name || 'No Vendor'}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-slate-900 font-numeric">{formatOMR(p.amount)}</p>
                          <p className="text-[10px] text-rose-600 font-semibold mt-0.5">
                            Due {format(parseISO(p.due_date), 'dd MMM yyyy')}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Recent Activity */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-5">
                <History className="h-5 w-5 text-indigo-600" />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                  Recent Activity
                </h3>
              </div>

              {recentActivity.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No recent activity logged.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {recentActivity.map((p) => (
                    <div key={p.id} className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0">
                      <div>
                        <p className="text-sm font-medium text-slate-900 truncate max-w-[240px]">
                          {p.title}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Status updated to <span className={`capitalize font-semibold ${
                            p.status === 'paid' ? 'text-emerald-600' : 
                            p.status === 'partial' ? 'text-blue-600' :
                            p.status === 'overdue' ? 'text-rose-600' : 'text-amber-600'
                          }`}>{p.status === 'partial' && p.paid_amount ? `partial (${p.paid_amount})` : p.status}</span>
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-slate-900 font-numeric">{formatOMR(p.amount)}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {format(new Date(p.updated_at), 'dd MMM, hh:mm a')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-slate-900">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}

