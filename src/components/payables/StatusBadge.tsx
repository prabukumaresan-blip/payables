'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Payable, PaymentHistory } from '@/lib/supabase/mockDb';
import { updatePayableStatus, getPaymentHistory, addPaymentRecord, deletePaymentRecord } from '@/lib/supabase/queries';
import { Check, ChevronDown, Calendar, Trash2, Plus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { formatOMR } from '@/lib/utils/formatCurrency';

interface StatusBadgeProps {
  payable: Payable;
  onUpdate: (updatedPayable: Payable) => void;
}

export default function StatusBadge({ payable, onUpdate }: StatusBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState(payable.status);
  const [paymentDate, setPaymentDate] = useState(
    payable.payment_date || format(new Date(), 'yyyy-MM-dd')
  );
  const [billAmount, setBillAmount] = useState(String(payable.amount));
  
  // Payment History states
  const [payments, setPayments] = useState<PaymentHistory[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // New Payment Form states
  const [addAmount, setAddAmount] = useState('');
  const [addDate, setAddDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [addRefNo, setAddRefNo] = useState('');
  const [addBankAccount, setAddBankAccount] = useState('');
  const [addNotes, setAddNotes] = useState('');

  const popoverRef = useRef<HTMLDivElement>(null);

  const loadPayments = async () => {
    setLoadingPayments(true);
    try {
      const history = await getPaymentHistory(payable.id);
      setPayments(history);
    } catch (e) {
      console.error('Error loading payment history:', e);
    } finally {
      setLoadingPayments(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadPayments();
      // Reset form fields
      setAddAmount('');
      setAddDate(format(new Date(), 'yyyy-MM-dd'));
      setAddRefNo('');
      setAddBankAccount(payable.bank_account || '');
      setAddNotes('');
      setSelectedStatus(payable.status);
      setBillAmount(String(payable.amount));
      setPaymentDate(payable.payment_date || format(new Date(), 'yyyy-MM-dd'));
    }
  }, [isOpen, payable]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      // Since the modal is rendered inside a fixed overlay, clicking the backdrop is handled by local overlay onClick.
      // We don't necessarily close on click outside elements unless it's the backdrop itself.
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleStatusChange = async (status: Payable['status']) => {
    setSelectedStatus(status);
    if (payable.category_id !== 'cat-8') {
      if (status !== 'paid' && status !== 'partial') {
        if (payments.length > 0) {
          if (!confirm(`Changing status to ${status} will delete all recorded payment history for this payable. Continue?`)) {
            setSelectedStatus(payable.status);
            return;
          }
        }
        await saveStatus(status, null, null);
      }
    }
  };

  const saveStatus = async (status: Payable['status'], payDate: string | null, paidAmount: number | null) => {
    setLoading(true);
    try {
      const newAmt = payable.category_id === 'cat-8' ? parseFloat(billAmount) || 0 : null;
      const updated = await updatePayableStatus(payable.id, status, payDate, paidAmount, newAmt);
      onUpdate(updated);
      setIsOpen(false);
    } catch (e) {
      console.error('Error updating status:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addAmount || parseFloat(addAmount) <= 0) return;
    
    setActionLoading(true);
    try {
      const amtVal = parseFloat(addAmount);
      const updated = await addPaymentRecord({
        payable_id: payable.id,
        amount: amtVal,
        payment_date: addDate,
        reference_no: addRefNo || null,
        bank_account: addBankAccount || null,
        notes: addNotes || null
      });
      onUpdate(updated);
      await loadPayments();
      setAddAmount('');
      setAddRefNo('');
      setAddNotes('');
      setSelectedStatus(updated.status);
      setPaymentDate(updated.payment_date || format(new Date(), 'yyyy-MM-dd'));
    } catch (e) {
      console.error('Error adding payment:', e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!confirm('Are you sure you want to delete this payment record?')) return;
    setActionLoading(true);
    try {
      const updated = await deletePaymentRecord(paymentId, payable.id);
      onUpdate(updated);
      await loadPayments();
      setSelectedStatus(updated.status);
      setPaymentDate(updated.payment_date || format(new Date(), 'yyyy-MM-dd'));
    } catch (e) {
      console.error('Error deleting payment:', e);
    } finally {
      setActionLoading(false);
    }
  };

  const statusStyles = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200/50 hover:bg-amber-100/50',
    paid: 'bg-emerald-50 text-emerald-700 border-emerald-200/50 hover:bg-emerald-100/50',
    partial: 'bg-blue-50 text-blue-700 border-blue-200/50 hover:bg-blue-100/50',
    overdue: 'bg-rose-50 text-rose-700 border-rose-200/50 hover:bg-rose-100/50',
    cancelled: 'bg-slate-50 text-slate-600 border-slate-200/50 hover:bg-slate-100/50',
  };

  const remainingBalance = Math.max(0, payable.amount - (payable.paid_amount || 0));

  return (
    <div className="relative inline-block" ref={popoverRef}>
      {/* Badge Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer",
          statusStyles[payable.status]
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        {payable.status === 'partial' && payable.paid_amount ? `partial (${payable.paid_amount.toFixed(3)})` : payable.status}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {/* Centered Modal Dropdown */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop overlay */}
          <div 
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
          />

          {/* Modal Card */}
          <div className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl transition-all z-50 flex flex-col max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-150">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 truncate max-w-[90%]">
                Manage Payments & Status: {payable.title}
              </h3>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold uppercase tracking-wider"
              >
                Cancel
              </button>
            </div>

            {/* Split layout: Status & Payments */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
              {/* Left Column: Status Selection */}
              <div className="md:col-span-2 md:border-r md:border-slate-100 md:pr-6 space-y-4">
                {/* Bill Amount Input for Utility Payments */}
                {payable.category_id === 'cat-8' && (
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Bill Amount (OMR)
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      min="0.00"
                      value={billAmount}
                      onChange={(e) => {
                        setBillAmount(e.target.value);
                      }}
                      placeholder="Enter bill amount"
                      className="w-full rounded border border-slate-200 bg-slate-50 py-1.5 px-3 text-xs text-slate-850 outline-none focus:border-indigo-500 font-numeric"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Select Status
                  </label>
                  {(['pending', 'partial', 'paid', 'overdue', 'cancelled'] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => handleStatusChange(status)}
                      className={cn(
                        "flex w-full items-center justify-between rounded px-2.5 py-2 text-xs font-medium transition-colors hover:bg-slate-50 text-left capitalize",
                        selectedStatus === status ? "text-indigo-650 bg-indigo-50/50 font-bold" : "text-slate-650"
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          status === 'paid' ? 'bg-emerald-500' :
                          status === 'partial' ? 'bg-blue-500' :
                          status === 'overdue' ? 'bg-rose-500' :
                          status === 'pending' ? 'bg-amber-500' : 'bg-slate-500'
                        )} />
                        {status}
                      </span>
                      {selectedStatus === status && <Check className="h-3.5 w-3.5 text-indigo-600" />}
                    </button>
                  ))}
                </div>

                {/* Confirm button for utility bills on non-paid/partial statuses */}
                {payable.category_id === 'cat-8' && (selectedStatus === 'pending' || selectedStatus === 'overdue' || selectedStatus === 'cancelled') && (
                  <div className="pt-3 border-t border-slate-100">
                    <button
                      disabled={loading || !billAmount || parseFloat(billAmount) < 0}
                      onClick={() => saveStatus(selectedStatus, null, null)}
                      className="w-full rounded bg-indigo-600 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Confirm as {selectedStatus}
                    </button>
                  </div>
                )}

                {/* Payment Date input if PAID is selected */}
                {selectedStatus === 'paid' && (
                  <div className="pt-3 border-t border-slate-100 space-y-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Payment Date
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="date"
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                        className="w-full rounded border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2.5 text-xs text-slate-850 outline-none focus:border-indigo-500"
                      />
                    </div>
                    <button
                      disabled={loading || (payable.category_id === 'cat-8' && (!billAmount || parseFloat(billAmount) < 0))}
                      onClick={() => saveStatus('paid', paymentDate, null)}
                      className="w-full rounded bg-indigo-600 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Confirm Paid in Full
                    </button>
                  </div>
                )}
              </div>

              {/* Right Column: Payment History & Record Payment */}
              <div className="md:col-span-3 flex flex-col space-y-4">
                {/* History list */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Payment History
                    </label>
                    <span className="text-[10px] font-semibold text-slate-655 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200/50">
                      Paid: {formatOMR(payable.paid_amount || 0)} {"/"} {formatOMR(payable.amount)}
                    </span>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/30">
                    {loadingPayments ? (
                      <div className="p-6 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
                        <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                        Loading payments...
                      </div>
                    ) : payments.length === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-400">
                        No payments recorded yet.
                      </div>
                    ) : (
                      <div className="max-h-[160px] overflow-y-auto divide-y divide-slate-150">
                        {payments.map((p) => (
                          <div key={p.id} className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors text-xs">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-800">{formatOMR(p.amount)}</span>
                                <span className="text-[10px] text-slate-450 bg-slate-200/50 px-1.5 py-0.2 rounded font-numeric">
                                  {format(parseISO(p.payment_date), 'dd MMM yyyy')}
                                </span>
                              </div>
                              {(p.reference_no || p.notes) && (
                                <div className="text-[10px] text-slate-500 truncate max-w-[260px]">
                                  {p.reference_no && <span className="font-semibold mr-2">Ref: {p.reference_no}</span>}
                                  {p.notes && <span className="italic">{p.notes}</span>}
                                </div>
                              )}
                            </div>
                            <button
                              disabled={actionLoading}
                              onClick={() => handleDeletePayment(p.id)}
                              className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded transition-all"
                              title="Delete payment"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Add Payment Form (Visible if status is 'partial' or there's outstanding amount) */}
                {(selectedStatus === 'partial' || remainingBalance > 0.001) && (
                  <form onSubmit={handleAddPayment} className="border-t border-slate-100 pt-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Record New Payment
                      </label>
                      <span className="text-[10px] font-bold text-blue-650 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200/30">
                        Remaining: {formatOMR(remainingBalance)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wide">
                          Amount (OMR)
                        </label>
                        <input
                          type="number"
                          step="0.001"
                          min="0.001"
                          max={remainingBalance}
                          placeholder={`Max: ${remainingBalance.toFixed(3)}`}
                          value={addAmount}
                          onChange={(e) => setAddAmount(e.target.value)}
                          className="w-full rounded border border-slate-200 bg-slate-50 py-1.5 px-2.5 text-xs text-slate-850 outline-none focus:border-indigo-500 font-numeric"
                          required
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wide">
                          Payment Date
                        </label>
                        <div className="relative">
                          <Calendar className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                          <input
                            type="date"
                            value={addDate}
                            onChange={(e) => setAddDate(e.target.value)}
                            className="w-full rounded border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2 text-xs text-slate-850 outline-none focus:border-indigo-500"
                            required
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wide">
                          Ref No. (Optional)
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. TXN10042"
                          value={addRefNo}
                          onChange={(e) => setAddRefNo(e.target.value)}
                          className="w-full rounded border border-slate-200 bg-slate-50 py-1.5 px-2.5 text-xs text-slate-850 outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wide">
                          Bank Account (Optional)
                        </label>
                        <input
                          type="text"
                          placeholder="Debit account number"
                          value={addBankAccount}
                          onChange={(e) => setAddBankAccount(e.target.value)}
                          className="w-full rounded border border-slate-200 bg-slate-50 py-1.5 px-2.5 text-xs text-slate-850 outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wide">
                        Notes (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Mobile bank transfer"
                        value={addNotes}
                        onChange={(e) => setAddNotes(e.target.value)}
                        className="w-full rounded border border-slate-200 bg-slate-50 py-1.5 px-2.5 text-xs text-slate-850 outline-none focus:border-indigo-500"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={actionLoading || !addAmount || parseFloat(addAmount) <= 0 || parseFloat(addAmount) > remainingBalance}
                      className="w-full rounded bg-indigo-650 py-2 text-xs font-semibold text-white hover:bg-indigo-600 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      Record Payment
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
