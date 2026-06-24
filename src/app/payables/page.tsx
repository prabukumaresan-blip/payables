'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import Papa from 'papaparse';
import AppLayout from '@/components/layout/AppLayout';
import StatusBadge from '@/components/payables/StatusBadge';
import PayableForm from '@/components/payables/PayableForm';
import { getPayables, getCategories, deletePayable, updatePayableStatus, getAllPayables, getVendors, updatePayable, getEmployees, getLandowners, addPaymentRecord } from '@/lib/supabase/queries';
import { Payable, Category, Vendor, Employee, Landowner } from '@/lib/supabase/mockDb';
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
  AlertTriangle,
  Zap,
  Upload,
  FileSpreadsheet,
  Loader2
} from 'lucide-react';
import { 
  parsePaymentFile, 
  matchPaymentRows, 
  generatePaymentExcelFile,
  generateUniqueExportId,
  ParsedPaymentRow,
  MatchedPaymentResult
} from '@/lib/utils/fileUtils';
import { cn } from '@/lib/utils';

import { Suspense } from 'react';

function PayablesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Filters State
  const selectedMonth = searchParams.get('month') || format(new Date(), 'yyyy-MM');
  const [categories, setCategories] = useState<Category[]>([]);
  const [vendorsList, setVendorsList] = useState<Vendor[]>([]);
  const [employeesList, setEmployeesList] = useState<Employee[]>([]);
  const [landownersList, setLandownersList] = useState<Landowner[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [loading, setLoading] = useState(true);

  // File Import / Export States
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [matchedResults, setMatchedResults] = useState<MatchedPaymentResult[]>([]);
  const [selectedMatchIndices, setSelectedMatchIndices] = useState<number[]>([]);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  // Export fields
  const [debitAccount, setDebitAccount] = useState('0371024323360013');
  const [debitName, setDebitName] = useState('BRIGHT FLOWERS TRADING LLC');
  const [exportRemarks, setExportRemarks] = useState('PAYMENT');
  const [markPaidAfterExport, setMarkPaidAfterExport] = useState(true);
  const [individualRemarks, setIndividualRemarks] = useState<Record<string, string>>({});
  const [exportAmounts, setExportAmounts] = useState<Record<string, string>>({});

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
      const vList = await getVendors();
      const empList = await getEmployees();
      const landList = await getLandowners();
      const list = await getPayables(selectedMonth, {
        categoryId: categoryIdFilter,
        status: statusFilter,
        search: searchQuery
      });
      setCategories(cats);
      setVendorsList(vList);
      setEmployeesList(empList);
      setLandownersList(landList);
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

  useEffect(() => {
    if (isExportOpen) {
      const initialAmounts: Record<string, string> = {};
      payables.forEach(p => {
        if (selectedIds.includes(p.id)) {
          const remaining = Number(p.amount) - Number(p.paid_amount || 0);
          initialAmounts[p.id] = remaining.toFixed(3);
        }
      });
      setExportAmounts(initialAmounts);
    }
  }, [isExportOpen, selectedIds, payables]);

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

  const isOtherBankSelected = React.useMemo(() => {
    const selectedPayables = payables.filter(p => selectedIds.includes(p.id));
    return selectedPayables.some(p => {
      const v = vendorsList.find(vendor => vendor.name === p.vendor_name);
      if (v) return v.bank_type === 'OTHER_BANK';
      const e = employeesList.find(emp => emp.name === p.vendor_name);
      if (e) return e.bank_type === 'OTHER_BANK';
      const l = landownersList.find(land => land.name === p.vendor_name);
      if (l) return l.bank_type === 'OTHER_BANK';
      return false;
    });
  }, [payables, selectedIds, vendorsList, employeesList, landownersList]);

  const isMuscatSelected = React.useMemo(() => {
    const selectedPayables = payables.filter(p => selectedIds.includes(p.id));
    return selectedPayables.some(p => {
      const v = vendorsList.find(vendor => vendor.name === p.vendor_name);
      if (v) return v.bank_type !== 'OTHER_BANK';
      const e = employeesList.find(emp => emp.name === p.vendor_name);
      if (e) return e.bank_type !== 'OTHER_BANK';
      const l = landownersList.find(land => land.name === p.vendor_name);
      if (l) return l.bank_type !== 'OTHER_BANK';
      return true;
    });
  }, [payables, selectedIds, vendorsList, employeesList, landownersList]);

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
      'zap': Zap,
      'Zap': Zap,
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
      cyan: 'bg-cyan-50 text-cyan-700 border-cyan-200/50',
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

  // Excel File Upload & Parsing Handler
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setFileError(null);
    setIsProcessingFile(true);
    try {
      const rows = await parsePaymentFile(file);
      if (rows.length === 0) {
        throw new Error("No CR/DR transactions found in this Excel sheet. Please verify sheet headers.");
      }
      
      const allDBPayables = await getAllPayables();
      const results = matchPaymentRows(rows, allDBPayables);
      setMatchedResults(results);
      
      // Auto-select indices of matched rows that have status 'matched'
      const indicesToSelect = results
        .map((r, idx) => (r.matchStatus === 'matched' || r.matchStatus === 'multiple_matches' ? idx : -1))
        .filter(idx => idx !== -1);
      setSelectedMatchIndices(indicesToSelect);
    } catch (err: any) {
      console.error(err);
      setFileError(err.message || "Failed to parse the file. Ensure it is a valid Excel/CSV spreadsheet.");
      setMatchedResults([]);
    } finally {
      setIsProcessingFile(false);
    }
  };

  // Confirm Import & Save Payments
  const handleConfirmImport = async () => {
    if (selectedMatchIndices.length === 0) return;
    setIsProcessingFile(true);
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      for (const idx of selectedMatchIndices) {
        const result = matchedResults[idx];
        if (result.matchedPayable) {
          if (result.matchedPayable.status === 'paid') {
            await updatePayableStatus(result.matchedPayable.id, 'paid', today);
          } else {
            await addPaymentRecord({
              payable_id: result.matchedPayable.id,
              amount: result.row.amount,
              payment_date: today,
              reference_no: result.row.remarks || null,
              notes: 'Imported via Excel matching'
            });
          }
        }
      }
      await loadData();
      setIsImportOpen(false);
      setImportFile(null);
      setMatchedResults([]);
      setSelectedMatchIndices([]);
    } catch (err) {
      console.error("Error processing imported payments:", err);
    } finally {
      setIsProcessingFile(false);
    }
  };

  // Generate Bank Excel File Download (Splits Muscat & Other Bank and adds Unique ID reference)
  const handleExportFile = async () => {
    if (selectedIds.length === 0) return;
    setIsProcessingFile(true);
    try {
      const selectedPayables = payables.filter(p => selectedIds.includes(p.id));
      const today = format(new Date(), 'yyyy-MM-dd');

      // Helper to check if vendor/employee/landowner bank type is OTHER_BANK
      const isOtherBankVendor = (vendorName: string | null) => {
        if (!vendorName) return false;
        const v = vendorsList.find(vendor => vendor.name === vendorName);
        if (v) return v.bank_type === 'OTHER_BANK';
        const e = employeesList.find(emp => emp.name === vendorName);
        if (e) return e.bank_type === 'OTHER_BANK';
        const l = landownersList.find(land => land.name === vendorName);
        if (l) return l.bank_type === 'OTHER_BANK';
        return false;
      };

      // 1. Split into Bank Muscat and Other Bank buckets
      const muscatPayables = selectedPayables.filter(p => !isOtherBankVendor(p.vendor_name));
      const otherBankPayables = selectedPayables.filter(p => isOtherBankVendor(p.vendor_name));

      const downloadFile = (blob: Blob, filename: string) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 1000);
      };

      // Parse custom amounts
      const parsedCustomAmounts = Object.fromEntries(
        Object.entries(exportAmounts).map(([id, val]) => [id, parseFloat(val) || 0])
      );

      // 2. Export Bank Muscat File
      if (muscatPayables.length > 0) {
        const muscatUniqueId = generateUniqueExportId();
        const { blob, filename } = generatePaymentExcelFile(
          muscatPayables,
          vendorsList,
          employeesList,
          landownersList,
          debitAccount,
          debitName,
          exportRemarks,
          individualRemarks,
          muscatUniqueId,
          parsedCustomAmounts
        );
        downloadFile(blob, filename);

        // Update database/mockDb audit trail
        for (const payable of muscatPayables) {
          const remaining = Number(payable.amount) - Number(payable.paid_amount || 0);
          const exportAmt = parsedCustomAmounts[payable.id] !== undefined ? parsedCustomAmounts[payable.id] : remaining;
          if (markPaidAfterExport && exportAmt > 0.001) {
            await addPaymentRecord({
              payable_id: payable.id,
              amount: exportAmt,
              payment_date: today,
              reference_no: muscatUniqueId,
              notes: 'Paid via file export'
            });
          } else {
            await updatePayable(payable.id, {
              reference_no: muscatUniqueId
            });
          }
        }
      }

      // 3. Export Other Bank File (with sequential delay if both are present)
      if (otherBankPayables.length > 0) {
        if (muscatPayables.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 600));
        }

        const otherBankUniqueId = generateUniqueExportId();
        const { blob, filename } = generatePaymentExcelFile(
          otherBankPayables,
          vendorsList,
          employeesList,
          landownersList,
          debitAccount,
          debitName,
          exportRemarks,
          individualRemarks,
          otherBankUniqueId,
          parsedCustomAmounts
        );
        downloadFile(blob, filename);

        // Update database/mockDb audit trail
        for (const payable of otherBankPayables) {
          const remaining = Number(payable.amount) - Number(payable.paid_amount || 0);
          const exportAmt = parsedCustomAmounts[payable.id] !== undefined ? parsedCustomAmounts[payable.id] : remaining;
          if (markPaidAfterExport && exportAmt > 0.001) {
            await addPaymentRecord({
              payable_id: payable.id,
              amount: exportAmt,
              payment_date: today,
              reference_no: otherBankUniqueId,
              notes: 'Paid via file export'
            });
          } else {
            await updatePayable(payable.id, {
              reference_no: otherBankUniqueId
            });
          }
        }
      }

      await loadData();
      setIsExportOpen(false);
      setSelectedIds([]); // Clear selection
    } catch (err) {
      console.error("Error exporting payment file:", err);
    } finally {
      setIsProcessingFile(false);
    }
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
          <div className="flex items-center flex-wrap gap-2">
            {selectedIds.length > 0 && (
              <div className="flex items-center flex-wrap gap-1.5 mr-1">
                <button
                  onClick={() => { setIndividualRemarks({}); setIsExportOpen(true); }}
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-50 border border-indigo-200 px-2.5 py-1.5 text-xs font-semibold text-indigo-750 hover:bg-indigo-100"
                  title="Pay via File (Export)"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  <span className="hidden sm:inline">Pay via File (Export)</span>
                </button>
                <button
                  onClick={handleBulkMarkPaid}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                  title="Mark Paid"
                >
                  <CheckCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">Mark Paid</span>
                </button>
                <span className="text-xs text-slate-550 whitespace-nowrap">{selectedIds.length} selected</span>
              </div>
            )}

            <button
              onClick={() => setIsImportOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              title="Import Payment File"
            >
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Import Payment File</span>
            </button>

            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              title="Export CSV"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>

            <button
              onClick={handleAddNew}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-indigo-500/10 hover:bg-indigo-500 cursor-pointer"
              title="Add Payable"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Payable</span>
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

        {/* Import Modal */}
        {isImportOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div 
              onClick={() => { if (!isProcessingFile) setIsImportOpen(false); }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" 
            />

            <div className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden transition-all duration-200">
              {/* Header */}
              <div className="px-6 py-5 border-b border-slate-150 flex items-center justify-between shrink-0 bg-slate-50/50">
                <h3 className="text-md font-bold text-slate-900 font-sans flex items-center gap-2">
                  <Upload className="h-5 w-5 text-indigo-600" />
                  Import Vendor Payments File
                </h3>
                <button
                  onClick={() => setIsImportOpen(false)}
                  disabled={isProcessingFile}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                {/* Drag and Drop area */}
                {!importFile ? (
                  <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center bg-slate-50 hover:bg-slate-100/50 transition-colors cursor-pointer relative group">
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="flex flex-col items-center justify-center gap-2.5">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100 group-hover:scale-105 transition-transform">
                        <Upload className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-800">
                          Click to upload or drag Excel file here
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          Accepts .xlsx, .xls, .csv files matching VendorPaymentSample format
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* File details card */}
                    <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
                          <FileSpreadsheet className="h-5.5 w-5.5" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-800 truncate max-w-[280px]">
                            {importFile.name}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {(importFile.size / 1024).toFixed(1)} KB • {matchedResults.length} transaction rows found
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setImportFile(null);
                          setMatchedResults([]);
                          setSelectedMatchIndices([]);
                          setFileError(null);
                        }}
                        disabled={isProcessingFile}
                        className="text-xs font-semibold text-slate-500 hover:text-rose-600 flex items-center gap-1 border border-slate-200 rounded-lg px-2.5 py-1 bg-white hover:bg-slate-50"
                      >
                        Reset File
                      </button>
                    </div>

                    {fileError && (
                      <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3.5 text-xs text-rose-600 flex items-start gap-2.5">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500 mt-0.5" />
                        <div>
                          <p className="font-semibold">Import Error</p>
                          <p className="mt-0.5 leading-relaxed">{fileError}</p>
                        </div>
                      </div>
                    )}

                    {isProcessingFile && (
                      <div className="py-8 flex flex-col items-center justify-center gap-2">
                        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                        <p className="text-xs text-slate-500">Matching with system payables...</p>
                      </div>
                    )}

                    {/* Parsed List Preview */}
                    {!isProcessingFile && matchedResults.length > 0 && (
                      <div className="space-y-2.5">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-semibold text-slate-800">Preview matched transactions</span>
                          <span className="text-slate-500">
                            {selectedMatchIndices.length} of {matchedResults.filter(r => r.matchedPayable).length} matched items selected
                          </span>
                        </div>
                        
                        <div className="border border-slate-200 rounded-xl max-h-[300px] overflow-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                <th className="py-2.5 px-3 w-10 text-center">
                                  <input
                                    type="checkbox"
                                    checked={
                                      selectedMatchIndices.length > 0 &&
                                      selectedMatchIndices.length === matchedResults.filter(r => r.matchedPayable).length
                                    }
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        const allIndices = matchedResults
                                          .map((r, idx) => (r.matchedPayable ? idx : -1))
                                          .filter(idx => idx !== -1);
                                        setSelectedMatchIndices(allIndices);
                                      } else {
                                        setSelectedMatchIndices([]);
                                      }
                                    }}
                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                  />
                                </th>
                                <th className="py-2.5 px-2">Row</th>
                                <th className="py-2.5 px-3">Beneficiary</th>
                                <th className="py-2.5 px-3 text-right">Amount</th>
                                <th className="py-2.5 px-3">Matching Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                              {matchedResults.map((result, idx) => {
                                const isChecked = selectedMatchIndices.includes(idx);
                                const hasPayable = !!result.matchedPayable;
                                
                                // Badge styling based on match status
                                let badgeClass = "bg-slate-100 text-slate-700 border-slate-200";
                                if (result.matchStatus === 'matched') badgeClass = "bg-emerald-50 text-emerald-700 border-emerald-200/50";
                                else if (result.matchStatus === 'already_paid') badgeClass = "bg-blue-50 text-blue-700 border-blue-200/50";
                                else if (result.matchStatus === 'multiple_matches') badgeClass = "bg-amber-50 text-amber-700 border-amber-200/50";
                                else if (result.matchStatus === 'no_match') badgeClass = "bg-rose-50 text-rose-700 border-rose-200/50";

                                return (
                                  <tr 
                                    key={idx} 
                                    className={`hover:bg-slate-50/50 ${isChecked ? 'bg-indigo-50/20' : ''} ${!hasPayable ? 'opacity-60 bg-slate-50/30' : ''}`}
                                  >
                                    <td className="py-3 px-3 text-center">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        disabled={!hasPayable}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            setSelectedMatchIndices(prev => [...prev, idx]);
                                          } else {
                                            setSelectedMatchIndices(prev => prev.filter(item => item !== idx));
                                          }
                                        }}
                                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                      />
                                    </td>
                                    <td className="py-3 px-2 font-mono text-slate-400">#{result.row.rowIndex}</td>
                                    <td className="py-3 px-3 font-semibold text-slate-800">
                                      <div className="truncate max-w-[150px]" title={result.row.name}>{result.row.name}</div>
                                      <div className="text-[10px] text-slate-400 font-mono font-normal">Acc: {result.row.accountNumber || '—'}</div>
                                    </td>
                                    <td className="py-3 px-3 text-right font-bold font-numeric text-slate-900">{formatOMR(result.row.amount)}</td>
                                    <td className="py-3 px-3">
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badgeClass}`}>
                                        {result.matchStatus.replace('_', ' ').toUpperCase()}
                                      </span>
                                      <div className="text-[10px] text-slate-500 mt-0.5 leading-normal max-w-[200px]" title={result.matchReason}>
                                        {result.matchReason}
                                        {result.matchedPayable && (
                                          <span className="block font-medium text-indigo-650 truncate max-w-[200px]">
                                            → Payable: {result.matchedPayable.title}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 shrink-0 bg-slate-50/50">
                <button
                  type="button"
                  onClick={() => setIsImportOpen(false)}
                  disabled={isProcessingFile}
                  className="rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={selectedMatchIndices.length === 0 || isProcessingFile}
                  className="rounded-lg bg-indigo-600 px-5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-indigo-500 shadow-md shadow-indigo-500/10 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isProcessingFile ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Processing...
                    </>
                  ) : (
                    `Confirm & Process ${selectedMatchIndices.length} Payments`
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Export Modal */}
        {isExportOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div 
              onClick={() => setIsExportOpen(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" 
            />

            <div className="relative w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-200">
              {/* Header */}
              <div className="px-6 py-5 border-b border-slate-150 flex items-center justify-between bg-slate-50/50">
                <h3 className="text-md font-bold text-slate-900 font-sans flex items-center gap-2">
                  <Download className="h-5 w-5 text-indigo-600" />
                  Generate Bank Payment File
                </h3>
                <button
                  onClick={() => setIsExportOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-4 text-slate-700">
                <div className={cn(
                  "rounded-xl border p-3.5 text-xs leading-relaxed",
                  isMuscatSelected && isOtherBankSelected
                    ? "border-indigo-100 bg-indigo-50/30 text-indigo-750"
                    : isOtherBankSelected 
                      ? "border-amber-100 bg-amber-50/30 text-amber-900" 
                      : "border-indigo-100 bg-indigo-50/30 text-indigo-750"
                )}>
                  You have selected <span className="font-bold">{selectedIds.length} payable(s)</span> for a total of <span className="font-bold">{formatOMR(Object.values(exportAmounts).reduce((sum, val) => sum + (parseFloat(val) || 0), 0))}</span>.
                  {isMuscatSelected && isOtherBankSelected ? (
                    <span className="block mt-1.5 font-medium">
                      🔀 **Mixed Banks Selected**: This will generate and download **2 separate Excel files**:
                      <span className="block mt-1 pl-3">• **Bank Muscat / Standard format** (6 columns) for Muscat payables</span>
                      <span className="block mt-1 pl-3">• **Other Bank format** (7 columns with BankCode) for non-Muscat payables</span>
                    </span>
                  ) : isOtherBankSelected ? (
                    <span className="block mt-1 font-medium text-amber-800">
                      ⚠️ Note: All selected payables belong to **OTHER BANK** vendors. This will generate 1 Excel file in the **Other Bank** format (7 columns with BankCode).
                    </span>
                  ) : (
                    <span className="block mt-1">
                      This will generate 1 Excel workbook matching the **Bank Muscat / standard** transaction file format (6 columns).
                    </span>
                  )}
                </div>

                {/* Debit Bank Account number */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Corporate Debit Account Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={debitAccount}
                    onChange={(e) => setDebitAccount(e.target.value)}
                    placeholder="e.g. 0371024323360013"
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-855 outline-none focus:border-indigo-500 font-numeric"
                  />
                </div>

                {/* Debit Holder Name */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Corporate Account Holder Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={debitName}
                    onChange={(e) => setDebitName(e.target.value)}
                    placeholder="e.g. BRIGHT FLOWERS TRADING LLC"
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-855 outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Remarks */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    General Payment Remarks
                  </label>
                  <input
                    type="text"
                    value={exportRemarks}
                    onChange={(e) => setExportRemarks(e.target.value)}
                    placeholder="e.g. PAYMENT"
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-855 outline-none focus:border-indigo-500"
                  />
                </div>

                 {/* Individual Vendor Payments Configuration */}
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                    Export Payments & Remarks
                  </label>
                  <p className="text-[11px] text-slate-400 -mt-1 leading-relaxed">
                    Verify/customize the payment amount and individual vendor remarks below.
                  </p>
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {payables.filter(p => selectedIds.includes(p.id)).map((payable) => {
                      const remaining = Number(payable.amount) - Number(payable.paid_amount || 0);
                      return (
                        <div key={payable.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-2 border-b border-slate-50 last:border-b-0">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate" title={payable.vendor_name || payable.title}>
                              {payable.vendor_name || payable.title}
                            </p>
                            <p className="text-[10px] text-slate-400 font-medium">
                              Remaining: {formatOMR(remaining)}
                            </p>
                          </div>
                          
                          <div className="flex items-center gap-2 shrink-0">
                            {/* Amount to Pay */}
                            <div className="space-y-0.5">
                              <span className="block text-[8px] font-bold uppercase tracking-wider text-slate-400">Amt to Pay</span>
                              <input
                                type="number"
                                step="0.001"
                                min="0.001"
                                max={remaining}
                                value={exportAmounts[payable.id] || ''}
                                onChange={(e) => setExportAmounts(prev => ({ ...prev, [payable.id]: e.target.value }))}
                                placeholder="Amount"
                                className="w-24 rounded border border-slate-200 bg-white py-1 px-2 text-xs text-slate-800 outline-none focus:border-indigo-500 font-numeric"
                              />
                            </div>

                            {/* Individual Remarks */}
                            <div className="space-y-0.5">
                              <span className="block text-[8px] font-bold uppercase tracking-wider text-slate-400">Remarks</span>
                              <input
                                type="text"
                                value={individualRemarks[payable.id] || ''}
                                onChange={(e) => setIndividualRemarks(prev => ({ ...prev, [payable.id]: e.target.value }))}
                                placeholder={exportRemarks || 'PAYMENT'}
                                className="w-32 rounded border border-slate-200 bg-white py-1 px-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-500 font-sans"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Mark as Paid Checkbox */}
                <label className="flex items-center gap-2.5 py-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={markPaidAfterExport}
                    onChange={(e) => setMarkPaidAfterExport(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span className="text-xs text-slate-600">
                    Auto-mark selected payables as <span className="font-semibold text-slate-800">PAID</span> after export
                  </span>
                </label>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/50">
                <button
                  type="button"
                  onClick={() => setIsExportOpen(false)}
                  className="rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExportFile}
                  disabled={!debitAccount.trim() || !debitName.trim() || isProcessingFile}
                  className="rounded-lg bg-indigo-600 px-5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-indigo-500 shadow-md shadow-indigo-500/10 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isProcessingFile ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating...
                    </>
                  ) : (
                    'Generate & Download'
                  )}
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

