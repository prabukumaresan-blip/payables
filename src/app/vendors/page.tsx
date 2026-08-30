'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { format } from 'date-fns';
import AppLayout from '@/components/layout/AppLayout';
import { 
  getVendors, 
  createVendor, 
  updateVendor, 
  deleteVendor, 
  getAllPayables 
} from '@/lib/supabase/queries';
import { Vendor, Payable } from '@/lib/supabase/mockDb';
import { cn } from '@/lib/utils';
import { 
  Building2, 
  Search, 
  Plus, 
  Edit3, 
  Trash2, 
  X, 
  Check, 
  Loader2, 
  AlertTriangle,
  Mail,
  Phone,
  User,
  Landmark,
  CreditCard,
  Upload,
  Download,
  FileText,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Zap,
  Wallet,
  Link2,
  CheckCheck,
  Unlink
} from 'lucide-react';
import { parseVendorImportFile, ParsedVendorRow } from '@/lib/utils/fileUtils';


function VendorsContent() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Zoho Sync State
  const [zohoSyncing, setZohoSyncing] = useState(false);
  const [zohoConfigured, setZohoConfigured] = useState<boolean | null>(null);
  const [zohoSyncMessage, setZohoSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [balanceFilter, setBalanceFilter] = useState<'all' | 'with_balance'>('all');

  // Zoho Match Modal State
  const [matchingVendor, setMatchingVendor] = useState<Vendor | null>(null);
  const [isMatchModalOpen, setIsMatchModalOpen] = useState(false);
  const [zohoContactsList, setZohoContactsList] = useState<any[]>([]);
  const [zohoSearchQuery, setZohoSearchQuery] = useState('');
  const [fetchingZohoContacts, setFetchingZohoContacts] = useState(false);
  const [savingMatch, setSavingMatch] = useState(false);

  // Form Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [swiftCode, setSwiftCode] = useState('');
  const [bankType, setBankType] = useState<'BANK_MUSCAT' | 'OTHER_BANK'>('BANK_MUSCAT');

  // Delete State
  const [deleteTarget, setDeleteTarget] = useState<Vendor | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Import Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedVendorRow[]>([]);
  const [rowActions, setRowActions] = useState<Record<number, 'import' | 'update' | 'skip'>>({});
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [importLoading, setImportLoading] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [importSummary, setImportSummary] = useState<{ imported: number; updated: number; skipped: number } | null>(null);

  // Handle file import parsing and validation
  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    setImportLoading(true);
    setImportSummary(null);
    setImportProgress(null);

    try {
      const rows = await parseVendorImportFile(file);
      
      const initialActions: Record<number, 'import' | 'update' | 'skip'> = {};
      const errors: Record<number, string> = {};

      rows.forEach((row) => {
        if (!row.name || !row.name.trim()) {
          errors[row.rowIndex] = 'Vendor Name is required';
          initialActions[row.rowIndex] = 'skip';
          return;
        }

        if (row.bank_type === 'OTHER_BANK' && (!row.swift_code || !row.swift_code.trim())) {
          errors[row.rowIndex] = 'SWIFT Code is required for OTHER BANK vendors';
          initialActions[row.rowIndex] = 'skip';
          return;
        }

        // Check duplicates against current list of vendors
        const match = vendors.find(v => v.name.toLowerCase().trim() === row.name.toLowerCase().trim());
        if (match) {
          const isIdentical = 
            (match.bank_type === row.bank_type) &&
            ((match.contact_person || '') === (row.contact_person || '')) &&
            ((match.email || '') === (row.email || '')) &&
            ((match.phone || '') === (row.phone || '')) &&
            ((match.bank_name || '') === (row.bank_name || '')) &&
            ((match.account_no || '') === (row.account_no || '')) &&
            ((match.swift_code || '') === (row.swift_code || ''));

          if (isIdentical) {
            initialActions[row.rowIndex] = 'skip';
          } else {
            initialActions[row.rowIndex] = 'update';
          }
        } else {
          initialActions[row.rowIndex] = 'import';
        }
      });

      setParsedRows(rows);
      setRowActions(initialActions);
      setRowErrors(errors);
    } catch (err: any) {
      console.error(err);
      alert('Error parsing Excel file. Please ensure it is a valid format.');
      setImportFile(null);
    } finally {
      setImportLoading(false);
    }
  };

  // Run the batch import
  const handleExecuteImport = async () => {
    setImportLoading(true);
    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    const toProcess = parsedRows.filter(
      row => rowActions[row.rowIndex] === 'import' || rowActions[row.rowIndex] === 'update'
    );

    setImportProgress({ current: 0, total: toProcess.length });

    try {
      let currentProgress = 0;

      for (const row of parsedRows) {
        const action = rowActions[row.rowIndex];
        
        if (action === 'skip') {
          skippedCount++;
          continue;
        }

        const bName = (row.bank_name || '').trim();
        const accNo = (row.account_no || '').trim();
        let combinedBankAcc = null;
        if (bName && accNo) {
          combinedBankAcc = `${bName} - ${accNo}`;
        } else {
          combinedBankAcc = bName || accNo || null;
        }

        const vendorData = {
          name: row.name.trim(),
          contact_person: row.contact_person ? row.contact_person.trim() : null,
          email: row.email ? row.email.trim() : null,
          phone: row.phone ? row.phone.trim() : null,
          bank_name: bName || null,
          account_no: accNo || null,
          swift_code: row.swift_code ? row.swift_code.trim() : null,
          bank_type: row.bank_type,
          bank_account: combinedBankAcc
        };

        if (action === 'update') {
          const existing = vendors.find(v => v.name.toLowerCase().trim() === row.name.toLowerCase().trim());
          if (existing) {
            await updateVendor(existing.id, vendorData);
            updatedCount++;
          } else {
            await createVendor(vendorData);
            importedCount++;
          }
        } else if (action === 'import') {
          await createVendor(vendorData);
          importedCount++;
        }

        currentProgress++;
        setImportProgress({ current: currentProgress, total: toProcess.length });
      }

      setImportSummary({
        imported: importedCount,
        updated: updatedCount,
        skipped: skippedCount
      });

      await loadData();
    } catch (err: any) {
      console.error('Error importing vendors:', err);
      alert('An error occurred during import. Some vendors may have been imported.');
    } finally {
      setImportLoading(false);
      setImportProgress(null);
    }
  };

  const handleCloseImportModal = () => {
    setIsImportModalOpen(false);
    setImportFile(null);
    setParsedRows([]);
    setRowActions({});
    setRowErrors({});
    setImportSummary(null);
    setImportProgress(null);
  };

  // Open Match Modal
  const handleOpenMatchModal = async (vendor: Vendor) => {
    setMatchingVendor(vendor);
    setZohoSearchQuery(vendor.name);
    setIsMatchModalOpen(true);
    setFetchingZohoContacts(true);

    try {
      // Check cached vendors or fetch from sync
      const res = await fetch('/api/zoho/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.data?.vendors) {
        setZohoContactsList(data.data.vendors);
      }
    } catch (e) {
      console.error('Error fetching Zoho contacts for matching:', e);
    } finally {
      setFetchingZohoContacts(false);
    }
  };

  // Link Vendor with Zoho contact
  const handleLinkVendor = async (zohoContact: any) => {
    if (!matchingVendor) return;
    setSavingMatch(true);
    try {
      const outstandingOMR = zohoContact.outstanding_payable_amount_bcy !== undefined && zohoContact.outstanding_payable_amount_bcy !== null
        ? Number(zohoContact.outstanding_payable_amount_bcy)
        : Number(zohoContact.outstanding_payable_amount || zohoContact.balance || 0);

      const unusedCreditsOMR = zohoContact.unused_credits_payable_amount_bcy !== undefined && zohoContact.unused_credits_payable_amount_bcy !== null
        ? Number(zohoContact.unused_credits_payable_amount_bcy)
        : Number(zohoContact.unused_credits_payable_amount || zohoContact.unused_credits || 0);

      const updateData = {
        zoho_contact_id: zohoContact.contact_id || zohoContact.zoho_contact_id,
        outstanding_payable_amount: Number(outstandingOMR.toFixed(3)),
        unused_credits_payable_amount: Number(unusedCreditsOMR.toFixed(3)),
        zoho_last_synced_at: new Date().toISOString()
      };

      await updateVendor(matchingVendor.id, updateData);
      
      // Also update local storage cache if needed
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('payables_tracker_v2_vendors');
        if (stored) {
          const list = JSON.parse(stored);
          const idx = list.findIndex((v: any) => v.id === matchingVendor.id);
          if (idx !== -1) {
            list[idx] = { ...list[idx], ...updateData };
            localStorage.setItem('payables_tracker_v2_vendors', JSON.stringify(list));
          }
        }
      }

      await loadData();
      setIsMatchModalOpen(false);
      setMatchingVendor(null);
    } catch (err: any) {
      console.error('Error linking vendor:', err);
      alert('Failed to link vendor. Please try again.');
    } finally {
      setSavingMatch(false);
    }
  };

  // Unlink Vendor from Zoho
  const handleUnlinkVendor = async () => {
    if (!matchingVendor) return;
    setSavingMatch(true);
    try {
      const updateData = {
        zoho_contact_id: null,
        outstanding_payable_amount: 0,
        unused_credits_payable_amount: 0,
        zoho_last_synced_at: null
      };

      await updateVendor(matchingVendor.id, updateData);

      // Also update local storage cache
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('payables_tracker_v2_vendors');
        if (stored) {
          const list = JSON.parse(stored);
          const idx = list.findIndex((v: any) => v.id === matchingVendor.id);
          if (idx !== -1) {
            list[idx] = { ...list[idx], ...updateData };
            localStorage.setItem('payables_tracker_v2_vendors', JSON.stringify(list));
          }
        }
      }

      await loadData();
      setIsMatchModalOpen(false);
      setMatchingVendor(null);
    } catch (err: any) {
      console.error('Error unlinking vendor:', err);
      alert('Failed to unlink vendor.');
    } finally {
      setSavingMatch(false);
    }
  };

  // Trigger Zoho Books Sync
  const handleZohoSync = async () => {
    setZohoSyncing(true);
    setZohoSyncMessage(null);
    try {
      const res = await fetch('/api/zoho/sync', { method: 'POST' });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to sync with Zoho Books');
      }

      // Save vendors directly in localStorage
      if (typeof window !== 'undefined' && data.data?.vendors) {
        localStorage.setItem('payables_tracker_v2_vendors', JSON.stringify(data.data.vendors));
      }

      setZohoSyncMessage({
        type: 'success',
        text: `Zoho Books Synced! (${data.data.totalZohoVendors} vendors updated, ${data.data.syncedBillsCount} bills synced)`
      });

      await loadData();
    } catch (err: any) {
      console.error('Zoho sync error:', err);
      setZohoSyncMessage({
        type: 'error',
        text: err.message || 'Failed to sync with Zoho Books. Please check API credentials.'
      });
    } finally {
      setZohoSyncing(false);
    }
  };

  // Load Data
  const loadData = async () => {
    setLoading(true);
    try {
      const vList = await getVendors();
      const pList = await getAllPayables();
      setVendors(vList);
      setPayables(pList);

      // Check Zoho configuration status
      try {
        const statRes = await fetch('/api/zoho/status');
        const statData = await statRes.json();
        setZohoConfigured(Boolean(statData.configured));
      } catch (e) {
        console.error('Error checking Zoho status:', e);
      }
    } catch (e) {
      console.error('Error loading vendors data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('zoho_connected') === 'true') {
        setZohoSyncMessage({
          type: 'success',
          text: 'Zoho Books successfully connected! Ready to sync vendor balances.'
        });
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (params.get('zoho_error')) {
        setZohoSyncMessage({
          type: 'error',
          text: `Zoho Connection Error: ${params.get('zoho_error')}`
        });
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, []);

  // Filtered and sorted vendors
  const filteredVendors = vendors
    .filter(v => {
      if (balanceFilter === 'with_balance' && !(Number(v.outstanding_payable_amount) > 0)) {
        return false;
      }
      const query = searchQuery.toLowerCase();
      return (
        v.name.toLowerCase().includes(query) ||
        (v.contact_person && v.contact_person.toLowerCase().includes(query)) ||
        (v.email && v.email.toLowerCase().includes(query)) ||
        (v.bank_name && v.bank_name.toLowerCase().includes(query)) ||
        (v.account_no && v.account_no.toLowerCase().includes(query))
      );
    })
    .sort((a, b) => {
      const balA = Number(a.outstanding_payable_amount) || 0;
      const balB = Number(b.outstanding_payable_amount) || 0;
      if (balB !== balA) return balB - balA; // Highest balance first
      return a.name.localeCompare(b.name);
    });

  // Calculate stats
  const totalVendors = vendors.length;
  const vendorsWithBank = vendors.filter(v => v.account_no && v.bank_name).length;
  const activeVendorNames = new Set(payables.map(p => p.vendor_name).filter(Boolean));
  const activeVendors = vendors.filter(v => activeVendorNames.has(v.name)).length;
  const totalZohoOutstanding = vendors.reduce((acc, v) => acc + (Number(v.outstanding_payable_amount) || 0), 0);

  // Open modal for Create/Edit
  const handleOpenModal = (vendor: Vendor | null = null) => {
    setFormError(null);
    if (vendor) {
      setEditingVendor(vendor);
      setName(vendor.name);
      setContactPerson(vendor.contact_person || '');
      setEmail(vendor.email || '');
      setPhone(vendor.phone || '');
      setBankName(vendor.bank_name || '');
      setAccountNo(vendor.account_no || '');
      setSwiftCode(vendor.swift_code || '');
      setBankType(vendor.bank_type || 'BANK_MUSCAT');
    } else {
      setEditingVendor(null);
      setName('');
      setContactPerson('');
      setEmail('');
      setPhone('');
      setBankName('');
      setAccountNo('');
      setSwiftCode('');
      setBankType('BANK_MUSCAT');
    }
    setIsModalOpen(true);
  };

  // Submit form handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Vendor Name is required');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const bName = bankName.trim();
      const accNo = accountNo.trim();
      let combinedBankAcc = null;
      if (bName && accNo) {
        combinedBankAcc = `${bName} - ${accNo}`;
      } else {
        combinedBankAcc = bName || accNo || null;
      }

      const vendorData = {
        name: name.trim(),
        contact_person: contactPerson.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        bank_name: bName || null,
        account_no: accNo || null,
        swift_code: swiftCode.trim() || null,
        bank_type: bankType,
        bank_account: combinedBankAcc
      };

      if (editingVendor) {
        await updateVendor(editingVendor.id, vendorData);
      } else {
        await createVendor(vendorData);
      }

      await loadData();
      setIsModalOpen(false);
    } catch (err: any) {
      console.error(err);
      setFormError('Failed to save vendor details. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete vendor handler
  const handleDeleteClick = (vendor: Vendor) => {
    setDeleteTarget(vendor);
    setIsDeleteModalOpen(true);
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;
    setLoading(true);
    try {
      await deleteVendor(deleteTarget.id);
      await loadData();
      setIsDeleteModalOpen(false);
      setDeleteTarget(null);
    } catch (err) {
      console.error('Error deleting vendor:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout title="Vendor Directory" showMonthSelector={false}>
      <div className="space-y-6">
        
        {/* Zoho Sync Notification Banner */}
        {zohoSyncMessage && (
          <div className={cn(
            "p-3.5 rounded-xl border flex items-center justify-between text-xs transition-all",
            zohoSyncMessage.type === 'success' 
              ? "bg-emerald-50/80 border-emerald-200 text-emerald-800" 
              : "bg-rose-50/80 border-rose-200 text-rose-800"
          )}>
            <div className="flex items-center gap-2">
              {zohoSyncMessage.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              )}
              <span>{zohoSyncMessage.text}</span>
            </div>
            <button onClick={() => setZohoSyncMessage(null)} className="text-slate-400 hover:text-slate-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-indigo-50 border border-indigo-150 flex items-center justify-center text-indigo-650">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Vendors</p>
              <p className="text-2xl font-bold text-slate-850 mt-1">{totalVendors}</p>
            </div>
          </div>

          <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-emerald-50 border border-emerald-150 flex items-center justify-center text-emerald-650">
              <Landmark className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">With Bank Details</p>
              <p className="text-2xl font-bold text-slate-850 mt-1">{vendorsWithBank}</p>
            </div>
          </div>

          <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-amber-50 border border-amber-150 flex items-center justify-center text-amber-650">
              <CreditCard className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active (This Month)</p>
              <p className="text-2xl font-bold text-slate-850 mt-1">{activeVendors}</p>
            </div>
          </div>

          <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-blue-50 border border-blue-150 flex items-center justify-center text-blue-650">
              <Wallet className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Zoho Outstanding</p>
              <p className="text-2xl font-bold text-slate-850 mt-1">
                OMR {totalZohoOutstanding.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
              </p>
            </div>
          </div>
        </div>

        {/* Filter and Actions Bar */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          {/* Search & Balance Filters */}
          <div className="flex flex-wrap items-center gap-3 flex-1">
            <div className="relative min-w-[280px] flex-1 md:flex-initial">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search vendors by name, bank details, or contact..."
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-500"
              />
            </div>
            
            {/* Quick Balance Filter */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs">
              <button
                type="button"
                onClick={() => setBalanceFilter('all')}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                  balanceFilter === 'all'
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                )}
              >
                All ({vendors.length})
              </button>
              <button
                type="button"
                onClick={() => setBalanceFilter('with_balance')}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors flex items-center gap-1",
                  balanceFilter === 'with_balance'
                    ? "bg-white text-rose-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                )}
              >
                <span>With Balance ({vendors.filter(v => Number(v.outstanding_payable_amount) > 0).length})</span>
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center flex-wrap gap-2">
            {zohoConfigured === false ? (
              <a
                href="/api/zoho/authorize"
                className="flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors cursor-pointer"
                title="Connect your Zoho Books account with 1-click approval"
              >
                <Zap className="h-3.5 w-3.5 text-amber-300" />
                <span>Connect Zoho Books</span>
              </a>
            ) : (
              <button
                onClick={handleZohoSync}
                disabled={zohoSyncing}
                className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2 text-xs font-semibold text-blue-700 shadow-sm hover:bg-blue-100/70 transition-colors cursor-pointer disabled:opacity-50"
                title="Sync vendor balances and unpaid bills from Zoho Books"
              >
                <RefreshCw className={cn("h-3.5 w-3.5 text-blue-600", zohoSyncing && "animate-spin")} />
                <span>{zohoSyncing ? 'Syncing...' : 'Sync Zoho Books'}</span>
              </button>
            )}
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors cursor-pointer"
              title="Import from Excel"
            >
              <Upload className="h-4 w-4 text-slate-500" />
              <span className="hidden sm:inline">Import from Excel</span>
            </button>
            <button
              onClick={() => handleOpenModal(null)}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-500/10 hover:bg-indigo-500 transition-colors cursor-pointer"
              title="Add Vendor"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Vendor</span>
            </button>
          </div>
        </div>

        {/* Vendors Table */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="space-y-4 p-8 animate-pulse">
              <div className="h-8 rounded bg-slate-100 w-full" />
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 rounded bg-slate-100 w-full" />
              ))}
            </div>
          ) : filteredVendors.length === 0 ? (
            <div className="py-20 text-center text-slate-400">
              <p className="text-sm">No vendors found matching your search.</p>
            </div>
          ) : (
            <div className="overflow-x-auto min-h-[300px]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                    <th className="py-3 px-6">Vendor Name</th>
                    <th className="py-3 px-6">Zoho Balance</th>
                    <th className="py-3 px-6">Bank Type</th>
                    <th className="py-3 px-6">Contact Person</th>
                    <th className="py-3 px-6">Contact Info</th>
                    <th className="py-3 px-6">Bank Name</th>
                    <th className="py-3 px-6">Account Number</th>
                    <th className="py-3 px-6">SWIFT Code</th>
                    <th className="py-3 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                  {filteredVendors.map((vendor) => (
                    <tr key={vendor.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5 px-6 font-semibold text-slate-900 truncate max-w-[200px]" title={vendor.name}>
                        <div>
                          {vendor.name}
                          {vendor.zoho_contact_id && (
                            <span className="block text-[10px] text-blue-600 font-normal">
                              Zoho ID: {vendor.zoho_contact_id}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-6 font-semibold">
                        {vendor.outstanding_payable_amount !== undefined && vendor.outstanding_payable_amount !== null ? (
                          <span className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono font-bold",
                            Number(vendor.outstanding_payable_amount) > 0
                              ? "bg-rose-50 text-rose-700 border border-rose-200/60"
                              : "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                          )}>
                            OMR {Number(vendor.outstanding_payable_amount).toFixed(3)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 font-normal">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-6">
                        <span className={cn(
                          "inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold border",
                          vendor.bank_type === 'OTHER_BANK' 
                            ? "bg-amber-50 text-amber-700 border-amber-200/50" 
                            : "bg-indigo-50 text-indigo-700 border-indigo-200/50"
                        )}>
                          {vendor.bank_type === 'OTHER_BANK' ? 'OTHER BANK' : 'BANK MUSCAT'}
                        </span>
                      </td>
                      <td className="py-3.5 px-6 text-slate-600">
                        {vendor.contact_person ? (
                          <span className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-slate-400" />
                            {vendor.contact_person}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-6 text-slate-500">
                        <div className="flex flex-col gap-0.5">
                          {vendor.email && (
                            <span className="flex items-center gap-1 text-xs">
                              <Mail className="h-3 w-3 text-slate-400" />
                              {vendor.email}
                            </span>
                          )}
                          {vendor.phone && (
                            <span className="flex items-center gap-1 text-[11px]">
                              <Phone className="h-3 w-3 text-slate-400" />
                              {vendor.phone}
                            </span>
                          )}
                          {!vendor.email && !vendor.phone && <span className="text-slate-400">—</span>}
                        </div>
                      </td>
                      <td className="py-3.5 px-6 text-slate-700 font-medium">
                        {vendor.bank_name || <span className="text-slate-400 font-normal">—</span>}
                      </td>
                      <td className="py-3.5 px-6 font-mono text-xs text-slate-800">
                        {vendor.account_no || <span className="text-slate-400 font-normal font-sans">—</span>}
                      </td>
                      <td className="py-3.5 px-6 font-mono text-xs font-semibold text-slate-750">
                        {vendor.swift_code || <span className="text-slate-400 font-normal font-sans">—</span>}
                      </td>
                      <td className="py-3.5 px-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenMatchModal(vendor)}
                            className={cn(
                              "rounded p-1.5 transition-colors",
                              vendor.zoho_contact_id 
                                ? "text-blue-600 hover:bg-blue-50" 
                                : "text-slate-400 hover:bg-slate-100 hover:text-blue-600"
                            )}
                            title={vendor.zoho_contact_id ? "Rematch / Unlink Zoho Vendor" : "Match with Zoho Vendor"}
                          >
                            <Link2 className="h-4.5 w-4.5" />
                          </button>
                          <button
                            onClick={() => handleOpenModal(vendor)}
                            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-655 transition-colors"
                            title="Edit Vendor"
                          >
                            <Edit3 className="h-4.5 w-4.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteClick(vendor)}
                            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600 transition-colors"
                            title="Delete Vendor"
                          >
                            <Trash2 className="h-4.5 w-4.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Create/Edit Modal popup */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop overlay */}
            <div 
              onClick={() => { if (!submitting) setIsModalOpen(false); }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" 
            />

            {/* Modal Dialog Card */}
            <div className="relative w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden transition-all duration-200">
              
              {/* Header */}
              <div className="px-6 py-5 border-b border-slate-150 flex items-center justify-between shrink-0 bg-slate-50/50">
                <h3 className="text-md font-bold text-slate-900 font-sans">
                  {editingVendor ? 'Edit Vendor Details' : 'Add New Vendor'}
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Form Body */}
              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                
                {formError && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3.5 text-xs text-rose-600 flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500 mt-0.5" />
                    <p className="leading-relaxed">{formError}</p>
                  </div>
                )}

                {/* Vendor Name & Bank Type */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Vendor Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. BRIGHT FLOWERS TRADING LLC"
                      className="w-full rounded-lg border border-slate-200 bg-white py-2.5 px-3 text-sm text-slate-850 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Bank Type
                    </label>
                    <select
                      value={bankType}
                      onChange={(e) => setBankType(e.target.value as 'BANK_MUSCAT' | 'OTHER_BANK')}
                      className="w-full rounded-lg border border-slate-200 bg-white py-2.5 px-3 text-sm text-slate-800 outline-none focus:border-indigo-500"
                    >
                      <option value="BANK_MUSCAT">BANK MUSCAT</option>
                      <option value="OTHER_BANK">OTHER BANK</option>
                    </select>
                  </div>
                </div>

                {/* Contact Person */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Contact Person
                  </label>
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-850 outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Email and Phone */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. billing@vendor.com"
                      className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-855 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Phone Number
                    </label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. +968 91234567"
                      className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-855 outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Bank Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Bank Name
                  </label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="e.g. Bank Muscat, Sohar International"
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-850 outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Account Number and SWIFT Code */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Bank Account Number
                    </label>
                    <input
                      type="text"
                      value={accountNo}
                      onChange={(e) => setAccountNo(e.target.value)}
                      placeholder="e.g. 0371024323360013"
                      className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-855 outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Bank SWIFT Code {bankType === 'OTHER_BANK' && <span className="text-rose-500">*</span>}
                    </label>
                    <input
                      type="text"
                      value={swiftCode}
                      onChange={(e) => setSwiftCode(e.target.value)}
                      placeholder="e.g. MSCTOMRXXXX"
                      className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-855 outline-none focus:border-indigo-500 font-mono uppercase"
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    disabled={submitting}
                    className="rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-lg bg-indigo-600 px-5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-indigo-500 shadow-md shadow-indigo-500/10 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
                      </>
                    ) : (
                      'Save Vendor'
                    )}
                  </button>
                </div>

              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {isDeleteModalOpen && deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div 
              onClick={() => setIsDeleteModalOpen(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" 
            />

            <div className="relative w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 border border-rose-100">
                  <AlertTriangle className="h-5 w-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 font-sans">
                    Delete Vendor
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Are you sure you want to delete vendor &quot;{deleteTarget.name}&quot;? This action cannot be undone.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={executeDelete}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 shadow-md shadow-rose-500/10 transition-colors"
                >
                  Delete Vendor
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Import Vendors Excel Modal */}
        {isImportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop overlay */}
            <div 
              onClick={() => { if (!importLoading) handleCloseImportModal(); }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" 
            />

            {/* Modal Dialog Card */}
            <div className="relative w-full max-w-4xl bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden transition-all duration-200">
              
              {/* Header */}
              <div className="px-6 py-5 border-b border-slate-150 flex items-center justify-between shrink-0 bg-slate-50/50">
                <div>
                  <h3 className="text-md font-bold text-slate-900 font-sans">
                    Import Vendors from Excel
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Upload an Excel spreadsheet with vendor contact and bank details.
                  </p>
                </div>
                <button
                  onClick={handleCloseImportModal}
                  disabled={importLoading}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* Step 1: Upload and Template Info */}
                {!importSummary && parsedRows.length === 0 && (
                  <div className="space-y-6">
                    {/* Template Card */}
                    <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <h4 className="text-sm font-semibold text-indigo-900">Need the import template?</h4>
                        <p className="text-xs text-indigo-700">
                          Download our pre-formatted sample Excel file, fill in your vendor list, and upload it back here.
                        </p>
                      </div>
                      <a
                        href="/VendorImportSample.xlsx"
                        download="VendorImportSample.xlsx"
                        className="flex items-center gap-1.5 shrink-0 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-550 shadow-md shadow-indigo-600/10 transition-colors uppercase tracking-wider"
                      >
                        <Download className="h-4 w-4" /> Download Sample
                      </a>
                    </div>

                    {/* Drag and Drop Zone */}
                    <div className="relative border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-2xl p-10 flex flex-col items-center justify-center gap-3 transition-colors bg-slate-50/50">
                      <div className="h-12 w-12 rounded-full bg-slate-100 border border-slate-200/50 flex items-center justify-center text-slate-500">
                        <Upload className="h-6 w-6" />
                      </div>
                      <div className="text-center">
                        <label htmlFor="excel-file-upload" className="cursor-pointer font-semibold text-indigo-600 hover:underline text-sm block">
                          Click to upload file
                        </label>
                        <span className="text-xs text-slate-500 mt-1 block">or drag and drop here</span>
                      </div>
                      <p className="text-[11px] text-slate-400">Supports .xlsx and .xls formats</p>
                      <input
                        id="excel-file-upload"
                        type="file"
                        accept=".xlsx, .xls"
                        onChange={handleImportFileChange}
                        className="hidden"
                      />
                    </div>

                    {/* Format Guidelines */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Template Column Guide</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div className="p-3 border border-slate-100 rounded-xl bg-white space-y-1">
                          <span className="font-semibold text-slate-800">Name *</span>
                          <p className="text-[11px] text-slate-500">Vendor's corporate name. Must be unique.</p>
                        </div>
                        <div className="p-3 border border-slate-100 rounded-xl bg-white space-y-1">
                          <span className="font-semibold text-slate-800">Bank Type</span>
                          <p className="text-[11px] text-slate-500">BANK_MUSCAT or OTHER_BANK. (Default BM)</p>
                        </div>
                        <div className="p-3 border border-slate-100 rounded-xl bg-white space-y-1">
                          <span className="font-semibold text-slate-800">SWIFT Code *</span>
                          <p className="text-[11px] text-slate-500">Required if Bank Type is OTHER_BANK.</p>
                        </div>
                        <div className="p-3 border border-slate-100 rounded-xl bg-white space-y-1">
                          <span className="font-semibold text-slate-800">Bank & Account</span>
                          <p className="text-[11px] text-slate-500">Bank Name and Account Number details.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 2: Interactive Preview List */}
                {!importSummary && parsedRows.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800 text-sm">File:</span>
                        <span className="text-xs font-mono bg-slate-100 border border-slate-200 rounded px-2 py-0.5 text-slate-700">
                          {importFile?.name}
                        </span>
                        <button
                          onClick={() => { setImportFile(null); setParsedRows([]); }}
                          disabled={importLoading}
                          className="text-xs text-indigo-650 hover:underline disabled:opacity-50 ml-2"
                        >
                          Change File
                        </button>
                      </div>
                      <div className="text-xs text-slate-500">
                        Parsed <strong className="text-slate-800">{parsedRows.length}</strong> rows
                      </div>
                    </div>

                    {/* Scrollable table container */}
                    <div className="border border-slate-200 rounded-xl max-h-[420px] overflow-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 sticky top-0 z-10">
                            <th className="py-2.5 px-4 w-12 text-center bg-slate-50">Row</th>
                            <th className="py-2.5 px-4 w-1/3 bg-slate-50">Vendor details</th>
                            <th className="py-2.5 px-4 bg-slate-50">Bank Details</th>
                            <th className="py-2.5 px-4 bg-slate-50">Status / Issue</th>
                            <th className="py-2.5 px-4 text-right bg-slate-50 w-32">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs text-slate-700 bg-white">
                          {parsedRows.map((row) => {
                            const error = rowErrors[row.rowIndex];
                            const isDuplicate = vendors.some(v => v.name.toLowerCase().trim() === row.name.toLowerCase().trim());
                            const action = rowActions[row.rowIndex];

                            return (
                              <tr key={row.rowIndex} className="hover:bg-slate-50/50 transition-colors">
                                <td className="py-3 px-4 font-semibold text-slate-400 text-center">
                                  {row.rowIndex}
                                </td>
                                <td className="py-3 px-4">
                                  <div className="flex flex-col gap-0.5">
                                    <span className="font-semibold text-slate-900 truncate max-w-[220px]" title={row.name}>
                                      {row.name || <span className="text-rose-500 font-normal italic">&lt;Missing Name&gt;</span>}
                                    </span>
                                    {row.contact_person && (
                                      <span className="text-[11px] text-slate-500">Contact: {row.contact_person}</span>
                                    )}
                                    {(row.email || row.phone) && (
                                      <span className="text-[10px] text-slate-400">
                                        {[row.email, row.phone].filter(Boolean).join(' | ')}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3 px-4">
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className={cn(
                                        "px-1.5 py-0.2 rounded text-[9px] font-semibold border",
                                        row.bank_type === 'OTHER_BANK' 
                                          ? "bg-amber-50 text-amber-700 border-amber-200/50" 
                                          : "bg-indigo-50 text-indigo-700 border-indigo-200/50"
                                      )}>
                                        {row.bank_type === 'OTHER_BANK' ? 'OTHER' : 'MUSCAT'}
                                      </span>
                                      {row.swift_code && (
                                        <span className="font-mono text-[10px] text-slate-500">{row.swift_code}</span>
                                      )}
                                    </div>
                                    {row.account_no && (
                                      <span className="font-mono text-[11px] text-slate-800">
                                        {row.bank_name || 'Acc'}: {row.account_no}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3 px-4">
                                  {error ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 border border-rose-200 text-rose-700">
                                      <AlertCircle className="h-3 w-3 shrink-0" />
                                      {error}
                                    </span>
                                  ) : isDuplicate ? (
                                    action === 'update' ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 border border-amber-200 text-amber-700">
                                        <AlertTriangle className="h-3 w-3 shrink-0" />
                                        Exists: Will Overwrite
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 border border-slate-200 text-slate-500">
                                        <Check className="h-3 w-3 shrink-0" />
                                        Exists: Skipping
                                      </span>
                                    )
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 border border-emerald-250 text-emerald-700">
                                      <CheckCircle2 className="h-3 w-3 shrink-0" />
                                      New Vendor
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <select
                                    value={action}
                                    onChange={(e) => setRowActions(prev => ({ ...prev, [row.rowIndex]: e.target.value as any }))}
                                    disabled={!!error || importLoading}
                                    className={cn(
                                      "rounded border py-1 px-1.5 text-[11px] font-bold outline-none cursor-pointer",
                                      action === 'skip' ? "bg-slate-50 border-slate-200 text-slate-500" :
                                      action === 'update' ? "bg-amber-50 border-amber-200 text-amber-700" :
                                      "bg-emerald-50 border-emerald-200 text-emerald-750"
                                    )}
                                  >
                                    {!error && <option value="import">Import</option>}
                                    {!error && isDuplicate && <option value="update">Update</option>}
                                    <option value="skip">Skip</option>
                                  </select>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Step 3: Success Screen */}
                {importSummary && (
                  <div className="py-8 flex flex-col items-center justify-center text-center space-y-5">
                    <div className="h-16 w-16 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shadow-sm animate-bounce">
                      <CheckCircle2 className="h-9 w-9" />
                    </div>
                    
                    <div className="space-y-1.5">
                      <h4 className="text-lg font-bold text-slate-900 font-sans">Import Process Completed</h4>
                      <p className="text-xs text-slate-500">Your Excel vendor directory synchronization finished successfully.</p>
                    </div>

                    <div className="grid grid-cols-3 gap-6 bg-slate-50 border border-slate-150 rounded-xl p-6 w-full max-w-md">
                      <div className="space-y-1">
                        <span className="text-xs uppercase font-bold tracking-wider text-slate-400">Imported</span>
                        <p className="text-2xl font-bold text-emerald-650">{importSummary.imported}</p>
                      </div>
                      <div className="space-y-1 border-x border-slate-200">
                        <span className="text-xs uppercase font-bold tracking-wider text-slate-400">Updated</span>
                        <p className="text-2xl font-bold text-amber-650">{importSummary.updated}</p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs uppercase font-bold tracking-wider text-slate-400">Skipped</span>
                        <p className="text-2xl font-bold text-slate-600">{importSummary.skipped}</p>
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-slate-150 flex items-center justify-between shrink-0 bg-slate-50/50">
                <div className="text-xs text-slate-500">
                  {importProgress && (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" />
                      <span>Processing: {importProgress.current} / {importProgress.total}...</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {importSummary ? (
                    <button
                      onClick={handleCloseImportModal}
                      className="rounded-lg bg-indigo-600 px-5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-indigo-500 shadow-md shadow-indigo-500/10"
                    >
                      Done
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={handleCloseImportModal}
                        disabled={importLoading}
                        className="rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                      >
                        Close
                      </button>
                      {parsedRows.length > 0 && (
                        <button
                          onClick={handleExecuteImport}
                          disabled={
                            importLoading || 
                            parsedRows.length === 0 || 
                            !parsedRows.some(row => rowActions[row.rowIndex] === 'import' || rowActions[row.rowIndex] === 'update')
                          }
                          className="rounded-lg bg-indigo-600 px-5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-indigo-500 shadow-md shadow-indigo-500/10 disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {importLoading ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Importing...
                            </>
                          ) : (
                            `Import ${
                              parsedRows.filter(
                                r => rowActions[r.rowIndex] === 'import' || rowActions[r.rowIndex] === 'update'
                              ).length
                            } Vendors`
                          )}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Match with Zoho Modal */}
        {isMatchModalOpen && matchingVendor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div 
              onClick={() => { if (!savingMatch) setIsMatchModalOpen(false); }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" 
            />

            <div className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden transition-all duration-200">
              
              {/* Header */}
              <div className="px-6 py-5 border-b border-slate-150 flex items-center justify-between shrink-0 bg-slate-50/50">
                <div>
                  <h3 className="text-md font-bold text-slate-900 font-sans flex items-center gap-2">
                    <Link2 className="h-5 w-5 text-blue-600" />
                    Match & Link Zoho Books Vendor
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Linking local vendor <strong className="text-slate-800 font-semibold">&quot;{matchingVendor.name}&quot;</strong> with their Zoho Books profile.
                  </p>
                </div>
                <button
                  onClick={() => setIsMatchModalOpen(false)}
                  disabled={savingMatch}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4 flex-1 overflow-y-auto">
                
                {/* Current Status Card */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current Linked Status</span>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5">
                      {matchingVendor.zoho_contact_id ? (
                        <span className="text-blue-700 flex items-center gap-1.5">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          Linked (Zoho Contact ID: {matchingVendor.zoho_contact_id})
                        </span>
                      ) : (
                        <span className="text-slate-500">Not linked to Zoho Books</span>
                      )}
                    </p>
                    {matchingVendor.outstanding_payable_amount !== undefined && (
                      <p className="text-xs text-slate-500 mt-1">
                        Current Outstanding Balance: <strong className="text-slate-900">OMR {Number(matchingVendor.outstanding_payable_amount).toFixed(3)}</strong>
                      </p>
                    )}
                  </div>
                  {matchingVendor.zoho_contact_id && (
                    <button
                      onClick={handleUnlinkVendor}
                      disabled={savingMatch}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition-colors flex items-center gap-1.5"
                    >
                      <Unlink className="h-3.5 w-3.5" />
                      Unlink
                    </button>
                  )}
                </div>

                {/* Search in Zoho Contacts */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Search Zoho Books Contacts
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={zohoSearchQuery}
                      onChange={(e) => setZohoSearchQuery(e.target.value)}
                      placeholder="Type vendor name to search Zoho list..."
                      className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Zoho Contacts Results */}
                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
                  {fetchingZohoContacts ? (
                    <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2 text-xs">
                      <Loader2 className="h-4 w-4 animate-spin text-indigo-600" /> Loading Zoho contacts...
                    </div>
                  ) : (
                    (() => {
                      const q = zohoSearchQuery.toLowerCase().trim();
                      const filtered = zohoContactsList.filter(zc => {
                        const name = (zc.company_name || zc.name || zc.contact_name || '').toLowerCase();
                        const cid = (zc.contact_id || zc.zoho_contact_id || '').toLowerCase();
                        return name.includes(q) || cid.includes(q);
                      });

                      if (filtered.length === 0) {
                        return (
                          <div className="p-8 text-center text-slate-400 text-xs">
                            No matching Zoho contacts found. Try a different search keyword.
                          </div>
                        );
                      }

                      return filtered.map((zc) => {
                        const contactName = zc.company_name || zc.name || zc.contact_name;
                        const contactId = zc.contact_id || zc.zoho_contact_id;
                        const bal = Number(zc.outstanding_payable_amount || zc.balance || 0);
                        const isCurrent = matchingVendor.zoho_contact_id === contactId;

                        return (
                          <div key={contactId} className="p-3.5 hover:bg-slate-50 flex items-center justify-between gap-4 transition-colors">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-slate-900 truncate">
                                {contactName}
                              </p>
                              <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                                <span>ID: <strong className="font-mono text-slate-700">{contactId}</strong></span>
                                <span>•</span>
                                <span className={cn(
                                  "font-mono font-semibold",
                                  bal > 0 ? "text-rose-600" : "text-emerald-600"
                                )}>
                                  Balance: OMR {bal.toFixed(3)}
                                </span>
                              </div>
                            </div>

                            <div>
                              {isCurrent ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                                  <Check className="h-3.5 w-3.5" /> Linked
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleLinkVendor(zc)}
                                  disabled={savingMatch}
                                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 shadow-sm transition-colors cursor-pointer flex items-center gap-1"
                                >
                                  {savingMatch ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
                                  Match & Link
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      });
                    })()
                  )}
                </div>

              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-150 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setIsMatchModalOpen(false)}
                  disabled={savingMatch}
                  className="rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 hover:bg-slate-100"
                >
                  Close
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </AppLayout>
  );
}

export default function VendorsPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-slate-900">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    }>
      <VendorsContent />
    </Suspense>
  );
}
