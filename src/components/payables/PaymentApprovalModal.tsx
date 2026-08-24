'use client';

import React, { useState, useRef } from 'react';
import html2canvas from 'html2canvas';
import { 
  X, 
  Download, 
  Loader2, 
  FileCheck2
} from 'lucide-react';
import { formatOMR } from '@/lib/utils/formatCurrency';
import { cn } from '@/lib/utils';

export interface ApprovalPaymentItem {
  id: string;
  title: string;
  vendorName: string;
  bankAccount: string;
  bankCode?: string;
  amount: number;
  remarks: string;
  categoryName?: string;
}

export interface PaymentApprovalData {
  batchId: string;
  exportDate: string;
  debitAccount: string;
  debitName: string;
  items: ApprovalPaymentItem[];
  totalAmount: number;
}

interface PaymentApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: PaymentApprovalData | null;
}

export default function PaymentApprovalModal({
  isOpen,
  onClose,
  data
}: PaymentApprovalModalProps) {
  const [openingBalance, setOpeningBalance] = useState<string>('0.000');
  const [closingBalanceOverride, setClosingBalanceOverride] = useState<string | null>(null);
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);
  
  const approvalCardRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !data) return null;

  const totalAmount = data.totalAmount;
  const numOpening = parseFloat(openingBalance) || 0;
  
  // Calculate default closing balance: Opening - Total Amount
  const calculatedClosing = numOpening - totalAmount;
  const currentClosingBalance = closingBalanceOverride !== null 
    ? closingBalanceOverride 
    : calculatedClosing.toFixed(3);

  const handleOpeningBalanceChange = (val: string) => {
    setOpeningBalance(val);
    const newOpening = parseFloat(val) || 0;
    setClosingBalanceOverride((newOpening - totalAmount).toFixed(3));
  };

  const handleDownloadImage = async () => {
    if (!approvalCardRef.current) return;
    setIsDownloadingImage(true);
    try {
      const element = approvalCardRef.current;
      
      const canvas = await html2canvas(element, {
        scale: 1.25, // Compact, sharp & optimized image size
        useCORS: true,
        backgroundColor: '#FFFFFF',
        logging: false
      });

      const imgData = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      const filename = `Payment_Request_${data.batchId || 'Approval'}.png`;
      link.href = imgData;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Failed to generate image:', err);
    } finally {
      setIsDownloadingImage(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 overflow-y-auto bg-black/60 backdrop-blur-xs">
      <div 
        className="fixed inset-0" 
        onClick={onClose}
      />

      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-indigo-600" />
            <div>
              <h2 className="text-xs font-bold text-slate-900">Payment Request for Approval</h2>
              <p className="text-[10px] text-slate-500">Ref: {data.batchId} • {data.exportDate}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadImage}
              disabled={isDownloadingImage}
              className="flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-500 shadow-xs disabled:opacity-50 transition cursor-pointer"
            >
              {isDownloadingImage ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Download className="h-3 w-3" />
                  <span>Download Image</span>
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-slate-100/60">
          {/* Quick Editable Balances Strip */}
          <div className="grid grid-cols-2 gap-2 p-2.5 bg-white rounded-lg border border-slate-200 shadow-xs">
            <div>
              <label className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block mb-0.5">
                Opening Bank Balance
              </label>
              <input
                type="number"
                step="0.001"
                value={openingBalance}
                onChange={(e) => handleOpeningBalanceChange(e.target.value)}
                placeholder="0.000"
                className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-800 focus:bg-white focus:border-indigo-500 outline-none font-numeric"
              />
            </div>

            <div>
              <label className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block mb-0.5">
                Closing Bank Balance
              </label>
              <input
                type="number"
                step="0.001"
                value={currentClosingBalance}
                onChange={(e) => setClosingBalanceOverride(e.target.value)}
                placeholder="0.000"
                className={cn(
                  "w-full rounded border px-2 py-1 text-xs font-semibold focus:bg-white focus:border-indigo-500 outline-none font-numeric",
                  parseFloat(currentClosingBalance) < 0 
                    ? "border-rose-300 bg-rose-50/50 text-rose-700" 
                    : "border-slate-200 bg-slate-50 text-slate-800"
                )}
              />
            </div>
          </div>

          {/* Simple Compact Document Container to be Captured */}
          <div className="flex justify-center">
            <div 
              ref={approvalCardRef}
              className="w-full bg-white rounded-lg border border-slate-200 shadow-xs p-4 text-slate-800 space-y-3"
              style={{ maxWidth: '520px' }}
            >
              {/* Header */}
              <div className="flex justify-between items-start border-b border-slate-200 pb-2">
                <div>
                  <h1 className="text-xs font-bold uppercase tracking-wider text-slate-900 leading-none">
                    Payment Request
                  </h1>
                  <p className="text-[11px] text-slate-600 font-medium mt-1 leading-tight">{data.debitName}</p>
                  <p className="text-[10px] text-slate-400 font-mono">A/C: {data.debitAccount}</p>
                </div>
                <div className="text-right text-[10px]">
                  <p className="font-semibold text-slate-700">{data.exportDate}</p>
                  <p className="text-slate-400 font-mono">Ref: {data.batchId}</p>
                </div>
              </div>

              {/* Payment Details Table */}
              <div className="space-y-1">
                <table className="w-full text-[11px] text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      <th className="py-1 px-1.5 w-5 text-center">#</th>
                      <th className="py-1 px-1.5">Beneficiary & A/C</th>
                      <th className="py-1 px-1.5">Remarks</th>
                      <th className="py-1 px-1.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.items.map((item, idx) => (
                      <tr key={item.id || idx}>
                        <td className="py-1.5 px-1.5 text-center text-slate-400 text-[10px] align-top">{idx + 1}</td>
                        <td className="py-1.5 px-1.5 align-top">
                          <p className="font-semibold text-slate-900 leading-snug break-words">
                            {item.vendorName || item.title}
                          </p>
                          <p className="text-[9px] text-slate-400 font-mono mt-0.5">{item.bankAccount || '—'}</p>
                        </td>
                        <td className="py-1.5 px-1.5 text-slate-600 text-[10px] leading-snug break-words align-top">
                          {item.remarks || 'PAYMENT'}
                        </td>
                        <td className="py-1.5 px-1.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap align-top">
                          {formatOMR(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 font-bold text-slate-900">
                      <td colSpan={3} className="py-1.5 px-1.5 text-right text-[10px] uppercase tracking-wider text-slate-500">
                        Total:
                      </td>
                      <td className="py-1.5 px-1.5 text-right font-mono text-xs text-indigo-700 whitespace-nowrap">
                        {formatOMR(totalAmount)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Bank Balances Summary */}
              <div className="border border-slate-200 rounded p-2 bg-slate-50/80 text-[11px] space-y-1">
                <div className="flex justify-between items-center text-slate-600">
                  <span>Opening Bank Balance:</span>
                  <span className="font-mono font-semibold text-slate-800">{formatOMR(numOpening)}</span>
                </div>
                <div className="flex justify-between items-center text-indigo-700">
                  <span>Total Batch Payment:</span>
                  <span className="font-mono font-bold">- {formatOMR(totalAmount)}</span>
                </div>
                <div className="border-t border-slate-200 pt-1 flex justify-between items-center font-bold text-slate-900">
                  <span>Closing Bank Balance:</span>
                  <span className={cn(
                    "font-mono",
                    parseFloat(currentClosingBalance) < 0 ? "text-rose-600" : "text-emerald-700"
                  )}>
                    {formatOMR(parseFloat(currentClosingBalance) || 0)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200/80 transition"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleDownloadImage}
            disabled={isDownloadingImage}
            className="rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500 shadow-xs disabled:opacity-50 flex items-center gap-1 transition cursor-pointer"
          >
            {isDownloadingImage ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Download className="h-3 w-3" /> Download Image
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
