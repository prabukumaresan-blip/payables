'use client';

import React, { useState } from 'react';
import jsPDF from 'jspdf';
import { format, parseISO } from 'date-fns';
import { 
  X, 
  Download, 
  FileText, 
  Landmark, 
  Phone, 
  Mail, 
  Share2, 
  Copy, 
  Check, 
  Loader2, 
  Printer, 
  ShieldCheck, 
  CheckCircle2, 
  MessageCircle,
  Paperclip,
  ArrowRight
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
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isPhoneModalOpen, setIsPhoneModalOpen] = useState(false);
  const [customPhone, setCustomPhone] = useState(vendor.phone || '');
  const [showWhatsAppNotice, setShowWhatsAppNotice] = useState(false);

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

  // Safe filename
  const getFilename = () => {
    const sanitizedVendor = vendor.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const ref = payment.reference_no ? payment.reference_no.replace(/[^a-zA-Z0-9_-]/g, '_') : payment.id.slice(0, 6);
    return `Payment_Advice_${sanitizedVendor}_${ref}.pdf`;
  };

  // Browser Print / Save as PDF
  const handlePrint = () => {
    window.print();
  };

  // Generate Corporate Vector PDF Document
  const generatePDFDocument = () => {
    const doc = new jsPDF({
      orientation: 'p',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    const pageWidth = 210;
    const margin = 18;
    const contentWidth = pageWidth - (margin * 2);

    // Corporate Brand Colors
    const primaryColor: [number, number, number] = [15, 23, 42]; // Slate 900
    const accentColor: [number, number, number] = [16, 185, 129]; // Emerald 500
    const subtleColor: [number, number, number] = [100, 116, 139]; // Slate 500
    const lightBg: [number, number, number] = [248, 250, 252]; // Slate 50
    const borderColor: [number, number, number] = [226, 232, 240]; // Slate 200

    // 1. Top Brand Line
    doc.setFillColor(...accentColor);
    doc.rect(0, 0, pageWidth, 4, 'F');

    // 2. Company Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...primaryColor);
    doc.text(companyName.toUpperCase(), margin, 20);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...subtleColor);
    doc.text('Sultanate of Oman • Finance & Corporate Accounts', margin, 26);
    
    const regDetails = [];
    if (companyCr) regDetails.push(`Commercial Reg (CR): ${companyCr}`);
    if (companyTax) regDetails.push(`VAT / Tax ID: ${companyTax}`);
    if (regDetails.length > 0) {
      doc.text(regDetails.join('   |   '), margin, 31);
    }

    // Top Right Document Badge
    doc.setFillColor(236, 253, 245); // Emerald 50
    doc.setDrawColor(167, 243, 208); // Emerald 200
    doc.roundedRect(pageWidth - margin - 58, 12, 58, 22, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(6, 95, 70); // Emerald 800
    doc.text('PAYMENT ADVICE', pageWidth - margin - 29, 18, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...subtleColor);
    doc.text(`Ref: ${voucherNumber}`, pageWidth - margin - 29, 24, { align: 'center' });
    doc.text(`Date: ${formattedDate}`, pageWidth - margin - 29, 29, { align: 'center' });

    // Horizontal Divider
    doc.setDrawColor(...borderColor);
    doc.setLineWidth(0.5);
    doc.line(margin, 38, pageWidth - margin, 38);

    // 3. Dual Information Panels (Beneficiary vs Remittance)
    const colWidth = (contentWidth - 6) / 2;
    const cardY = 44;
    const cardHeight = 44;

    // Left Panel: Beneficiary
    doc.setFillColor(...lightBg);
    doc.setDrawColor(...borderColor);
    doc.roundedRect(margin, cardY, colWidth, cardHeight, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('BENEFICIARY / PAID TO', margin + 6, cardY + 8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...primaryColor);
    doc.text(vendor.name, margin + 6, cardY + 16, { maxWidth: colWidth - 12 });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...subtleColor);
    let leftY = cardY + 23;
    if (vendor.contact_person) {
      doc.text(`Attn: ${vendor.contact_person}`, margin + 6, leftY);
      leftY += 5;
    }
    if (vendor.phone) {
      doc.text(`Phone: ${vendor.phone}`, margin + 6, leftY);
      leftY += 5;
    }
    if (vendor.email) {
      doc.text(`Email: ${vendor.email}`, margin + 6, leftY);
    }

    // Right Panel: Remittance Details
    const rightColX = margin + colWidth + 6;
    doc.setFillColor(...lightBg);
    doc.setDrawColor(...borderColor);
    doc.roundedRect(rightColX, cardY, colWidth, cardHeight, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('REMITTANCE / CREDITED ACCOUNT', rightColX + 6, cardY + 8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...primaryColor);
    doc.text(vendor.bank_name || 'Bank Muscat / Commercial Bank', rightColX + 6, cardY + 16);

    doc.setFont('courier', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    const acc = payment.bank_account || vendor.bank_account || vendor.account_no || 'Standard Bank Transfer';
    doc.text(`Acc: ${acc}`, rightColX + 6, cardY + 24);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...subtleColor);
    if (vendor.swift_code) {
      doc.text(`SWIFT / BIC: ${vendor.swift_code}`, rightColX + 6, cardY + 31);
    }
    doc.text('Payment Channel: Electronic Funds Transfer', rightColX + 6, cardY + 37);

    // 4. Highlighted Amount Banner
    const amountBannerY = 94;
    doc.setFillColor(236, 253, 245); // Emerald 50
    doc.setDrawColor(167, 243, 208); // Emerald 200
    doc.roundedRect(margin, amountBannerY, contentWidth, 24, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(6, 95, 70);
    doc.text('TOTAL AMOUNT TRANSFERRED', margin + 8, amountBannerY + 8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(4, 120, 87); // Emerald 700
    doc.text(formatOMR(payment.amount), margin + 8, amountBannerY + 18);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(6, 95, 70);
    doc.text('STATUS: SETTLED IN FULL', pageWidth - margin - 8, amountBannerY + 14, { align: 'right' });

    // 5. Transaction Particulars Table (Clean Corporate Table - No Zoho Details, No Remarks)
    const tableY = 126;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...primaryColor);
    doc.text('TRANSACTION PARTICULARS', margin, tableY);

    let currentY = tableY + 4;
    doc.setDrawColor(...borderColor);
    doc.setLineWidth(0.3);

    const tableRows: [string, string][] = [
      ['Payment Date', formattedDate],
      ['Voucher / Reference No', payment.reference_no || voucherNumber],
      ['Applied Bill / Description', payable?.title || 'Vendor Payment Settlement'],
      ['Payment Mode', 'Direct Bank Transfer / Electronic Credit'],
    ];

    tableRows.forEach(([label, value], idx) => {
      const rowHeight = 10;
      const isEven = idx % 2 === 0;

      // Background
      doc.setFillColor(isEven ? 255 : 248, isEven ? 255 : 250, isEven ? 255 : 252);
      doc.rect(margin, currentY, contentWidth, rowHeight, 'FD');

      // Label Column
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(label, margin + 6, currentY + 6.5);

      // Value Column
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(value, margin + 65, currentY + 6.5, { maxWidth: contentWidth - 70 });

      currentY += rowHeight;
    });

    // 6. Corporate Verification (Without Authorized Signatory)
    const signoffY = Math.max(currentY + 24, 215);

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...borderColor);
    doc.roundedRect(margin, signoffY, contentWidth, 20, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    doc.text('ELECTRONIC PAYMENT VERIFICATION', margin + 6, signoffY + 7);

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('This document is electronically generated and authenticated by Accounts & Payables System.', margin + 6, signoffY + 12);
    doc.text(`Generated on ${format(new Date(), 'dd/MM/yyyy HH:mm')} • Official record of remittance`, margin + 6, signoffY + 16);

    // Bottom footer rule
    doc.setDrawColor(...borderColor);
    doc.line(margin, 280, pageWidth - margin, 280);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text('Confidential • Internal & Vendor Remittance Documentation', margin, 284);
    doc.text('Page 1 of 1', pageWidth - margin, 284, { align: 'right' });

    return doc;
  };

  // Pure Vector Corporate PDF Download
  const handleDownloadPDF = () => {
    setDownloadingPdf(true);
    try {
      const doc = generatePDFDocument();
      doc.save(getFilename());
    } catch (err) {
      console.error('Failed to generate vector PDF, using print fallback:', err);
      window.print();
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Launch WhatsApp with target phone + automatically download the PDF advice to attach
  const triggerWhatsAppWithPhoneAndPDF = async (phoneNum?: string | null) => {
    const filename = getFilename();

    // 1. Try Web Share API with files (Supported on mobile browsers and Safari/Chrome with native share sheet)
    // If supported, this passes the PDF directly into WhatsApp without manual file picking!
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        const doc = generatePDFDocument();
        const pdfBlob = doc.output('blob');
        const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });

        if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
          await navigator.share({
            title: `Payment Advice - ${vendor.name}`,
            text: `Payment Confirmation Advice for ${vendor.name} (${formatOMR(payment.amount)})`,
            files: [pdfFile]
          });
          return;
        }
      } catch (err: any) {
        // User cancelled or aborted native share sheet, or format unsupported
        if (err?.name === 'AbortError') return;
      }
    }

    // 2. On Desktop browsers: Auto-download the PDF advice immediately
    try {
      const doc = generatePDFDocument();
      doc.save(filename);
    } catch (e) {
      console.warn('PDF auto-download error:', e);
    }

    // 3. Open WhatsApp chat with full payment remittance particulars pre-filled
    openWhatsApp({
      vendorName: vendor.name,
      phoneNumber: phoneNum,
      amount: Number(payment.amount),
      paymentDate: payment.payment_date,
      referenceNo: payment.reference_no,
      bankAccount: payment.bank_account || vendor.bank_account || vendor.account_no,
      companyName: companyName,
      title: payable?.title
    });

    // 4. Show prominent banner explaining that the PDF has been downloaded to Downloads
    setShowWhatsAppNotice(true);
  };

  // Handle WhatsApp button click:
  // If vendor has phone, dispatch directly; otherwise show quick phone input dialog
  const handleWhatsAppClick = () => {
    if (vendor.phone && vendor.phone.trim()) {
      triggerWhatsAppWithPhoneAndPDF(vendor.phone);
    } else {
      setIsPhoneModalOpen(true);
    }
  };

  const handleSendCustomPhoneWhatsApp = (e: React.FormEvent) => {
    e.preventDefault();
    triggerWhatsAppWithPhoneAndPDF(customPhone);
    setIsPhoneModalOpen(false);
  };

  // Copy details
  const handleCopySummary = () => {
    const text = `PAYMENT CONFIRMATION ADVICE\n\nBeneficiary: ${vendor.name}\nAmount: ${formatOMR(payment.amount)}\nDate: ${formattedDate}\nReference No: ${payment.reference_no || voucherNumber}\nAccount: ${payment.bank_account || vendor.bank_account || vendor.account_no || 'N/A'}\nPayer: ${companyName}`;
    navigator.clipboard.writeText(text);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto">
        {/* Backdrop */}
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
              <button
                type="button"
                onClick={handleWhatsAppClick}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                title="Send Payment Advice & Download PDF to attach in WhatsApp"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span>WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 shadow-xs transition cursor-pointer"
                title="Print document or Save via system dialog"
              >
                <Printer className="h-3.5 w-3.5 text-indigo-300" />
                <span className="hidden sm:inline">Print</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadPDF}
                disabled={downloadingPdf}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-700/20 transition disabled:opacity-50 cursor-pointer"
                title="Download High-Resolution Corporate PDF Advice"
              >
                {downloadingPdf ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Generating PDF...</span>
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

          {/* WhatsApp PDF Attachment Guide Toast Notification */}
          {showWhatsAppNotice && (
            <div className="bg-emerald-50 border-b border-emerald-200 px-5 py-2.5 flex items-center justify-between text-xs text-emerald-950 animate-in slide-in-from-top-2 shrink-0">
              <div className="flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>PDF Downloaded:</strong> In the opened WhatsApp chat, click the attachment paperclip icon and select <strong>{getFilename()}</strong> from your Downloads folder.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowWhatsAppNotice(false)}
                className="text-emerald-700 hover:text-emerald-900 font-bold ml-2 p-1"
              >
                ✕
              </button>
            </div>
          )}

          {/* Scrollable Printable Confirmation Document (Corporate Styled View) */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100/70 flex justify-center">
            <div className="printable-voucher w-full max-w-xl bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6 text-slate-800">
              
              {/* Advice Header */}
              <div className="flex items-start justify-between border-b border-slate-200/80 pb-5 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-base shadow-xs">
                      {companyName.slice(0, 1)}
                    </div>
                    <div>
                      <h1 className="text-sm font-extrabold tracking-tight text-slate-900 uppercase">
                        {companyName}
                      </h1>
                      <p className="text-[10px] text-slate-500 font-medium">Sultanate of Oman • Finance & Accounts</p>
                    </div>
                  </div>
                  {(companyCr || companyTax) && (
                    <div className="text-[10px] font-mono text-slate-500 pt-1">
                      {companyCr && <span>CR No: <strong>{companyCr}</strong></span>}
                      {companyCr && companyTax && <span className="mx-2">•</span>}
                      {companyTax && <span>VAT No: <strong>{companyTax}</strong></span>}
                    </div>
                  )}
                </div>

                <div className="text-right shrink-0">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold tracking-wider uppercase">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                    Payment Confirmed
                  </span>
                  <p className="text-[11px] font-mono font-semibold text-slate-700 mt-1.5">{voucherNumber}</p>
                  <p className="text-[10px] text-slate-400">{formattedDate}</p>
                </div>
              </div>

              {/* Beneficiary & Remittance Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                {/* Beneficiary */}
                <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/80 space-y-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">
                    Beneficiary / Paid To
                  </span>
                  <p className="text-sm font-bold text-slate-900 leading-snug">{vendor.name}</p>
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

                {/* Remittance / Account Credited */}
                <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/80 space-y-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">
                    Remittance / Account Credited
                  </span>
                  <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Landmark className="h-3.5 w-3.5 text-slate-500" />
                    {vendor.bank_name || 'Bank Muscat / Commercial Bank'}
                  </p>
                  <p className="font-mono text-xs text-slate-800 bg-white px-2 py-1 rounded border border-slate-200 inline-block font-semibold">
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
              <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-teal-500/10 border border-emerald-200/80 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
                    Total Amount Transferred
                  </span>
                  <p className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-700 mt-0.5">
                    {formatOMR(payment.amount)}
                  </p>
                  <span className="text-[10px] font-semibold text-emerald-600 block mt-0.5">
                    Omani Rials • Settled in Full
                  </span>
                </div>
                <div className="p-2.5 rounded-full bg-emerald-100 text-emerald-700 shadow-2xs">
                  <ShieldCheck className="h-6 w-6" />
                </div>
              </div>

              {/* Transaction Particulars Table (Clean Corporate Table - No Zoho Details, No Remarks) */}
              <div className="space-y-2">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Transaction Particulars
                </h3>
                <div className="overflow-hidden rounded-xl border border-slate-200 text-xs">
                  <table className="w-full text-left">
                    <tbody className="divide-y divide-slate-100">
                      <tr className="bg-slate-50/50">
                        <td className="py-2.5 px-3 text-slate-500 font-semibold w-1/3">Payment Date</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">{formattedDate}</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3 text-slate-500 font-semibold">Voucher / Reference No</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                          {payment.reference_no || voucherNumber}
                        </td>
                      </tr>
                      {payable && (
                        <tr className="bg-slate-50/50">
                          <td className="py-2.5 px-3 text-slate-500 font-semibold">Applied Bill / Description</td>
                          <td className="py-2.5 px-3 text-slate-800 font-medium">
                            {payable.title}
                          </td>
                        </tr>
                      )}
                      <tr>
                        <td className="py-2.5 px-3 text-slate-500 font-semibold">Payment Mode</td>
                        <td className="py-2.5 px-3 text-slate-800">
                          Direct Bank Transfer / Electronic Credit
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Electronic Verification Strip (Without Authorized Signatory) */}
              <div className="pt-5 border-t border-slate-200 flex items-center justify-between text-xs text-slate-400">
                <div className="space-y-0.5">
                  <p className="text-[10px] text-slate-500 font-medium">
                    This document serves as an official electronic confirmation of payment.
                  </p>
                  <p className="text-[9px] font-mono text-slate-400">
                    Verified & Dispatched by Accounts & Payables System • {format(new Date(), 'dd/MM/yyyy HH:mm')}
                  </p>
                </div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Status: Dispatched
                </span>
              </div>

            </div>
          </div>

          {/* Modal Bottom Footer */}
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0 print-hide">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleCopySummary}
                className="inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900 transition font-medium cursor-pointer"
              >
                {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedLink ? 'Copied to Clipboard' : 'Copy Text'}</span>
              </button>

              <button
                type="button"
                onClick={handleWhatsAppClick}
                className="inline-flex items-center gap-1.5 text-emerald-700 hover:text-emerald-800 font-semibold cursor-pointer"
              >
                <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
                <span>Share WhatsApp & Attach PDF</span>
              </button>
            </div>

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

      {/* WhatsApp Custom Phone Modal (Fallback when vendor has no phone on profile) */}
      {isPhoneModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div 
            className="w-full max-w-sm bg-white rounded-xl shadow-2xl border border-slate-200 p-5 space-y-4 animate-in fade-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                  <Share2 className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900">Send Payment Advice via WhatsApp</h3>
                  <p className="text-[10px] text-slate-500">{vendor.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPhoneModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSendCustomPhoneWhatsApp} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Recipient WhatsApp Number
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  placeholder="e.g. 96891234567 or 91234567"
                  value={customPhone}
                  onChange={(e) => setCustomPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-900 font-mono focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Oman numbers (+968) are automatically recognized.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsPhoneModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  <Share2 className="h-3 w-3" />
                  <span>Send & Attach PDF</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
