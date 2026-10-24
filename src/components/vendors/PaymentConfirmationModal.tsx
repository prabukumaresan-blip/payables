'use client';

import React, { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { format, parseISO } from 'date-fns';
import { 
  X, 
  Download, 
  FileText, 
  CheckCircle2, 
  Building2, 
  Landmark, 
  Phone, 
  Mail, 
  Calendar, 
  Receipt, 
  Share2,
  Copy,
  Check,
  Loader2,
  Image as ImageIcon,
  Printer
} from 'lucide-react';
import { Vendor, PaymentHistory, Payable, Company } from '@/lib/supabase/mockDb';
import { formatOMR } from '@/lib/utils/formatCurrency';
import { openWhatsApp } from '@/lib/utils/whatsapp';

export interface PaymentConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendor: Vendor;
  payment: PaymentHistory;
  payable?: Payable | null;
  company?: Company | null;
}

export default function PaymentConfirmationModal({
  isOpen,
  onClose,
  vendor,
  payment,
  payable,
  company
}: PaymentConfirmationModalProps) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingImg, setDownloadingImg] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen || !payment) return null;

  // Format payment date safely
  let formattedDate = '';
  try {
    if (payment.payment_date) {
      const parsed = typeof payment.payment_date === 'string' && payment.payment_date.includes('T')
        ? parseISO(payment.payment_date)
        : new Date(payment.payment_date);
      formattedDate = !isNaN(parsed.getTime()) ? format(parsed, 'dd MMMM yyyy') : payment.payment_date;
    } else {
      formattedDate = format(new Date(), 'dd MMMM yyyy');
    }
  } catch {
    formattedDate = payment.payment_date || format(new Date(), 'dd MMMM yyyy');
  }

  const companyName = company?.name || payable?.company?.name || 'Bright Flowers Trading LLC';
  const companyTax = company?.tax_number || payable?.company?.tax_number || 'OM1100234567';
  const companyCr = company?.cr_number || payable?.company?.cr_number || '1249823';

  const voucherNumber = payment.reference_no 
    ? `PAY-${payment.reference_no}` 
    : `PAY-${payment.id.slice(0, 8).toUpperCase()}`;

  const cleanZohoId = payment.zoho_payment_id || 
    (payment.notes && payment.notes.match(/\[ZOHO_PAYMENT:([^\]]+)\]/)?.[1]);

  // Clean notes excluding internal [ZOHO_PAYMENT:...] tags
  const displayNotes = payment.notes ? payment.notes.replace(/\[ZOHO_PAYMENT:[^\]]+\]/g, '').trim() : '';

  // Standard safe filename
  const getFilename = (ext: string) => {
    const sanitizedVendor = vendor.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const ref = payment.reference_no ? payment.reference_no.replace(/[^a-zA-Z0-9_-]/g, '_') : payment.id.slice(0, 6);
    return `Payment_Confirmation_${sanitizedVendor}_${ref}.${ext}`;
  };

  // Browser Print / Save as PDF Fallback (Instant & never freezes)
  const handlePrint = () => {
    window.print();
  };

  // Download PDF using direct jsPDF layout first, with canvas fallback
  const handleDownloadPDF = async () => {
    setDownloadingPdf(true);
    try {
      if (receiptRef.current) {
        // Fast, high-res canvas render
        const element = receiptRef.current;
        const canvas = await html2canvas(element, {
          scale: 1.5, // 1.5 scale prevents browser memory lockup/freezing while maintaining crisp quality
          useCORS: true,
          backgroundColor: '#FFFFFF',
          logging: false
        });

        const imgWidth = 210; // A4 mm
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        const pdf = new jsPDF({
          orientation: 'p',
          unit: 'mm',
          format: 'a4',
          compress: true
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.92);
        pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, Math.min(imgHeight, 297), undefined, 'FAST');
        pdf.save(getFilename('pdf'));
      } else {
        // Direct jsPDF generation fallback if DOM element is detached
        const pdf = new jsPDF();
        pdf.setFontSize(18);
        pdf.text(companyName, 20, 25);
        pdf.setFontSize(12);
        pdf.text(`CR No: ${companyCr}  VAT No: ${companyTax}`, 20, 32);
        pdf.line(20, 35, 190, 35);

        pdf.setFontSize(14);
        pdf.text('PAYMENT CONFIRMATION ADVICE', 20, 45);
        pdf.setFontSize(11);
        pdf.text(`Voucher: ${voucherNumber}`, 20, 55);
        pdf.text(`Date: ${formattedDate}`, 20, 62);
        pdf.text(`Beneficiary: ${vendor.name}`, 20, 72);
        pdf.text(`Bank / Account: ${payment.bank_account || vendor.bank_account || vendor.account_no || 'N/A'}`, 20, 79);
        pdf.text(`Amount: ${formatOMR(payment.amount)}`, 20, 90);
        pdf.text(`Reference No: ${payment.reference_no || 'N/A'}`, 20, 97);
        if (displayNotes) {
          pdf.text(`Notes: ${displayNotes}`, 20, 107);
        }
        pdf.save(getFilename('pdf'));
      }
    } catch (err) {
      console.error('Failed to generate PDF canvas, launching print dialog fallback:', err);
      // If canvas generation fails or is blocked, trigger browser print to save as PDF
      window.print();
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Download Image (PNG)
  const handleDownloadImage = async () => {
    if (!receiptRef.current) return;
    setDownloadingImg(true);
    try {
      const element = receiptRef.current;
      const canvas = await html2canvas(element, {
        scale: 1.5,
        useCORS: true,
        backgroundColor: '#FFFFFF',
        logging: false
      });

      const imgData = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = getFilename('png');
      link.href = imgData;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        try {
          document.body.removeChild(link);
        } catch {}
      }, 150);
    } catch (err) {
      console.error('Failed to generate image:', err);
      alert('Could not generate image. You can use "Print / Save PDF" as a direct alternative.');
    } finally {
      setDownloadingImg(false);
    }
  };

  // Send WhatsApp directly
  const handleSendWhatsApp = () => {
    openWhatsApp({
      vendorName: vendor.name,
      phoneNumber: vendor.phone,
      amount: Number(payment.amount),
      paymentDate: payment.payment_date,
      referenceNo: payment.reference_no,
      bankAccount: payment.bank_account || vendor.bank_account || vendor.account_no,
      companyName: companyName,
      title: payable?.title
    });
  };

  // Copy details
  const handleCopySummary = () => {
    const text = `Payment Confirmation Advice\nVendor: ${vendor.name}\nAmount: ${formatOMR(payment.amount)}\nDate: ${formattedDate}\nReference: ${payment.reference_no || 'N/A'}\nAccount: ${payment.bank_account || vendor.bank_account || vendor.account_no || 'N/A'}`;
    navigator.clipboard.writeText(text);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto">
      {/* Backdrop with explicit click handler */}
      <div 
        className="fixed inset-0 bg-slate-900/75 backdrop-blur-sm transition-opacity print-hide" 
        onClick={onClose} 
      />

      {/* Modal Container */}
      <div 
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Top Control Header */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between border-b border-white/10 shrink-0 print-hide">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-emerald-400" />
            <div>
              <h2 className="text-sm font-bold tracking-wide text-white">Payment Confirmation Advice</h2>
              <p className="text-[10px] text-slate-400 font-mono">{voucherNumber}</p>
            </div>
          </div>

          {/* Quick Action Toolbar */}
          <div className="flex items-center gap-2">
            {vendor.phone && (
              <button
                type="button"
                onClick={handleSendWhatsApp}
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                title="Send via WhatsApp"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span>WhatsApp</span>
              </button>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 shadow-xs transition cursor-pointer"
              title="Print document or Save as PDF"
            >
              <Printer className="h-3.5 w-3.5 text-indigo-300" />
              <span className="hidden sm:inline">Print</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadImage}
              disabled={downloadingImg}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 shadow-xs transition disabled:opacity-50 cursor-pointer"
              title="Download Confirmation as PNG image"
            >
              {downloadingImg ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">Image</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPDF}
              disabled={downloadingPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50 cursor-pointer"
              title="Download Official PDF Confirmation Advice"
            >
              {downloadingPdf ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  <span>Download PDF</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              title="Close window"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Printable Confirmation Document */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100/70 flex justify-center">
          <div 
            ref={receiptRef}
            className="printable-voucher w-full max-w-xl bg-white rounded-xl border border-slate-200/90 shadow-md p-6 sm:p-8 space-y-6 text-slate-800"
          >
            {/* Advice Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-5 gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">
                    {companyName.slice(0, 1)}
                  </div>
                  <h1 className="text-base font-extrabold tracking-tight text-slate-900 uppercase">
                    {companyName}
                  </h1>
                </div>
                <div className="text-[11px] text-slate-500 space-y-0.5">
                  <p>Sultanate of Oman • Finance & Accounts</p>
                  {(companyCr || companyTax) && (
                    <p className="font-mono text-[10px]">
                      {companyCr && `CR No: ${companyCr}`}
                      {companyCr && companyTax && ' • '}
                      {companyTax && `VAT No: ${companyTax}`}
                    </p>
                  )}
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="inline-block px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold tracking-wider uppercase">
                  Payment Confirmed
                </span>
                <p className="text-[11px] font-mono text-slate-500 mt-1.5">{voucherNumber}</p>
                <p className="text-[11px] text-slate-400">{formattedDate}</p>
              </div>
            </div>

            {/* Beneficiary & Payer Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
              {/* Beneficiary */}
              <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/70 space-y-1.5">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">
                  Beneficiary / Paid To
                </span>
                <p className="text-sm font-bold text-slate-900">{vendor.name}</p>
                {vendor.contact_person && (
                  <p className="text-[11px] text-slate-600">Attn: {vendor.contact_person}</p>
                )}
                <div className="space-y-0.5 text-[11px] text-slate-500 pt-0.5">
                  {vendor.phone && (
                    <p className="flex items-center gap-1.5">
                      <Phone className="h-3 w-3 text-slate-400" />
                      {vendor.phone}
                    </p>
                  )}
                  {vendor.email && (
                    <p className="flex items-center gap-1.5">
                      <Mail className="h-3 w-3 text-slate-400" />
                      {vendor.email}
                    </p>
                  )}
                </div>
              </div>

              {/* Bank & Remittance details */}
              <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/70 space-y-1.5">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">
                  Remittance / Account Credited
                </span>
                <p className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <Landmark className="h-3.5 w-3.5 text-slate-500" />
                  {vendor.bank_name || 'Bank Muscat / Commercial Bank'}
                </p>
                <p className="font-mono text-xs text-slate-700 bg-white px-2 py-1 rounded border border-slate-200/60 inline-block font-medium">
                  {payment.bank_account || vendor.bank_account || vendor.account_no || 'Standard Bank Account'}
                </p>
                {vendor.swift_code && (
                  <p className="text-[10px] font-mono text-slate-500">
                    SWIFT: <strong>{vendor.swift_code}</strong>
                  </p>
                )}
              </div>
            </div>

            {/* Payment Amount Display Card */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-emerald-500/10 border border-emerald-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
                  Amount Transferred
                </span>
                <p className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-700 mt-0.5">
                  {formatOMR(payment.amount)}
                </p>
                <span className="text-[10px] font-semibold text-emerald-600 block mt-0.5">
                  Omani Rials • Transferred in Full
                </span>
              </div>
              <div className="p-3 rounded-full bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="h-7 w-7" />
              </div>
            </div>

            {/* Transaction Particulars Table */}
            <div className="space-y-2">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Transaction Particulars
              </h3>
              <div className="overflow-hidden rounded-xl border border-slate-200 text-xs">
                <table className="w-full text-left">
                  <tbody className="divide-y divide-slate-100">
                    <tr className="bg-slate-50/50">
                      <td className="py-2 px-3 text-slate-500 font-medium w-1/3">Payment Date</td>
                      <td className="py-2 px-3 font-semibold text-slate-800">{formattedDate}</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 text-slate-500 font-medium">Reference / Txn No</td>
                      <td className="py-2 px-3 font-mono font-semibold text-slate-900">
                        {payment.reference_no || 'Direct Transfer'}
                      </td>
                    </tr>
                    {payable && (
                      <tr className="bg-slate-50/50">
                        <td className="py-2 px-3 text-slate-500 font-medium">Applied Bill / Payable</td>
                        <td className="py-2 px-3 text-slate-800">
                          <span className="font-semibold">{payable.title}</span>
                          {payable.zoho_bill_number && (
                            <span className="ml-2 font-mono text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200">
                              Zoho Bill: {payable.zoho_bill_number}
                            </span>
                          )}
                        </td>
                      </tr>
                    )}
                    {cleanZohoId && (
                      <tr>
                        <td className="py-2 px-3 text-slate-500 font-medium">Zoho Books Payment</td>
                        <td className="py-2 px-3 font-mono text-xs text-blue-700 font-semibold">
                          #{cleanZohoId} (Synchronized)
                        </td>
                      </tr>
                    )}
                    {displayNotes && (
                      <tr className="bg-slate-50/50">
                        <td className="py-2 px-3 text-slate-500 font-medium">Remarks / Description</td>
                        <td className="py-2 px-3 text-slate-700 italic">{displayNotes}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Official Signoff Strip */}
            <div className="pt-6 border-t border-slate-200 flex items-end justify-between text-xs text-slate-400">
              <div className="space-y-1">
                <p className="text-[10px] text-slate-400 italic">
                  This document serves as an electronic confirmation of payment.
                </p>
                <p className="text-[10px] font-mono text-slate-400">
                  Generated by Payables System • {format(new Date(), 'dd/MM/yyyy HH:mm')}
                </p>
              </div>

              <div className="text-center">
                <div className="h-10 border-b border-dashed border-slate-300 w-36 mb-1" />
                <span className="text-[9px] uppercase tracking-wider font-semibold text-slate-500">
                  Authorized Signatory
                </span>
              </div>
            </div>

          </div>
        </div>

        {/* Modal Bottom Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0 print-hide">
          <button
            type="button"
            onClick={handleCopySummary}
            className="inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900 transition font-medium cursor-pointer"
          >
            {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copiedLink ? 'Copied to Clipboard' : 'Copy Text Summary'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 font-semibold transition shadow-xs cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
