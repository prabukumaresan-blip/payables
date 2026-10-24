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
  AlertCircle
} from 'lucide-react';
import { Vendor, Payable, PaymentHistory } from '@/lib/supabase/mockDb';
import { getAllPaymentHistory } from '@/lib/supabase/queries';
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

  // Vendor bills mapping
  const vendorBills = allPayables.filter(p => {
    if (!p.vendor_name) return false;
    return p.vendor_name.trim().toLowerCase() === vendor.name.trim().toLowerCase();
  });
  const vendorBillMap = new Map(vendorBills.map(b => [b.id, b]));
  const vendorBillIds = new Set(vendorBills.map(b => b.id));

  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;

    const fetchHistory = async () => {
      setLoading(true);
      try {
        const allHistory = await getAllPaymentHistory();
        const matched = allHistory.filter(ph => vendorBillIds.has(ph.payable_id));
        if (isMounted) {
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

    fetchHistory();

    return () => {
      isMounted = false;
    };
  }, [isOpen, vendor.id, allPayables.length]);

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

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
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
                <h2 className="text-base font-bold text-white">Download Payment Confirmation</h2>
                <p className="text-xs text-slate-300">
                  Select a recorded payment for <strong className="text-white">{vendor.name}</strong>
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Search bar */}
          <div className="p-3 bg-slate-50 border-b border-slate-200 shrink-0">
            <div className="relative">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filter by reference, bill title or amount..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* List Content */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-0">
            {loading ? (
              <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center">
                <Loader2 className="h-7 w-7 animate-spin text-indigo-600 mb-2" />
                <p className="text-xs">Loading payment records...</p>
              </div>
            ) : filteredPayments.length === 0 ? (
              <div className="py-16 px-4 text-center text-slate-400 flex flex-col items-center justify-center">
                <Receipt className="h-10 w-10 text-slate-300 mb-2 stroke-[1.5]" />
                <p className="text-sm font-semibold text-slate-700">No payment confirmations available</p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  {payments.length === 0 
                    ? `No payments have been recorded for ${vendor.name} yet.` 
                    : 'No payments match your current search query.'}
                </p>
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
                            {bill?.title || 'Bill Payment'}
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
                            <span className="font-mono text-slate-400">
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
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition"
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
              {filteredPayments.length} payment {filteredPayments.length === 1 ? 'entry' : 'entries'} found
            </span>
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold transition"
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
          company={activePayable?.company || null}
        />
      )}
    </>
  );
}
