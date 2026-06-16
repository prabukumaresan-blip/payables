'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import Papa from 'papaparse';
import AppLayout from '@/components/layout/AppLayout';
import StatusBadge from '@/components/payables/StatusBadge';
import PayableForm from '@/components/payables/PayableForm';
import { getPayables, getCategories, deletePayable, updatePayableStatus } from '@/lib/supabase/queries';
import { Payable, Category } from '@/lib/supabase/mockDb';
import { formatOMR } from '@/lib/utils/formatCurrency';
import { 
  Building2, 
  Home, 
  Landmark, 
  Receipt, 
  Wallet, 
  Scale, 
  MoreHorizontal, 
  Search, 
  Filter, 
  Download, 
  Plus, 
  Edit3, 
  Trash2, 
  CheckCircle, 
  ChevronUp, 
  ChevronDown, 
  X, 
  FileText,
  AlertTriangle
} from 'lucide-react';

import { Suspense } from 'react';

function PayablesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Filters State
  const selectedMonth = searchParams.get('month') || format(new Date(), 'yyyy-MM');
  const [categories, setCategories] = useState<Category[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [loading, setLoading] = useState(true);

  const [categoryIdFilter, setCategoryIdFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Bulk Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Pagination & Sorting
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;
  const [sortField, setSortField] = useState<keyof Payable>('due_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Sheet (Slide-over drawer) State
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingPayable, setEditingPayable] = useState<Payable | null>(null);

  // Deletion State for Multi-Occurrence
  const [deleteTarget, setDeleteTarget] = useState<Payable | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Load Data
  const loadData = async () => {
    setLoading(true);
    try {
      const cats = await getCategories();
      const list = await getPayables(selectedMonth, {
        categoryId: categoryIdFilter,
        status: statusFilter,
        search: searchQuery
      });
      setCategories(cats);
      setPayables(list);
      setSelectedIds([]); // Clear selection
    } catch (e) {
      console.error('Error loading payables:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedMonth, categoryIdFilter, statusFilter, searchQuery]);

  // Handle Sort
  const handleSort = (field: keyof Payable) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Sort & Filter Logic
  const sortedPayables = React.useMemo(() => {
    return [...payables].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      // Handle null cases
      if (valA === null || valA === undefined) return sortDirection === 'asc' ? 1 : -1;
      if (valB === null || valB === undefined) return sortDirection === 'asc' ? -1 : 1;

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortDirection === 'asc' 
          ? valA.localeCompare(valB) 
          : valB.localeCompare(valA);
      }

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }

      return 0;
    });
  }, [payables, sortField, sortDirection]);

  // Paginated Payables
  const paginatedPayables = React.useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedPayables.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedPayables, currentPage]);

  const totalPages = Math.ceil(sortedPayables.length / itemsPerPage);

  // Category Icon Renderer
  const renderCategoryIcon = (iconName: string, color: string) => {
    const icons: Record<string, any> = {
      'building-2': Building2,
      'Building2': Building2,
      'home': Home,
      'Home': Home,
      'landmark': Landmark,
      'Landmark': Landmark,
      'receipt': Receipt,
      'Receipt': Receipt,
      'wallet': Wallet,
      'Wallet': Wallet,
      'scale': Scale,
      'Scale': Scale,
      'more-horizontal': MoreHorizontal,
      'MoreHorizontal': MoreHorizontal,
    };

    const Icon = icons[iconName] || MoreHorizontal;

    const colors: Record<string, string> = {
      blue: 'bg-blue-50 text-blue-700 border-blue-200/50',
      violet: 'bg-violet-50 text-violet-700 border-violet-200/50',
      amber: 'bg-amber-50 text-amber-700 border-amber-200/50',
      orange: 'bg-orange-50 text-orange-700 border-orange-200/50',
      green: 'bg-emerald-50 text-emerald-700 border-emerald-200/50',
      rose: 'bg-rose-50 text-rose-700 border-rose-200/50',
      slate: 'bg-slate-50 text-slate-700 border-slate-200/50',
    };

    return (
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg border ${colors[color] || 'bg-slate-100 text-slate-600'}`}>
        <Icon className="h-4.5 w-4.5" />
      </div>
    );
  };

  // Selection handlers
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(paginatedPayables.map(p => p.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(item => item !== id));
    }
  };

  // Bulk Mark as Paid
  const handleBulkMarkPaid = async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    setLoading(true);
    try {
      for (const id of selectedIds) {
        await updatePayableStatus(id, 'paid', today);
      }
      await loadData();
    } catch (e) {
      console.error('Error in bulk status update:', e);
    } finally {
      setLoading(false);
    }
  };

  // CSV Export using Papa Parse
  const handleExportCSV = () => {
    const targetList = selectedIds.length > 0 
      ? payables.filter(p => selectedIds.includes(p.id)) 
      : payables;

    const exportData = targetList.map((p) => ({
      Title: p.title,
      Category: categories.find(c => c.id === p.category_id)?.name || 'Other',
      Vendor: p.vendor_name || '',
      Amount: p.amount.toFixed(3),
      Currency: p.currency,
      DueDate: p.due_date,
      PaymentDate: p.payment_date || '',
      Status: p.status,
      Recurrence: p.recurrence,
      ReferenceNo: p.reference_no || '',
      BankAccount: p.bank_account || '',
      Notes: p.notes || ''
    }));

    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Payables_Export_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isMultiOccurrence = (payable: Payable) => {
    return (
      (payable.recurrence && payable.recurrence !== 'once') ||
      (payable.pdc_no_of_cheques && payable.pdc_no_of_cheques > 1) ||
      (payable.rent_start_month && payable.rent_start_month !== '')
    );
  };

  const handleDelete = (payable: Payable) => {
    if (isMultiOccurrence(payable)) {
      setDeleteTarget(payable);
      setIsDeleteModalOpen(true);
    } else {
      if (confirm(`Are you sure you want to delete "${payable.title}"?`)) {
        executeDelete(payable.id, false);
      }
    }
  };

  const executeDelete = async (id: string, deleteAll: boolean) => {
    setLoading(true);
    try {
      await deletePayable(id, deleteAll);
      await loadData();
    } catch (e) {
      console.error('Error deleting payable:', e);
    } finally {
      setIsDeleteModalOpen(false);
      setDeleteTarget(null);
      setLoading(false);
    }
  };

  const handleEdit = (payable: Payable) => {
    setEditingPayable(payable);
    setIsSheetOpen(true);
  };

  const handleAddNew = () => {
    setEditingPayable(null);
    setIsSheetOpen(true);
  };

  return (
    <AppLayout title="Payables Management">
      <div className="space-y-6">
        {/* Filters and Actions Bar */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative min-w-[200px] flex-1 md:flex-initial">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search payables or vendors..."
                className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-4 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-500"
              />
            </div>

            {/* Category Filter */}
            <select
              value={categoryIdFilter}
              onChange={(e) => setCategoryIdFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 outline-none cursor-pointer focus:border-indigo-500"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 outline-none cursor-pointer focus:border-indigo-500"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Add New Button & Actions */}
          <div className="flex items-center gap-2.5">
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-2 mr-2">
                <button
                  onClick={handleBulkMarkPaid}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-3.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                >
                  <CheckCircle className="h-4 w-4" /> Mark Paid
                </button>
                <span className="text-xs text-slate-500">{selectedIds.length} selected</span>
              </div>
            )}

            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" /> Export CSV
            </button>

            <button
              onClick={handleAddNew}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-indigo-500/10 hover:bg-indigo-500"
            >
              <Plus className="h-4 w-4" /> Add Payable
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="space-y-4 p-8 animate-pulse">
              <div className="h-8 rounded bg-slate-100 w-full" />
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 rounded bg-slate-100 w-full" />
              ))}
            </div>
          ) : payables.length === 0 ? (
            <div className="py-20 text-center text-slate-400">
              <p className="text-sm">No payables matched your filters in {format(new Date(selectedMonth + '-02'), 'MMMM yyyy')}.</p>
            </div>
          ) : (
            <div className="overflow-x-auto min-h-[300px]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                    <th className="py-3 px-4 w-12 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.length > 0 && selectedIds.length === paginatedPayables.length}
                        onChange={handleSelectAll}
                        className="rounded border-slate-300 bg-transparent text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </th>
                    <th className="py-3 px-3 cursor-pointer select-none" onClick={() => handleSort('category_id')}>
                      <span className="flex items-center gap-1">Cat {sortField === 'category_id' && (sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}</span>
                    </th>
                    <th className="py-3 px-4 cursor-pointer select-none" onClick={() => handleSort('title')}>
                      <span className="flex items-center gap-1">Title {sortField === 'title' && (sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}</span>
                    </th>
                    <th className="py-3 px-4 cursor-pointer select-none" onClick={() => handleSort('vendor_name')}>
                      <span className="flex items-center gap-1">Vendor {sortField === 'vendor_name' && (sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}</span>
                    </th>
                    <th className="py-3 px-4 cursor-pointer select-none text-right" onClick={() => handleSort('amount')}>
                      <span className="flex items-center justify-end gap-1">Amount {sortField === 'amount' && (sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}</span>
                    </th>
                    <th className="py-3 px-4 cursor-pointer select-none" onClick={() => handleSort('due_date')}>
                      <span className="flex items-center gap-1">Due Date {sortField === 'due_date' && (sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}</span>
                    </th>
                    <th className="py-3 px-4 cursor-pointer select-none" onClick={() => handleSort('payment_date')}>
                      <span className="flex items-center gap-1">Paid Date {sortField === 'payment_date' && (sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}</span>
                    </th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Ref No.</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                  {paginatedPayables.map((payable) => {
                    const cat = categories.find(c => c.id === payable.category_id);
                    const isSelected = selectedIds.includes(payable.id);
                    const isOverdue = (payable.status === 'pending' || payable.status === 'partial') && payable.due_date < format(new Date(), 'yyyy-MM-dd');
                    return (
                      <tr key={payable.id} className={`hover:bg-slate-50/50 transition-colors ${isSelected ? 'bg-indigo-50/30' : ''}`}>
                        <td className="py-3 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => handleSelectRow(payable.id, e.target.checked)}
                            className="rounded border-slate-300 bg-transparent text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        </td>
                        <td className="py-3 px-3">
                          {cat && renderCategoryIcon(cat.icon || 'more-horizontal', cat.color || 'slate')}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900 truncate max-w-[350px]" title={payable.title}>
                          {payable.title}
                          {payable.recurrence !== 'once' && (
                            <span className="ml-2 rounded bg-indigo-50 text-indigo-750 text-[9px] font-bold px-1.5 py-0.5 uppercase tracking-wide border border-indigo-100">
                              {payable.recurrence}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-500 truncate max-w-[150px]">{payable.vendor_name || '—'}</td>
                        <td className="py-3 px-4 font-bold text-slate-900 text-right font-numeric">{formatOMR(payable.amount)}</td>
                        <td className="py-3 px-4 text-slate-600">
                          <span className={isOverdue ? 'text-rose-600 font-semibold flex items-center gap-1' : ''}>
                            {format(parseISO(payable.due_date), 'dd MMM yyyy')}
                            {isOverdue && <span title="Overdue Payment!"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /></span>}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500">
                          {payable.payment_date ? format(parseISO(payable.payment_date), 'dd MMM yyyy') : '—'}
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge 
                            payable={payable} 
                            onUpdate={(updated) => {
                              setPayables(prev => prev.map(item => item.id === updated.id ? updated : item));
                            }} 
                            
                          />
                        </td>
                        <td className="py-3 px-4 font-numeric text-xs text-slate-500">{payable.reference_no || '—'}</td>
                        <td className="py-3 px-4 text-right text-slate-400">
                          <div className="flex items-center justify-end gap-1.5">
                            {payable.attachment_url && (
                              <a 
                                href={payable.attachment_url} 
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                                title="View invoice attachment"
                              >
                                <FileText className="h-4 w-4" />
                              </a>
                            )}
                            <button
                              onClick={() => handleEdit(payable)}
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"
                              title="Edit record"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(payable)}
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                              title="Delete record"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Footer */}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
              <span className="text-xs text-slate-500">
                Showing page {currentPage} of {totalPages}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  className="rounded border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  className="rounded border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Centered Modal popup */}
        {isSheetOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop overlay */}
            <div 
              onClick={() => setIsSheetOpen(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" 
            />

            {/* Modal Dialog Card */}
            <div className="relative w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden transition-all duration-200">
              {/* Header */}
              <div className="px-6 py-5 border-b border-slate-150 flex items-center justify-between shrink-0 bg-slate-50/50">
                <h3 className="text-md font-bold text-slate-900 font-sans">
                  {editingPayable ? 'Edit Payable Details' : 'Record Outgoing Payable'}
                </h3>
                <button
                  onClick={() => setIsSheetOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Form Wrapper */}
              <div className="flex-1 overflow-y-auto px-6 py-5">
                <PayableForm 
                  categories={categories}
                  payable={editingPayable}
                  onSuccess={() => {
                    setIsSheetOpen(false);
                    loadData();
                  }}
                  onCancel={() => setIsSheetOpen(false)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Multi-occurrence Deletion Modal */}
        {isDeleteModalOpen && deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop overlay */}
            <div 
              onClick={() => setIsDeleteModalOpen(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" 
            />

            {/* Modal Dialog Card */}
            <div className="relative w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-200 p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 border border-rose-100">
                  <AlertTriangle className="h-5 w-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 font-sans">
                    Delete Recurring Transaction
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    &quot;{deleteTarget.title}&quot; is part of a recurring series or has multiple occurrences. How would you like to delete it?
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2.5 pt-2">
                <button
                  onClick={() => executeDelete(deleteTarget.id, false)}
                  className="w-full flex items-center justify-center rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  Delete Only This Occurrence
                </button>
                <button
                  onClick={() => executeDelete(deleteTarget.id, true)}
                  className="w-full flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-rose-500 shadow-md shadow-rose-500/10 transition-colors"
                >
                  Delete All Occurrences in Series
                </button>
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="w-full flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

export default function PayablesPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-slate-900">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    }>
      <PayablesContent />
    </Suspense>
  );
}

