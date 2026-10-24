'use client';

import React, { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { 
  X, 
  Download, 
  Search, 
  Receipt, 
  CreditCard, 
  Calendar, 
  FileCheck2, 
  Loader2, 
  Building2,
  AlertCircle,
  PlusCircle,
  FileText
} from 'lucide-react';
import { Vendor, Payable, PaymentHistory, Company } from '@/lib/supabase/mockDb';
import { getAllPaymentHistory, getCompanies } from '@/lib/supabase/queries';
import { formatOMR } from '@/lib/utils/formatCurrency';
import PaymentConfirmationModal from './PaymentConfirmationModal';

interface VendorPaymentConfirmationSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendor: Vendor;
  allPayables: Payable[];
}

export default function VendorPaymentConfirmationSelectorModal({
  isOpen,
  onClose,
  vendor,
  allPayables,
}: VendorPaymentConfirmationSelectorModalProps) {
  const [payments, setPayments] = useState<PaymentHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activePaymentForModal, setActivePaymentForModal] = useState<PaymentHistory | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);

  // Manual payment advice state
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualAmount, setManualAmount] = useState('');
  const [manualDate, setManualDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [manualRefNo, setManualRefNo] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [manualAccount, setManualAccount] = useState(vendor.bank_account || vendor.account_no || '');
  const [manualSelectedCompanyId, setManualSelectedCompanyId] = useState('');

  // Vendor bills mapping (fuzzy lowercase match to handle whitespace/trimming)
  const vendorNameNormalized = vendor.name.trim().toLowerCase();
  const vendorBills = allPayables.filter(p => {
    if (!p.vendor_name) return false;
    return p.vendor_name.trim().toLowerCase() === vendorNameNormalized;
  });
  const vendorBillMap = new Map(vendorBills.map(b => [b.id, b]));
  const vendorBillIds = new Set(vendorBills.map(b => b.id));

  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;

    const fetchHistoryAndCompanies = async () => {
      setLoading(true);
      try {
        const [allHistory, companyList] = await Promise.all([
          getAllPaymentHistory(),
          getCompanies()
        ]);

        if (isMounted) {
          setCompanies(companyList);
          if (companyList.length > 0 && !manualSelectedCompanyId) {
            setManualSelectedCompanyId(companyList[0].id);
          }

          // Match payments:
          // 1. Matched by bill payable_id
          // 2. Or matched by notes containing vendor name or zoho contact ID
          const matched = allHistory.filter(ph => {
            if (vendorBillIds.has(ph.payable_id)) return true;
            if (ph.notes && ph.notes.toLowerCase().includes(vendorNameNormalized)) return true;
            return false;
          });

          setPayments(matched);
        }
      } catch (err) {
        console.error('Failed to load vendor payment records:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchHistoryAndCompanies();

    return () => {
      isMounted = false;
    };
  }, [isOpen, vendor.id, vendor.name, allPayables.length]);

  if (!isOpen) return null;

  // Filtered payments by search
  const filteredPayments = payments.filter(p => {
    const bill = vendorBillMap.get(p.payable_id);
    const search = searchTerm.toLowerCase().trim();
    if (!search) return true;
    return (
      (p.reference_no && p.reference_no.toLowerCase().includes(search)) ||
      (p.notes && p.notes.toLowerCase().includes(search)) ||
      (p.bank_account && p.bank_account.toLowerCase().includes(search)) ||
      (bill && bill.title.toLowerCase().includes(search)) ||
      p.amount.toString().includes(search)
    );
  });

  const activePayable = activePaymentForModal 
    ? vendorBillMap.get(activePaymentForModal.payable_id) || null
    : null;

  // Handle generating custom on-the-fly advice
  const handleGenerateManualAdvice = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(manualAmount);
    if (isNaN(amt) || amt <= 0) {
      alert('Please enter a valid payment amount');
      return;
    }

    const customPayment: PaymentHistory = {
      id: `custom-pay-${Date.now()}`,
      payable_id: vendorBills[0]?.id || `payable-custom-${Date.now()}`,
      amount: amt,
      payment_date: manualDate,
      reference_no: manualRefNo || `REF-${Date.now().toString().slice(-6)}`,
      bank_account: manualAccount || vendor.account_no || null,
      notes: manualNotes || `Payment Advice for ${vendor.name}`,
      company_id: manualSelectedCompanyId || null
    };

    setActivePaymentForModal(customPayment);
  };

  const selectedCompany = companies.find(c => c.id === (activePayable?.company_id || activePaymentForModal?.company_id || manualSelectedCompanyId)) || companies[0] || null;

  return (
    <>
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" 
          onClick={onClose} 
        />

        {/* Dialog Window */}
        <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
          
          {/* Header */}
          <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-white/10 shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-white/10 text-white ring-1 ring-white/20">
                <FileCheck2 className="h-5 w-5 text-indigo-300" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Payment Confirmation Advice</h2>
                <p className="text-xs text-slate-300">
                  Select payment or generate confirmation for <strong className="text-white">{vendor.name}</strong>
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Search bar & Toggle */}
          <div className="p-3 bg-slate-50 border-b border-slate-200 shrink-0 flex items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search reference, bill title or amount..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowManualForm(!showManualForm)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold border border-indigo-200 transition cursor-pointer shrink-0"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              <span>{showManualForm ? 'Show List' : 'Custom Advice'}</span>
            </button>
          </div>

          {/* Manual Form or List Content */}
          <div className="flex-1 overflow-y-auto p-0">
            {showManualForm ? (
              <form onSubmit={handleGenerateManualAdvice} className="p-5 space-y-4">
                <div className="rounded-lg bg-indigo-50/70 p-3 border border-indigo-100 text-xs text-indigo-900 leading-relaxed">
                  Enter payment details below to instantly generate a branded <strong>Payment Confirmation Voucher</strong> for <strong>{vendor.name}</strong> to download as PDF or PNG.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Amount (OMR) *</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      required
                      placeholder="0.000"
                      value={manualAmount}
                      onChange={(e) => setManualAmount(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-900 font-mono font-semibold focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Date *</label>
                    <input
                      type="date"
                      required
                      value={manualDate}
                      onChange={(e) => setManualDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Transaction / Reference #</label>
                    <input
                      type="text"
                      placeholder="e.g. TR-928172"
                      value={manualRefNo}
                      onChange={(e) => setManualRefNo(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-900 font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Paying Company</label>
                    <select
                      value={manualSelectedCompanyId}
                      onChange={(e) => setManualSelectedCompanyId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 bg-white"
                    >
                      {companies.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Vendor Account / Bank</label>
                    <input
                      type="text"
                      placeholder="e.g. Bank Muscat - 0371024323360013"
                      value={manualAccount}
                      onChange={(e) => setManualAccount(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Description / Notes</label>
                    <input
                      type="text"
                      placeholder="e.g. Settlement of invoice or monthly services"
                      value={manualNotes}
                      onChange={(e) => setManualNotes(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowManualForm(false)}
                    className="px-3.5 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-semibold transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Generate & Download Advice</span>
                  </button>
                </div>
              </form>
            ) : loading ? (
              <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center">
                <Loader2 className="h-7 w-7 animate-spin text-indigo-600 mb-2" />
                <p className="text-xs">Loading recorded payments...</p>
              </div>
            ) : filteredPayments.length === 0 ? (
              <div className="py-14 px-4 text-center text-slate-400 flex flex-col items-center justify-center">
                <Receipt className="h-10 w-10 text-slate-300 mb-2 stroke-[1.5]" />
                <p className="text-sm font-semibold text-slate-700">No payment history records found</p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mb-4">
                  {payments.length === 0 
                    ? `No payments have been logged for ${vendor.name} yet. You can generate a custom advice slip directly.` 
                    : 'No payments match your current search query.'}
                </p>
                <button
                  type="button"
                  onClick={() => setShowManualForm(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                >
                  <PlusCircle className="h-4 w-4" />
                  <span>Generate Custom Payment Advice</span>
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredPayments.map((p) => {
                  const bill = vendorBillMap.get(p.payable_id);
                  let formattedDate = p.payment_date;
                  try {
                    formattedDate = format(parseISO(p.payment_date), 'dd MMM yyyy');
                  } catch {
                    // Fallback
                  }

                  return (
                    <div 
                      key={p.id}
                      className="p-4 hover:bg-slate-50/80 transition-colors flex items-center justify-between gap-4 group"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-xs text-slate-900 truncate">
                            {bill?.title || p.notes || 'Vendor Payment'}
                          </span>
                          {p.reference_no && (
                            <span className="text-[10px] font-mono font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                              Ref: {p.reference_no}
                            </span>
                          )}
                          {p.zoho_payment_id && (
                            <span className="text-[9px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                              Zoho #{p.zoho_payment_id}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-slate-400" />
                            {formattedDate}
                          </span>
                          {p.bank_account && (
                            <span className="font-mono text-slate-400 truncate max-w-[200px]">
                              Acc: {p.bank_account}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <span className="text-sm font-bold font-mono text-emerald-600 block">
                            {formatOMR(p.amount)}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => setActivePaymentForModal(p)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                          title="Preview and Download Payment Confirmation"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>Download</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
            <span>
              {filteredPayments.length} payment {filteredPayments.length === 1 ? 'record' : 'records'} available
            </span>
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold transition cursor-pointer"
            >
              Close
            </button>
          </div>

        </div>
      </div>

      {/* Actual Confirmation Document & Download Modal */}
      {activePaymentForModal && (
        <PaymentConfirmationModal
          isOpen={!!activePaymentForModal}
          onClose={() => setActivePaymentForModal(null)}
          vendor={vendor}
          payment={activePaymentForModal}
          payable={activePayable}
          company={selectedCompany}
        />
      )}
    </>
  );
}
