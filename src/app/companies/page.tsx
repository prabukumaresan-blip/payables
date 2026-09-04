'use client';

import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Company, CompanyBankAccount } from '@/lib/supabase/mockDb';
import { 
  getCompanies, 
  createCompany, 
  updateCompany, 
  deleteCompany,
  addCompanyBankAccount,
  updateCompanyBankAccount,
  deleteCompanyBankAccount,
  getAllPayables
} from '@/lib/supabase/queries';
import { useCompany } from '@/context/CompanyContext';
import { formatOMR } from '@/lib/utils/formatCurrency';
import { 
  Building2, 
  Plus, 
  Landmark, 
  CreditCard, 
  Edit3, 
  Trash2, 
  Check, 
  X, 
  ShieldCheck, 
  Star, 
  AlertCircle,
  Hash,
  FileText,
  DollarSign,
  Layers
} from 'lucide-react';

import { Suspense } from 'react';

function CompaniesContent() {
  const { companies, reloadCompanies, selectedCompanyId, setSelectedCompanyId } = useCompany();
  const [loading, setLoading] = useState(false);
  const [companyPayablesStats, setCompanyPayablesStats] = useState<Record<string, { totalAmount: number; count: number }>>({});

  // Company Modal State
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [companyForm, setCompanyForm] = useState<{
    name: string;
    short_name: string;
    subtitle: string;
    cr_number: string;
    tax_number: string;
    color: string;
  }>({
    name: '',
    short_name: '',
    subtitle: '',
    cr_number: '',
    tax_number: '',
    color: 'indigo',
  });

  // Bank Account Modal State
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [targetCompanyId, setTargetCompanyId] = useState<string | null>(null);
  const [editingAccount, setEditingAccount] = useState<CompanyBankAccount | null>(null);
  const [accountForm, setAccountForm] = useState<{
    bank_name: string;
    account_number: string;
    swift_code: string;
    account_title: string;
    currency: string;
    is_default: boolean;
  }>({
    bank_name: 'Bank Muscat',
    account_number: '',
    swift_code: 'BMUSOMRX',
    account_title: 'Main Operations',
    currency: 'OMR',
    is_default: false,
  });

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadStats = async () => {
    try {
      const all = await getAllPayables();
      const stats: Record<string, { totalAmount: number; count: number }> = {};
      all.forEach(p => {
        const cId = p.company_id || 'comp-1';
        if (!stats[cId]) {
          stats[cId] = { totalAmount: 0, count: 0 };
        }
        stats[cId].totalAmount += Number(p.amount) - Number(p.paid_amount || 0);
        stats[cId].count += 1;
      });
      setCompanyPayablesStats(stats);
    } catch (e) {
      console.error('Error loading stats:', e);
    }
  };

  useEffect(() => {
    loadStats();
  }, [companies]);

  // Open Create / Edit Company
  const handleOpenCompanyModal = (company?: Company) => {
    setErrorMessage(null);
    if (company) {
      setEditingCompany(company);
      setCompanyForm({
        name: company.name,
        short_name: company.short_name || '',
        subtitle: company.subtitle || '',
        cr_number: company.cr_number || '',
        tax_number: company.tax_number || '',
        color: company.color || 'indigo',
      });
    } else {
      setEditingCompany(null);
      setCompanyForm({
        name: '',
        short_name: '',
        subtitle: 'Trading LLC',
        cr_number: '',
        tax_number: '',
        color: 'indigo',
      });
    }
    setIsCompanyModalOpen(true);
  };

  // Submit Company
  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyForm.name.trim()) {
      setErrorMessage('Company Legal Name is required');
      return;
    }

    setLoading(true);
    try {
      if (editingCompany) {
        await updateCompany(editingCompany.id, {
          name: companyForm.name.trim().toUpperCase(),
          short_name: companyForm.short_name.trim() || companyForm.name.trim(),
          subtitle: companyForm.subtitle.trim(),
          cr_number: companyForm.cr_number.trim() || null,
          tax_number: companyForm.tax_number.trim() || null,
          color: companyForm.color,
        });
      } else {
        await createCompany({
          name: companyForm.name.trim().toUpperCase(),
          short_name: companyForm.short_name.trim() || companyForm.name.trim(),
          subtitle: companyForm.subtitle.trim(),
          cr_number: companyForm.cr_number.trim() || null,
          tax_number: companyForm.tax_number.trim() || null,
          color: companyForm.color,
          is_active: true,
          bank_accounts: [
            {
              id: 'acc-new-1',
              company_id: '',
              bank_name: 'Bank Muscat',
              account_number: '0371' + Math.floor(100000000000 + Math.random() * 900000000000),
              swift_code: 'BMUSOMRX',
              account_title: 'Primary Corporate Account',
              currency: 'OMR',
              is_default: true,
            }
          ],
        });
      }
      await reloadCompanies();
      setIsCompanyModalOpen(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save company');
    } finally {
      setLoading(false);
    }
  };

  // Delete Company
  const handleDeleteCompany = async (id: string) => {
    if (companies.length <= 1) {
      setErrorMessage('At least one company must remain in the system.');
      return;
    }
    setLoading(true);
    try {
      await deleteCompany(id);
      if (selectedCompanyId === id) {
        setSelectedCompanyId('ALL');
      }
      await reloadCompanies();
      setDeleteConfirmId(null);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete company');
    } finally {
      setLoading(false);
    }
  };

  // Open Bank Account Modal
  const handleOpenAccountModal = (companyId: string, account?: CompanyBankAccount) => {
    setErrorMessage(null);
    setTargetCompanyId(companyId);
    if (account) {
      setEditingAccount(account);
      setAccountForm({
        bank_name: account.bank_name,
        account_number: account.account_number,
        swift_code: account.swift_code || '',
        account_title: account.account_title || '',
        currency: account.currency || 'OMR',
        is_default: account.is_default,
      });
    } else {
      setEditingAccount(null);
      setAccountForm({
        bank_name: 'Bank Muscat',
        account_number: '',
        swift_code: 'BMUSOMRX',
        account_title: 'Operations Account',
        currency: 'OMR',
        is_default: false,
      });
    }
    setIsAccountModalOpen(true);
  };

  // Save Bank Account
  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetCompanyId || !accountForm.account_number.trim() || !accountForm.bank_name.trim()) {
      setErrorMessage('Bank Name and Account Number are required');
      return;
    }

    setLoading(true);
    try {
      if (editingAccount) {
        await updateCompanyBankAccount(targetCompanyId, editingAccount.id, {
          bank_name: accountForm.bank_name.trim(),
          account_number: accountForm.account_number.trim(),
          swift_code: accountForm.swift_code.trim().toUpperCase() || null,
          account_title: accountForm.account_title.trim() || null,
          currency: accountForm.currency.trim().toUpperCase(),
          is_default: accountForm.is_default,
        });
      } else {
        await addCompanyBankAccount(targetCompanyId, {
          bank_name: accountForm.bank_name.trim(),
          account_number: accountForm.account_number.trim(),
          swift_code: accountForm.swift_code.trim().toUpperCase() || null,
          account_title: accountForm.account_title.trim() || null,
          currency: accountForm.currency.trim().toUpperCase(),
          is_default: accountForm.is_default,
        });
      }
      await reloadCompanies();
      setIsAccountModalOpen(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save bank account');
    } finally {
      setLoading(false);
    }
  };

  // Delete Bank Account
  const handleDeleteAccount = async (companyId: string, accountId: string) => {
    setLoading(true);
    try {
      await deleteCompanyBankAccount(companyId, accountId);
      await reloadCompanies();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete account');
    } finally {
      setLoading(false);
    }
  };

  // Set Default Bank Account
  const handleSetDefaultAccount = async (companyId: string, accountId: string) => {
    try {
      await updateCompanyBankAccount(companyId, accountId, { is_default: true });
      await reloadCompanies();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to set default account');
    }
  };

  return (
    <AppLayout title="Companies & Bank Accounts">
      <div className="space-y-6">
        {/* Top Header Card */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 shadow-xs">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">Corporate Entities & Bank Numbers</h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Manage multiple companies, legal entities, and distinct debit bank accounts for vendor & employee payments.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => handleOpenCompanyModal()}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm shadow-indigo-600/20 transition-all cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Add New Company
            </button>
          </div>
        </div>

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Companies Grid */}
        <div className="grid grid-cols-1 gap-6">
          {companies.map((company) => {
            const stats = companyPayablesStats[company.id] || { totalAmount: 0, count: 0 };
            const isCurrentActive = selectedCompanyId === company.id;

            return (
              <div 
                key={company.id}
                className={`bg-white rounded-2xl border transition-all duration-200 shadow-sm overflow-hidden ${
                  isCurrentActive ? 'border-indigo-400 ring-2 ring-indigo-500/10' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Company Header */}
                <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/40">
                  <div className="flex items-start sm:items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white font-bold text-lg shadow-md shadow-indigo-500/20">
                      {company.short_name ? company.short_name.substring(0, 2).toUpperCase() : 'CO'}
                    </div>

                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h2 className="text-base font-bold text-slate-900 tracking-tight">{company.name}</h2>
                        {isCurrentActive && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                            <Check className="h-3 w-3" /> Active Filter
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 mt-1 text-xs text-slate-500 flex-wrap">
                        {company.cr_number && (
                          <span className="flex items-center gap-1">
                            <FileText className="h-3.5 w-3.5 text-slate-400" />
                            CR: <strong className="text-slate-700 font-mono">{company.cr_number}</strong>
                          </span>
                        )}
                        {company.tax_number && (
                          <span className="flex items-center gap-1">
                            <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
                            VAT/Tax: <strong className="text-slate-700 font-mono">{company.tax_number}</strong>
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-indigo-650 font-medium">
                          <Layers className="h-3.5 w-3.5 text-indigo-500" />
                          {stats.count} Payables ({formatOMR(stats.totalAmount)})
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <button
                      onClick={() => setSelectedCompanyId(isCurrentActive ? 'ALL' : company.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        isCurrentActive
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {isCurrentActive ? 'Clear Filter' : 'Set as Active'}
                    </button>

                    <button
                      onClick={() => handleOpenCompanyModal(company)}
                      title="Edit Company"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>

                    {companies.length > 1 && (
                      <button
                        onClick={() => setDeleteConfirmId(company.id)}
                        title="Delete Company"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Bank Accounts Section */}
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Landmark className="h-4 w-4 text-indigo-600" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Configured Debit Bank Accounts ({company.bank_accounts?.length || 0})
                      </h3>
                    </div>
                    <button
                      onClick={() => handleOpenAccountModal(company.id)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100/80 px-2.5 py-1 rounded-lg border border-indigo-200/60 transition-colors cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Bank Account
                    </button>
                  </div>

                  {/* Bank Accounts List */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {company.bank_accounts?.map((acc) => (
                      <div 
                        key={acc.id}
                        className={`p-4 rounded-xl border relative transition-all ${
                          acc.is_default 
                            ? 'bg-slate-900 text-white border-slate-800 shadow-md shadow-slate-900/10' 
                            : 'bg-slate-50/70 border-slate-200 hover:border-slate-300 text-slate-800'
                        }`}
                      >
                        {/* Default Star Badge */}
                        {acc.is_default && (
                          <div className="absolute top-3 right-3 flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-400/20 px-2 py-0.5 rounded-full border border-amber-300/30">
                            <Star className="h-3 w-3 fill-amber-300 text-amber-300" />
                            DEFAULT DEBIT
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          <CreditCard className={`h-4 w-4 ${acc.is_default ? 'text-indigo-400' : 'text-slate-500'}`} />
                          <span className={`text-xs font-bold ${acc.is_default ? 'text-white' : 'text-slate-900'}`}>
                            {acc.bank_name}
                          </span>
                        </div>

                        {acc.account_title && (
                          <p className={`text-[11px] mt-1 truncate ${acc.is_default ? 'text-slate-300' : 'text-slate-500'}`}>
                            {acc.account_title}
                          </p>
                        )}

                        <div className="mt-3 pt-3 border-t border-dashed border-slate-200/40 space-y-1">
                          <div className="flex items-baseline justify-between">
                            <span className={`text-[10px] font-semibold uppercase tracking-wider ${acc.is_default ? 'text-slate-400' : 'text-slate-400'}`}>
                              Account Number
                            </span>
                            <span className={`font-mono text-xs font-bold tracking-wider ${acc.is_default ? 'text-indigo-200' : 'text-slate-900'}`}>
                              {acc.account_number}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[11px]">
                            <span className={acc.is_default ? 'text-slate-400' : 'text-slate-400'}>SWIFT / BIC</span>
                            <span className={`font-mono font-medium ${acc.is_default ? 'text-slate-200' : 'text-slate-700'}`}>
                              {acc.swift_code || '—'}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[11px]">
                            <span className={acc.is_default ? 'text-slate-400' : 'text-slate-400'}>Currency</span>
                            <span className={`font-semibold ${acc.is_default ? 'text-slate-200' : 'text-slate-700'}`}>
                              {acc.currency || 'OMR'}
                            </span>
                          </div>
                        </div>

                        {/* Account Actions */}
                        <div className="mt-3.5 pt-2.5 border-t border-slate-200/20 flex items-center justify-between gap-2">
                          {!acc.is_default ? (
                            <button
                              onClick={() => handleSetDefaultAccount(company.id, acc.id)}
                              className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 hover:underline cursor-pointer"
                            >
                              <Star className="h-3 w-3" /> Make Default
                            </button>
                          ) : (
                            <span className="text-[10px] font-medium text-slate-400">Primary for exports</span>
                          )}

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleOpenAccountModal(company.id, acc)}
                              className={`p-1 rounded hover:bg-slate-200/40 text-xs ${acc.is_default ? 'text-slate-300 hover:text-white' : 'text-slate-500 hover:text-slate-800'}`}
                              title="Edit Account"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            {company.bank_accounts.length > 1 && (
                              <button
                                onClick={() => handleDeleteAccount(company.id, acc.id)}
                                className={`p-1 rounded hover:bg-rose-500/20 text-xs ${acc.is_default ? 'text-rose-300 hover:text-rose-200' : 'text-slate-400 hover:text-rose-600'}`}
                                title="Delete Account"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Company Modal */}
        {isCompanyModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsCompanyModalOpen(false)} />
            <div className="relative w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 z-10 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-base font-bold text-slate-900">
                  {editingCompany ? 'Edit Company Profile' : 'Add New Corporate Entity'}
                </h3>
                <button onClick={() => setIsCompanyModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSaveCompany} className="space-y-3.5">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Company Legal Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={companyForm.name}
                    onChange={(e) => setCompanyForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. BRIGHT FLOWERS TRADING LLC"
                    className="w-full mt-1 rounded-lg border border-slate-200 bg-white py-2 px-3 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500 uppercase"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Will be printed in the DR row of bank export files.</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Display Short Name
                    </label>
                    <input
                      type="text"
                      value={companyForm.short_name}
                      onChange={(e) => setCompanyForm(prev => ({ ...prev, short_name: e.target.value }))}
                      placeholder="e.g. Bright Flowers"
                      className="w-full mt-1 rounded-lg border border-slate-200 bg-white py-2 px-3 text-xs text-slate-800 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Subtitle / Type
                    </label>
                    <input
                      type="text"
                      value={companyForm.subtitle}
                      onChange={(e) => setCompanyForm(prev => ({ ...prev, subtitle: e.target.value }))}
                      placeholder="e.g. Trading LLC"
                      className="w-full mt-1 rounded-lg border border-slate-200 bg-white py-2 px-3 text-xs text-slate-800 outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Commercial Reg (CR No.)
                    </label>
                    <input
                      type="text"
                      value={companyForm.cr_number}
                      onChange={(e) => setCompanyForm(prev => ({ ...prev, cr_number: e.target.value }))}
                      placeholder="e.g. 1249823"
                      className="w-full mt-1 rounded-lg border border-slate-200 bg-white py-2 px-3 text-xs font-mono text-slate-800 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      VAT / Tax Number
                    </label>
                    <input
                      type="text"
                      value={companyForm.tax_number}
                      onChange={(e) => setCompanyForm(prev => ({ ...prev, tax_number: e.target.value }))}
                      placeholder="e.g. OM1100234567"
                      className="w-full mt-1 rounded-lg border border-slate-200 bg-white py-2 px-3 text-xs font-mono text-slate-800 outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsCompanyModalOpen(false)}
                    className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50"
                  >
                    {loading ? 'Saving...' : editingCompany ? 'Save Changes' : 'Create Company'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Bank Account Modal */}
        {isAccountModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsAccountModalOpen(false)} />
            <div className="relative w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 z-10 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-base font-bold text-slate-900">
                  {editingAccount ? 'Edit Debit Bank Account' : 'Add Corporate Debit Account'}
                </h3>
                <button onClick={() => setIsAccountModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSaveAccount} className="space-y-3.5">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Bank Name <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={accountForm.bank_name}
                    onChange={(e) => {
                      const bName = e.target.value;
                      let swift = 'BMUSOMRX';
                      if (bName.toLowerCase().includes('dhofar')) swift = 'BKDHOMRX';
                      else if (bName.toLowerCase().includes('national bank') || bName.toLowerCase().includes('nbo')) swift = 'NBOKOMRX';
                      else if (bName.toLowerCase().includes('sohar')) swift = 'BKSHOMRX';
                      else if (bName.toLowerCase().includes('nizwa')) swift = 'BKNZOMRX';
                      else if (bName.toLowerCase().includes('ahli')) swift = 'AHLIOMRX';
                      setAccountForm(prev => ({ ...prev, bank_name: bName, swift_code: swift }));
                    }}
                    className="w-full mt-1 rounded-lg border border-slate-200 bg-white py-2 px-3 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="Bank Muscat">Bank Muscat</option>
                    <option value="National Bank of Oman">National Bank of Oman (NBO)</option>
                    <option value="Bank Dhofar">Bank Dhofar</option>
                    <option value="Sohar International">Sohar International</option>
                    <option value="Ahli Bank">Ahli Bank</option>
                    <option value="Bank Nizwa">Bank Nizwa</option>
                    <option value="Oman Arab Bank">Oman Arab Bank (OAB)</option>
                    <option value="Other Bank">Other Commercial Bank</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Account Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={accountForm.account_number}
                    onChange={(e) => setAccountForm(prev => ({ ...prev, account_number: e.target.value }))}
                    placeholder="e.g. 0371024323360013"
                    className="w-full mt-1 rounded-lg border border-slate-200 bg-white py-2 px-3 text-xs font-mono font-bold text-slate-800 outline-none focus:border-indigo-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Used as the source DR account number in WPS payment files.</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      SWIFT / BIC Code
                    </label>
                    <input
                      type="text"
                      value={accountForm.swift_code}
                      onChange={(e) => setAccountForm(prev => ({ ...prev, swift_code: e.target.value }))}
                      placeholder="e.g. BMUSOMRX"
                      className="w-full mt-1 rounded-lg border border-slate-200 bg-white py-2 px-3 text-xs font-mono text-slate-800 outline-none focus:border-indigo-500 uppercase"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Currency
                    </label>
                    <input
                      type="text"
                      value={accountForm.currency}
                      onChange={(e) => setAccountForm(prev => ({ ...prev, currency: e.target.value }))}
                      placeholder="OMR"
                      className="w-full mt-1 rounded-lg border border-slate-200 bg-white py-2 px-3 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500 uppercase"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Account Label / Description
                  </label>
                  <input
                    type="text"
                    value={accountForm.account_title}
                    onChange={(e) => setAccountForm(prev => ({ ...prev, account_title: e.target.value }))}
                    placeholder="e.g. Main Operations, Salary Account"
                    className="w-full mt-1 rounded-lg border border-slate-200 bg-white py-2 px-3 text-xs text-slate-800 outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="is_default_check"
                    checked={accountForm.is_default}
                    onChange={(e) => setAccountForm(prev => ({ ...prev, is_default: e.target.checked }))}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <label htmlFor="is_default_check" className="text-xs font-semibold text-slate-700 cursor-pointer">
                    Set as Default Debit Account for this company
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsAccountModalOpen(false)}
                    className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50"
                  >
                    {loading ? 'Saving...' : editingAccount ? 'Update Account' : 'Save Account'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirmId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteConfirmId(null)} />
            <div className="relative w-full max-w-sm bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 z-10 space-y-4">
              <div className="flex items-center gap-3 text-rose-600">
                <AlertCircle className="h-6 w-6 shrink-0" />
                <h3 className="text-base font-bold text-slate-900">Delete Company?</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Are you sure you want to remove this corporate profile and its associated bank numbers? Payables linked to this company will remain in the database.
              </p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmId(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteCompany(deleteConfirmId)}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs"
                >
                  Confirm Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

export default function CompaniesPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    }>
      <CompaniesContent />
    </Suspense>
  );
}
