'use client';

import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { 
  Vendor, 
  Payable, 
  PaymentHistory, 
  Category 
} from '@/lib/supabase/mockDb';
import { 
  addPaymentRecord, 
  deletePaymentRecord, 
  getAllPaymentHistory, 
  deletePayable 
} from '@/lib/supabase/queries';
import { openWhatsApp } from '@/lib/utils/whatsapp';
import PayableForm from '@/components/payables/PayableForm';
import { 
  X, 
  Plus, 
  Search, 
  Receipt, 
  CreditCard, 
  Calendar, 
  Building2, 
  DollarSign, 
  ArrowUpRight, 
  ArrowDownLeft, 
  FileText, 
  Edit3, 
  Trash2, 
  ExternalLink, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Loader2,
  Phone,
  Mail,
  Send,
  Layers,
  Check
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface VendorTransactionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendor: Vendor;
  categories: Category[];
  allPayables: Payable[];
  onDataRefresh: () => Promise<void> | void;
}

export default function VendorTransactionsModal({
  isOpen,
  onClose,
  vendor,
  categories,
  allPayables,
  onDataRefresh,
}: VendorTransactionsModalProps) {
  // Tabs: 'all' | 'bills' | 'payments'
  const [activeTab, setActiveTab] = useState<'all' | 'bills' | 'payments'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid' | 'partial' | 'overdue'>('all');

  // Payment history for all payables related to this vendor
  const [vendorPayments, setVendorPayments] = useState<PaymentHistory[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);

  // New Bill modal state
  const [isAddBillOpen, setIsAddBillOpen] = useState(false);
  const [editingPayable, setEditingPayable] = useState<Payable | null>(null);

  // Direct Record Payment state
  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);
  const [selectedPayableForPayment, setSelectedPayableForPayment] = useState<Payable | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [payRefNo, setPayRefNo] = useState('');
  const [payBankAccount, setPayBankAccount] = useState(vendor.bank_account || vendor.account_no || '');
  const [payNotes, setPayNotes] = useState('');
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [paymentSuccessMsg, setPaymentSuccessMsg] = useState<string | null>(null);

  // Filter bills belonging to this vendor
  const vendorBills = allPayables.filter(p => {
    if (!p.vendor_name) return false;
    return p.vendor_name.trim().toLowerCase() === vendor.name.trim().toLowerCase();
  });

  const vendorBillIds = new Set(vendorBills.map(p => p.id));

  // Load payment records matching this vendor's bills
  const loadPaymentRecords = async () => {
    setLoadingPayments(true);
    try {
      const allHistory = await getAllPaymentHistory();
      const filtered = allHistory.filter(ph => vendorBillIds.has(ph.payable_id));
      setVendorPayments(filtered);
    } catch (e) {
      console.error('Error fetching vendor payments:', e);
    } finally {
      setLoadingPayments(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadPaymentRecords();
      setPaymentSuccessMsg(null);
      setPayError(null);
    }
  }, [isOpen, vendor.id, allPayables.length]);

  if (!isOpen) return null;

  // Totals calculations
  const totalBilled = vendorBills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  const totalPaid = vendorBills.reduce((sum, b) => sum + (Number(b.paid_amount) || 0), 0);
  const outstandingFromBills = Math.max(0, totalBilled - totalPaid);
  const zohoBalance = Number(vendor.outstanding_payable_amount) || 0;

  // Unpaid or partially paid bills for recording payments
  const unpaidBills = vendorBills.filter(b => b.status !== 'paid' && b.status !== 'cancelled');

  // Open Record Payment modal
  const handleOpenRecordPayment = (payable?: Payable) => {
    setPayError(null);
    setPaymentSuccessMsg(null);
    if (payable) {
      setSelectedPayableForPayment(payable);
      const remaining = Math.max(0, (Number(payable.amount) || 0) - (Number(payable.paid_amount) || 0));
      setPayAmount(remaining > 0 ? remaining.toFixed(3) : '');
    } else {
      const defaultP = unpaidBills[0] || null;
      setSelectedPayableForPayment(defaultP);
      if (defaultP) {
        const remaining = Math.max(0, (Number(defaultP.amount) || 0) - (Number(defaultP.paid_amount) || 0));
        setPayAmount(remaining > 0 ? remaining.toFixed(3) : '');
      } else {
        setPayAmount('');
      }
    }
    setPayDate(format(new Date(), 'yyyy-MM-dd'));
    setPayRefNo('');
    setPayBankAccount(vendor.bank_account || vendor.account_no || '');
    setPayNotes(`Payment to ${vendor.name}`);
    setIsRecordPaymentOpen(true);
  };

  // Submit recorded payment
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPayableForPayment) {
      setPayError('Please select a bill to apply payment to.');
      return;
    }
    const amtNum = parseFloat(payAmount);
    if (isNaN(amtNum) || amtNum <= 0) {
      setPayError('Please enter a valid amount greater than 0 OMR.');
      return;
    }

    setPaySubmitting(true);
    setPayError(null);

    try {
      // Direct WhatsApp notification if vendor has phone
      if (vendor.phone) {
        openWhatsApp({
          vendorName: vendor.name,
          phoneNumber: vendor.phone,
          amount: amtNum,
          paymentDate: payDate,
          referenceNo: payRefNo || null,
          bankAccount: payBankAccount || null,
          title: selectedPayableForPayment.title
        });
      }

      await addPaymentRecord({
        payable_id: selectedPayableForPayment.id,
        amount: amtNum,
        payment_date: payDate,
        reference_no: payRefNo || null,
        bank_account: payBankAccount || null,
        notes: payNotes || null,
        company_id: selectedPayableForPayment.company_id || vendor.company_id || null
      });

      setPaymentSuccessMsg(`Payment of OMR ${amtNum.toFixed(3)} recorded successfully!`);
      await onDataRefresh();
      await loadPaymentRecords();
      setIsRecordPaymentOpen(false);
    } catch (err: any) {
      console.error('Error submitting payment:', err);
      setPayError(err?.message || 'Failed to record payment. Please try again.');
    } finally {
      setPaySubmitting(false);
    }
  };

  // Delete payment
  const handleDeletePayment = async (ph: PaymentHistory) => {
    if (!confirm(`Are you sure you want to delete payment record of OMR ${Number(ph.amount).toFixed(3)}?`)) return;
    try {
      await deletePaymentRecord(ph.id, ph.payable_id);
      await onDataRefresh();
      await loadPaymentRecords();
    } catch (err) {
      console.error('Error deleting payment:', err);
      alert('Failed to delete payment record.');
    }
  };

  // Delete bill
  const handleDeleteBill = async (payableId: string) => {
    if (!confirm('Are you sure you want to delete this bill? All related payments will also be affected.')) return;
    try {
      await deletePayable(payableId);
      await onDataRefresh();
      await loadPaymentRecords();
    } catch (err) {
      console.error('Error deleting bill:', err);
      alert('Failed to delete bill.');
    }
  };

  // Unified Transaction timeline list
  interface TimelineItem {
    id: string;
    type: 'bill' | 'payment';
    date: string;
    amount: number;
    title: string;
    referenceNo?: string | null;
    status?: string;
    paidAmount?: number | null;
    rawPayable?: Payable;
    rawPayment?: PaymentHistory;
  }

  const timelineItems: TimelineItem[] = [];

  if (activeTab === 'all' || activeTab === 'bills') {
    vendorBills.forEach(b => {
      if (statusFilter !== 'all' && b.status !== statusFilter) return;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const match = b.title.toLowerCase().includes(q) || 
                      (b.reference_no && b.reference_no.toLowerCase().includes(q)) ||
                      (b.notes && b.notes.toLowerCase().includes(q));
        if (!match) return;
      }
      timelineItems.push({
        id: `bill-${b.id}`,
        type: 'bill',
        date: b.due_date || b.created_at.split('T')[0],
        amount: Number(b.amount) || 0,
        title: b.title,
        referenceNo: b.reference_no,
        status: b.status,
        paidAmount: b.paid_amount,
        rawPayable: b
      });
    });
  }

  if (activeTab === 'all' || activeTab === 'payments') {
    vendorPayments.forEach(p => {
      const parentBill = vendorBills.find(b => b.id === p.payable_id);
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const match = (parentBill?.title && parentBill.title.toLowerCase().includes(q)) ||
                      (p.reference_no && p.reference_no.toLowerCase().includes(q)) ||
                      (p.notes && p.notes.toLowerCase().includes(q));
        if (!match) return;
      }
      timelineItems.push({
        id: `pay-${p.id}`,
        type: 'payment',
        date: p.payment_date,
        amount: Number(p.amount) || 0,
        title: `Payment for: ${parentBill?.title || 'Bill'}`,
        referenceNo: p.reference_no,
        status: 'completed',
        rawPayment: p,
        rawPayable: parentBill
      });
    });
  }

  // Sort unified items newest first
  timelineItems.sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" 
        onClick={onClose} 
      />

      {/* Main Modal Card */}
      <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl border border-slate-200/80 flex flex-col max-h-[94vh] overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header Bar */}
        <div className="px-6 py-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white shrink-0 flex items-start justify-between border-b border-white/10">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-white/10 text-white ring-1 ring-white/20">
                <Building2 className="h-6 w-6 text-indigo-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold tracking-tight text-white">{vendor.name}</h2>
                  <span className={cn(
                    "text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ring-1",
                    vendor.bank_type === 'OTHER_BANK' 
                      ? "bg-amber-400/20 text-amber-300 ring-amber-400/30" 
                      : "bg-indigo-400/20 text-indigo-300 ring-indigo-400/30"
                  )}>
                    {vendor.bank_type === 'OTHER_BANK' ? 'Other Bank' : 'Bank Muscat'}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-300 mt-1 flex-wrap">
                  {vendor.contact_person && (
                    <span>Contact: <strong className="text-white font-medium">{vendor.contact_person}</strong></span>
                  )}
                  {vendor.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3 text-emerald-400" /> {vendor.phone}
                    </span>
                  )}
                  {vendor.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3 text-blue-400" /> {vendor.email}
                    </span>
                  )}
                  {vendor.account_no && (
                    <span className="font-mono bg-white/10 px-2 py-0.5 rounded text-white/90">
                      Acc: {vendor.account_no} {vendor.bank_name ? `(${vendor.bank_name})` : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Stats Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 bg-slate-50/80 border-b border-slate-200/80 text-xs shrink-0">
          <div className="p-4">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">Total Billed</span>
            <span className="text-base font-bold text-slate-900 font-mono mt-0.5 block">
              OMR {totalBilled.toFixed(3)}
            </span>
            <span className="text-[10px] text-slate-400 mt-0.5 block">{vendorBills.length} bills recorded</span>
          </div>
          <div className="p-4">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">Total Paid Out</span>
            <span className="text-base font-bold text-emerald-600 font-mono mt-0.5 block">
              OMR {totalPaid.toFixed(3)}
            </span>
            <span className="text-[10px] text-slate-400 mt-0.5 block">{vendorPayments.length} payment receipts</span>
          </div>
          <div className="p-4">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">Tracker Unpaid</span>
            <span className={cn(
              "text-base font-bold font-mono mt-0.5 block",
              outstandingFromBills > 0 ? "text-amber-600" : "text-slate-700"
            )}>
              OMR {outstandingFromBills.toFixed(3)}
            </span>
            <span className="text-[10px] text-slate-400 mt-0.5 block">{unpaidBills.length} pending bill(s)</span>
          </div>
          <div className="p-4 bg-indigo-50/40">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-900 block flex items-center justify-between">
              <span>Zoho Balance</span>
              {vendor.zoho_contact_id && (
                <span className="text-[9px] text-indigo-500 font-mono font-normal">ID: {vendor.zoho_contact_id}</span>
              )}
            </span>
            <span className={cn(
              "text-base font-bold font-mono mt-0.5 block",
              zohoBalance > 0 ? "text-rose-600" : "text-emerald-600"
            )}>
              OMR {zohoBalance.toFixed(3)}
            </span>
            <span className="text-[10px] text-indigo-600/70 mt-0.5 block">Live from Books</span>
          </div>
        </div>

        {/* Action Controls & Navigation Toolbar */}
        <div className="p-4 bg-white border-b border-slate-200/80 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between shrink-0">
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-start">
            <button
              onClick={() => setActiveTab('all')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                activeTab === 'all' 
                  ? "bg-white text-slate-900 shadow-sm" 
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              All Transactions ({timelineItems.length})
            </button>
            <button
              onClick={() => setActiveTab('bills')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5",
                activeTab === 'bills' 
                  ? "bg-white text-slate-900 shadow-sm" 
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Receipt className="h-3.5 w-3.5 text-indigo-600" />
              Bills ({vendorBills.length})
            </button>
            <button
              onClick={() => setActiveTab('payments')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5",
                activeTab === 'payments' 
                  ? "bg-white text-slate-900 shadow-sm" 
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <CreditCard className="h-3.5 w-3.5 text-emerald-600" />
              Payments ({vendorPayments.length})
            </button>
          </div>

          {/* Quick Transaction Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleOpenRecordPayment()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-wider shadow-sm hover:shadow transition-all"
            >
              <ArrowUpRight className="h-4 w-4" />
              Make Payment
            </button>
            <button
              onClick={() => {
                setEditingPayable(null);
                setIsAddBillOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold uppercase tracking-wider shadow-sm hover:shadow transition-all"
            >
              <Plus className="h-4 w-4" />
              Create Bill
            </button>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="px-6 py-2.5 bg-slate-50/50 border-b border-slate-100 flex items-center gap-3 shrink-0 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search reference, title or notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {activeTab !== 'payments' && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 font-medium">Status:</span>
              <select
                value={statusFilter}
                onChange={(e: any) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-indigo-500"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="partial">Partial</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>
          )}

          {paymentSuccessMsg && (
            <div className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
              <Check className="h-3.5 w-3.5" />
              {paymentSuccessMsg}
            </div>
          )}
        </div>

        {/* Transactions List Area */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-0">
          {timelineItems.length === 0 ? (
            <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center">
              <FileText className="h-10 w-10 text-slate-300 mb-2 stroke-[1.5]" />
              <p className="text-sm font-medium text-slate-600">No transactions found for this vendor</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                You can create a new bill or record a payment directly using the action buttons above.
              </p>
              <div className="flex items-center gap-2 mt-4">
                <button
                  onClick={() => setIsAddBillOpen(true)}
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold"
                >
                  Create Bill
                </button>
                <button
                  onClick={() => handleOpenRecordPayment()}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-semibold"
                >
                  Record Payment
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {timelineItems.map((item) => {
                const isBill = item.type === 'bill';
                return (
                  <div 
                    key={item.id} 
                    className="p-4 hover:bg-slate-50/70 transition-colors flex items-center justify-between gap-4 group"
                  >
                    {/* Left Icon & Details */}
                    <div className="flex items-start gap-3.5">
                      <div className={cn(
                        "p-2.5 rounded-xl shrink-0 mt-0.5",
                        isBill 
                          ? "bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100" 
                          : "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100"
                      )}>
                        {isBill ? <Receipt className="h-5 w-5" /> : <CreditCard className="h-5 w-5" />}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-slate-900">{item.title}</span>
                          
                          {/* Type Pill */}
                          <span className={cn(
                            "text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full",
                            isBill ? "bg-indigo-50 text-indigo-700 border border-indigo-200/50" : "bg-emerald-50 text-emerald-700 border border-emerald-200/50"
                          )}>
                            {isBill ? 'Bill' : 'Payment'}
                          </span>

                          {/* Status Pill for Bills */}
                          {isBill && item.status && (
                            <span className={cn(
                              "text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border",
                              item.status === 'paid' && "bg-emerald-50 text-emerald-700 border-emerald-200",
                              item.status === 'pending' && "bg-amber-50 text-amber-700 border-amber-200",
                              item.status === 'partial' && "bg-blue-50 text-blue-700 border-blue-200",
                              item.status === 'overdue' && "bg-rose-50 text-rose-700 border-rose-200"
                            )}>
                              {item.status}
                            </span>
                          )}

                          {/* Reference Number */}
                          {item.referenceNo && (
                            <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              Ref: {item.referenceNo}
                            </span>
                          )}

                          {/* Zoho Bill Link */}
                          {isBill && item.rawPayable?.zoho_bill_number && (
                            <span className="text-[10px] font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                              Zoho Bill: {item.rawPayable.zoho_bill_number}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-slate-400" />
                            {isBill ? 'Due: ' : 'Paid on: '}
                            {format(new Date(item.date), 'dd MMM yyyy')}
                          </span>

                          {isBill && item.rawPayable && (
                            <span>
                              Paid: <strong className="text-emerald-700 font-mono">OMR {(Number(item.rawPayable.paid_amount) || 0).toFixed(3)}</strong>
                              {' '}/ Balance: <strong className="text-rose-600 font-mono">OMR {Math.max(0, item.amount - (Number(item.rawPayable.paid_amount) || 0)).toFixed(3)}</strong>
                            </span>
                          )}

                          {!isBill && item.rawPayment?.bank_account && (
                            <span className="font-mono text-[11px] text-slate-400">
                              Bank: {item.rawPayment.bank_account}
                            </span>
                          )}

                          {!isBill && item.rawPayment?.zoho_payment_id && (
                            <span className="text-[10px] text-blue-600 font-semibold bg-blue-50 px-1.5 py-0.5 rounded">
                              Zoho Payment Synced
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right Amount & Quick Actions */}
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <span className={cn(
                          "text-base font-bold font-mono block",
                          isBill ? "text-slate-900" : "text-emerald-600"
                        )}>
                          {isBill ? '' : '- '}OMR {item.amount.toFixed(3)}
                        </span>
                        <span className="text-[10px] uppercase font-semibold text-slate-400">
                          {isBill ? 'Bill Amount' : 'Amount Paid'}
                        </span>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity">
                        {isBill && item.rawPayable && (
                          <>
                            {item.status !== 'paid' && (
                              <button
                                onClick={() => handleOpenRecordPayment(item.rawPayable)}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold transition-colors flex items-center gap-1"
                                title="Pay this bill"
                              >
                                <ArrowUpRight className="h-3.5 w-3.5" />
                                Pay
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setEditingPayable(item.rawPayable || null);
                                setIsAddBillOpen(true);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                              title="Edit Bill"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteBill(item.rawPayable!.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                              title="Delete Bill"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}

                        {!isBill && item.rawPayment && (
                          <button
                            onClick={() => handleDeletePayment(item.rawPayment!)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Delete Payment Record"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div>
            Showing <strong className="text-slate-800 font-semibold">{timelineItems.length}</strong> transaction entries
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold transition-colors"
          >
            Close
          </button>
        </div>

      </div>

      {/* Nested Modal: Create / Edit Bill */}
      {isAddBillOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" 
            onClick={() => setIsAddBillOpen(false)} 
          />
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl p-6 overflow-y-auto max-h-[90vh] z-10 border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-bold text-slate-900">
                {editingPayable ? 'Edit Bill / Payable' : `New Bill for ${vendor.name}`}
              </h3>
              <button
                onClick={() => setIsAddBillOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <PayableForm
              categories={categories}
              payable={editingPayable}
              defaultVendorName={vendor.name}
              onSuccess={async () => {
                setIsAddBillOpen(false);
                setEditingPayable(null);
                await onDataRefresh();
                await loadPaymentRecords();
              }}
              onCancel={() => {
                setIsAddBillOpen(false);
                setEditingPayable(null);
              }}
            />
          </div>
        </div>
      )}

      {/* Nested Modal: Record Payment Direct */}
      {isRecordPaymentOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" 
            onClick={() => { if (!paySubmitting) setIsRecordPaymentOpen(false); }} 
          />
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden z-10 border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">Record Payment to Vendor</h3>
                <p className="text-xs text-emerald-100 mt-0.5">{vendor.name}</p>
              </div>
              <button
                onClick={() => setIsRecordPaymentOpen(false)}
                disabled={paySubmitting}
                className="p-1 rounded-lg text-emerald-100 hover:text-white hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitPayment} className="p-6 space-y-4">
              {payError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-500 mt-0.5" />
                  <span>{payError}</span>
                </div>
              )}

              {/* Select Bill */}
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Select Bill / Payable to Pay <span className="text-rose-500">*</span>
                </label>
                {unpaidBills.length > 0 ? (
                  <select
                    value={selectedPayableForPayment?.id || ''}
                    onChange={(e) => {
                      const p = vendorBills.find(b => b.id === e.target.value) || null;
                      setSelectedPayableForPayment(p);
                      if (p) {
                        const remaining = Math.max(0, (Number(p.amount) || 0) - (Number(p.paid_amount) || 0));
                        setPayAmount(remaining.toFixed(3));
                      }
                    }}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-500"
                  >
                    {unpaidBills.map((b) => {
                      const remaining = Math.max(0, (Number(b.amount) || 0) - (Number(b.paid_amount) || 0));
                      return (
                        <option key={b.id} value={b.id}>
                          {b.title} — Due: {b.due_date} (Remaining: OMR {remaining.toFixed(3)})
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800">
                    No pending bills found for this vendor. Please create a bill first before recording payment.
                  </div>
                )}
              </div>

              {/* Amount and Date */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Amount (OMR) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    required
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    placeholder="0.000"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-mono font-bold text-slate-800 outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Payment Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Reference & Bank Details */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Reference / Cheque No
                  </label>
                  <input
                    type="text"
                    value={payRefNo}
                    onChange={(e) => setPayRefNo(e.target.value)}
                    placeholder="e.g. TR-98234"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Debit / Vendor Bank
                  </label>
                  <input
                    type="text"
                    value={payBankAccount}
                    onChange={(e) => setPayBankAccount(e.target.value)}
                    placeholder="Account No / Bank"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="Optional payment notes..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              {/* WhatsApp Notification Tip */}
              {vendor.phone && (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-center gap-2 text-xs text-emerald-800">
                  <Phone className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>A WhatsApp payment confirmation will automatically open for <strong>{vendor.phone}</strong></span>
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={paySubmitting}
                  onClick={() => setIsRecordPaymentOpen(false)}
                  className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={paySubmitting || unpaidBills.length === 0}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-wider shadow-md shadow-emerald-600/20 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {paySubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Recording...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" /> Save & Pay
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
