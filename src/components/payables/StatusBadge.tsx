'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Payable } from '@/lib/supabase/mockDb';
import { updatePayableStatus } from '@/lib/supabase/queries';
import { Check, ChevronDown, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

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
  const [partialAmount, setPartialAmount] = useState(
    payable.paid_amount ? String(payable.paid_amount) : ''
  );
  const [billAmount, setBillAmount] = useState(String(payable.amount));
  
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
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

  const statusStyles = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200/50 hover:bg-amber-100/50',
    paid: 'bg-emerald-50 text-emerald-700 border-emerald-200/50 hover:bg-emerald-100/50',
    partial: 'bg-blue-50 text-blue-700 border-blue-200/50 hover:bg-blue-100/50',
    overdue: 'bg-rose-50 text-rose-700 border-rose-200/50 hover:bg-rose-100/50',
    cancelled: 'bg-slate-50 text-slate-600 border-slate-200/50 hover:bg-slate-100/50',
  };

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
        {payable.status === 'partial' && payable.paid_amount ? `partial (${payable.paid_amount})` : payable.status}
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
          <div className="relative w-full max-w-xs bg-white border border-slate-200 rounded-2xl p-5 shadow-2xl transition-all">
            <div className="flex items-center justify-between mb-3.5 pb-2 border-b border-slate-100">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Update Status
              </p>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-[10px] font-bold uppercase tracking-wider"
              >
                Cancel
              </button>
            </div>

            {/* Bill Amount Input for Utility Payments */}
            {payable.category_id === 'cat-8' && (
              <div className="mb-3.5 pb-3 border-b border-slate-100 space-y-1.5">
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
                    setPartialAmount(e.target.value);
                  }}
                  placeholder="Enter bill amount"
                  className="w-full rounded border border-slate-200 bg-slate-50 py-1 px-2.5 text-xs text-slate-850 outline-none focus:border-indigo-500 font-numeric"
                />
              </div>
            )}

            <div className="space-y-1">
              {(['pending', 'partial', 'paid', 'overdue', 'cancelled'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => handleStatusChange(status)}
                  className={cn(
                    "flex w-full items-center justify-between rounded px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-slate-50 text-left capitalize",
                    selectedStatus === status ? "text-indigo-600 font-bold" : "text-slate-650"
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
                  {selectedStatus === status && <Check className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>

            {/* Confirm button for utility bills on non-paid/partial statuses */}
            {payable.category_id === 'cat-8' && (selectedStatus === 'pending' || selectedStatus === 'overdue' || selectedStatus === 'cancelled') && (
              <div className="mt-3.5 pt-3.5 border-t border-slate-100">
                <button
                  disabled={loading || !billAmount || parseFloat(billAmount) < 0}
                  onClick={() => saveStatus(selectedStatus, null, null)}
                  className="w-full rounded bg-indigo-600 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {loading ? 'Saving...' : `Confirm as ${selectedStatus}`}
                </button>
              </div>
            )}

            {/* Payment Date & Amount inputs if PARTIAL is selected */}
            {selectedStatus === 'partial' && (
              <div className="mt-3.5 pt-3.5 border-t border-slate-100 space-y-2">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Amount Paid (OMR)
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  max={payable.category_id === 'cat-8' ? parseFloat(billAmount) : payable.amount}
                  placeholder={`Max: ${payable.category_id === 'cat-8' ? billAmount : payable.amount}`}
                  value={partialAmount}
                  onChange={(e) => setPartialAmount(e.target.value)}
                  className="w-full rounded border border-slate-200 bg-slate-50 py-1 px-2 text-xs text-slate-850 outline-none focus:border-indigo-500 font-numeric"
                />
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Payment Date
                </label>
                <div className="relative">
                  <Calendar className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full rounded border border-slate-200 bg-slate-50 py-1 pl-7 pr-2 text-xs text-slate-850 outline-none focus:border-indigo-500"
                  />
                </div>
                <button
                  disabled={loading || !partialAmount || parseFloat(partialAmount) <= 0 || parseFloat(partialAmount) > (payable.category_id === 'cat-8' ? parseFloat(billAmount) : payable.amount)}
                  onClick={() => saveStatus('partial', paymentDate, parseFloat(partialAmount))}
                  className="w-full rounded bg-indigo-600 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Confirm Partial'}
                </button>
              </div>
            )}

            {/* Payment Date input if PAID is selected */}
            {selectedStatus === 'paid' && (
              <div className="mt-3.5 pt-3.5 border-t border-slate-100 space-y-2">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Payment Date
                </label>
                <div className="relative">
                  <Calendar className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full rounded border border-slate-200 bg-slate-50 py-1 pl-7 pr-2 text-xs text-slate-850 outline-none focus:border-indigo-500"
                  />
                </div>
                <button
                  disabled={loading || (payable.category_id === 'cat-8' && (!billAmount || parseFloat(billAmount) < 0))}
                  onClick={() => saveStatus('paid', paymentDate, null)}
                  className="w-full rounded bg-indigo-600 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Confirm Paid'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
