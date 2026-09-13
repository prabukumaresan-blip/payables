'use client';

import React, { useEffect, useState, useRef } from 'react';
import { format, parseISO } from 'date-fns';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import AppLayout from '@/components/layout/AppLayout';
import { getReports, getCategories, getVendors, getAllPayables } from '@/lib/supabase/queries';
import { Payable, Category, Vendor } from '@/lib/supabase/mockDb';
import { formatOMR } from '@/lib/utils/formatCurrency';
import { getMonthsList } from '@/lib/utils/dates';
import { useCompany } from '@/context/CompanyContext';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { 
  Download, 
  Building2, 
  Calendar,
  Layers,
  CheckCircle,
  Clock,
  ArrowRight,
  FileText,
  AlertTriangle,
  RefreshCw,
  Zap,
  Search,
  Filter,
  CreditCard,
  CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Suspense } from 'react';

function ReportsContent() {
  const months = getMonthsList(24);
  const [startMonth, setStartMonth] = useState(months[5]?.value || format(new Date(), 'yyyy-MM'));
  const [endMonth, setEndMonth] = useState(months[0]?.value || format(new Date(), 'yyyy-MM'));
  const { companies, selectedCompanyId, selectedCompany } = useCompany();

  const [categories, setCategories] = useState<Category[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [allPayables, setAllPayables] = useState<Payable[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [syncingZoho, setSyncingZoho] = useState(false);
  const [zohoSyncMessage, setZohoSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'detailed' | 'consolidated' | 'vendor_ledger'>('consolidated');
  const [vendorSearchQuery, setVendorSearchQuery] = useState('');
  const [vendorBalanceFilter, setVendorBalanceFilter] = useState<'all' | 'with_balance' | 'with_credit' | 'settled'>('all');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');
  const [reportCompanyFilter, setReportCompanyFilter] = useState(selectedCompanyId || 'all');

  useEffect(() => {
    setReportCompanyFilter(selectedCompanyId || 'all');
  }, [selectedCompanyId]);

  const reportRef = useRef<HTMLDivElement>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const start = startMonth < endMonth ? startMonth : endMonth;
      const end = startMonth < endMonth ? endMonth : startMonth;
      const cFilter = reportCompanyFilter !== 'all' ? reportCompanyFilter : undefined;
      
      const [cats, vList, allPList, periodList] = await Promise.all([
        getCategories(),
        getVendors(),
        getAllPayables({ companyId: cFilter }),
        getReports(start, end, { companyId: cFilter })
      ]);
      
      setCategories(cats);
      setVendors(vList);
      setAllPayables(allPList);
      setPayables(periodList);
    } catch (e) {
      console.error('Error loading reports:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [startMonth, endMonth, reportCompanyFilter]);

  const handleZohoSync = async () => {
    setSyncingZoho(true);
    setZohoSyncMessage(null);
    try {
      const res = await fetch('/api/zoho/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setZohoSyncMessage({
          type: 'success',
          text: `Synced ${data.data.updatedVendorsCount} vendors and ${data.data.syncedBillsCount} bills from Zoho Books.`
        });
        await loadData();
      } else {
        setZohoSyncMessage({
          type: 'error',
          text: `Zoho Sync failed: ${data.error}`
        });
      }
    } catch (err: any) {
      setZohoSyncMessage({
        type: 'error',
        text: `Zoho Sync error: ${err.message}`
      });
    } finally {
      setSyncingZoho(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [startMonth, endMonth]);

  // Filter payables based on Category & All vs Unpaid
  const filteredPayables = React.useMemo(() => {
    return payables.filter((p) => {
      if (selectedCategoryFilter !== 'all' && p.category_id !== selectedCategoryFilter) {
        return false;
      }
      if (unpaidOnly) {
        return p.status === 'pending' || p.status === 'overdue' || p.status === 'partial';
      }
      return true;
    });
  }, [payables, unpaidOnly, selectedCategoryFilter]);

  // Aggregate stats by Category based on filtered expenses
  const categorySummaries = React.useMemo(() => {
    return categories.map((cat) => {
      const catPayables = filteredPayables.filter((p) => p.category_id === cat.id);
      const totalCount = catPayables.length;
      const totalAmount = catPayables.reduce((sum, p) => sum + Number(p.amount), 0);
      const paidAmount = catPayables.reduce((sum, p) => {
        if (p.status === 'paid') return sum + Number(p.amount);
        if (p.status === 'partial') return sum + Number(p.paid_amount || 0);
        return sum;
      }, 0);
      const pendingAmount = catPayables.reduce((sum, p) => {
        if (p.status === 'paid' || p.status === 'cancelled') return sum;
        return sum + (Number(p.amount) - Number(p.paid_amount || 0));
      }, 0);
      const completionRate = totalAmount > 0 ? (paidAmount / totalAmount) * 100 : 0;

      return {
        id: cat.id,
        name: cat.name,
        color: cat.color,
        totalCount,
        totalAmount,
        paidAmount,
        pendingAmount,
        completionRate
      };
    }).filter(c => c.totalCount > 0);
  }, [categories, filteredPayables]);

  const grandTotal = React.useMemo(() => {
    const totalCount = filteredPayables.length;
    const totalAmount = filteredPayables.reduce((sum, p) => sum + Number(p.amount), 0);
    const paidAmount = filteredPayables.reduce((sum, p) => {
      if (p.status === 'paid') return sum + Number(p.amount);
      if (p.status === 'partial') return sum + Number(p.paid_amount || 0);
      return sum;
    }, 0);
    const pendingAmount = filteredPayables.reduce((sum, p) => {
      if (p.status === 'paid' || p.status === 'cancelled') return sum;
      return sum + (Number(p.amount) - Number(p.paid_amount || 0));
    }, 0);
    const completionRate = totalAmount > 0 ? (paidAmount / totalAmount) * 100 : 0;

    return {
      totalCount,
      totalAmount,
      paidAmount,
      pendingAmount,
      completionRate
    };
  }, [filteredPayables]);
  // Comprehensive Vendor Balances & Zoho Reconciliation Map
  const vendorLedgerData = React.useMemo(() => {
    const map = new Map<string, {
      name: string;
      vendorObj?: Vendor;
      periodCount: number;
      periodTotal: number;
      periodPaid: number;
      periodPending: number;
      allTimeCount: number;
      allTimeTotal: number;
      allTimePaid: number;
      allTimePending: number;
      zohoCredit: number;
      zohoOutstanding: number;
      netPayable: number;
    }>();

    // 1. Process all database payables (all-time)
    allPayables.forEach(p => {
      const vName = (p.vendor_name || '').trim();
      if (!vName) return;
      const key = vName.toLowerCase();
      const existing = map.get(key) || {
        name: vName,
        periodCount: 0,
        periodTotal: 0,
        periodPaid: 0,
        periodPending: 0,
        allTimeCount: 0,
        allTimeTotal: 0,
        allTimePaid: 0,
        allTimePending: 0,
        zohoCredit: 0,
        zohoOutstanding: 0,
        netPayable: 0
      };

      const amt = Number(p.amount) || 0;
      const paidAmt = p.status === 'paid' ? amt : (Number(p.paid_amount) || 0);
      const pendingAmt = (p.status === 'paid' || p.status === 'cancelled') ? 0 : Math.max(0, amt - (Number(p.paid_amount) || 0));

      existing.allTimeCount += 1;
      existing.allTimeTotal += amt;
      existing.allTimePaid += paidAmt;
      existing.allTimePending += pendingAmt;

      map.set(key, existing);
    });

    // 2. Process filtered period payables
    filteredPayables.forEach(p => {
      const vName = (p.vendor_name || '').trim();
      if (!vName) return;
      const key = vName.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        const amt = Number(p.amount) || 0;
        const paidAmt = p.status === 'paid' ? amt : (Number(p.paid_amount) || 0);
        const pendingAmt = (p.status === 'paid' || p.status === 'cancelled') ? 0 : Math.max(0, amt - (Number(p.paid_amount) || 0));

        existing.periodCount += 1;
        existing.periodTotal += amt;
        existing.periodPaid += paidAmt;
        existing.periodPending += pendingAmt;
      }
    });

    // 3. Process all known vendors in vendors directory
    vendors.forEach(v => {
      const key = (v.name || '').trim().toLowerCase();
      if (!key) return;
      const existing = map.get(key) || {
        name: v.name,
        periodCount: 0,
        periodTotal: 0,
        periodPaid: 0,
        periodPending: 0,
        allTimeCount: 0,
        allTimeTotal: 0,
        allTimePaid: 0,
        allTimePending: 0,
        zohoCredit: 0,
        zohoOutstanding: 0,
        netPayable: 0
      };

      existing.vendorObj = v;
      existing.zohoCredit = Number(v.unused_credits_payable_amount || 0);
      existing.zohoOutstanding = Number(v.outstanding_payable_amount || 0);
      const finalOutstanding = existing.allTimePending > 0 ? existing.allTimePending : existing.zohoOutstanding;
      existing.allTimePending = finalOutstanding;
      existing.netPayable = Math.max(0, finalOutstanding - existing.zohoCredit);

      map.set(key, existing);
    });

    return Array.from(map.values()).sort((a, b) => {
      if (b.allTimePending !== a.allTimePending) return b.allTimePending - a.allTimePending;
      if (b.zohoCredit !== a.zohoCredit) return b.zohoCredit - a.zohoCredit;
      return b.allTimeTotal - a.allTimeTotal;
    });
  }, [allPayables, filteredPayables, vendors]);

  const filteredVendorLedgerData = React.useMemo(() => {
    return vendorLedgerData.filter(v => {
      if (vendorSearchQuery) {
        const q = vendorSearchQuery.toLowerCase();
        const matchName = v.name.toLowerCase().includes(q);
        const matchContact = v.vendorObj?.contact_person?.toLowerCase().includes(q);
        const matchPhone = v.vendorObj?.phone?.includes(q);
        if (!matchName && !matchContact && !matchPhone) return false;
      }
      if (vendorBalanceFilter === 'with_balance') {
        return v.allTimePending > 0;
      }
      if (vendorBalanceFilter === 'with_credit') {
        return v.zohoCredit > 0;
      }
      if (vendorBalanceFilter === 'settled') {
        return v.allTimePending <= 0;
      }
      return true;
    });
  }, [vendorLedgerData, vendorSearchQuery, vendorBalanceFilter]);
  const colorMap: Record<string, string> = {
    blue: '#3B82F6',
    violet: '#8B5CF6',
    amber: '#F59E0B',
    orange: '#F97316',
    green: '#10B981',
    rose: '#F43F5E',
    slate: '#64748B'
  };

  const chartData = categorySummaries.map(item => ({
    name: item.name,
    value: item.totalAmount,
    color: colorMap[item.color] || '#6366F1'
  }));

  // Excel XLSX export handler using SheetJS
  const handleExportExcel = () => {
    // Helper to format number
    const fNum = (num: number) => Number(num.toFixed(3));

    // Sheet 1: Executive Summary
    const summaryData: any[][] = [];
    summaryData.push(['Bright Flowers Trading LLC']);
    summaryData.push(['Payables Summary Report']);
    summaryData.push([`Period: ${startMonth} to ${endMonth}`]);
    summaryData.push([]);
    summaryData.push([
      'Category',
      'Transactions',
      'Total Amount (OMR)',
      'Paid Amount (OMR)',
      'Pending Amount (OMR)',
      'Completion Rate (%)'
    ]);

    categorySummaries.forEach(c => {
      summaryData.push([
        c.name,
        c.totalCount,
        fNum(c.totalAmount),
        fNum(c.paidAmount),
        fNum(c.pendingAmount),
        Number(c.completionRate.toFixed(1))
      ]);
    });

    summaryData.push([
      'GRAND TOTAL',
      grandTotal.totalCount,
      fNum(grandTotal.totalAmount),
      fNum(grandTotal.paidAmount),
      fNum(grandTotal.pendingAmount),
      Number(grandTotal.completionRate.toFixed(1))
    ]);

    // Sheet 2: Detailed Ledger
    const ledgerData: any[][] = [];
    ledgerData.push(['Detailed Transaction Ledger']);
    ledgerData.push([`Period: ${startMonth} to ${endMonth}`]);
    ledgerData.push([]);

    categories.forEach((cat) => {
      const catPayables = filteredPayables
        .filter((p) => p.category_id === cat.id)
        .sort((a, b) => a.due_date.localeCompare(b.due_date));

      if (catPayables.length === 0) return;

      const catTotal = catPayables.reduce((sum, p) => sum + Number(p.amount), 0);
      const catPaid = catPayables.reduce((sum, p) => {
        if (p.status === 'paid') return sum + Number(p.amount);
        if (p.status === 'partial') return sum + Number(p.paid_amount || 0);
        return sum;
      }, 0);
      const catPending = catPayables.reduce((sum, p) => {
        if (p.status === 'paid' || p.status === 'cancelled') return sum;
        return sum + (Number(p.amount) - Number(p.paid_amount || 0));
      }, 0);

      ledgerData.push([`${cat.name.toUpperCase()} (${catPayables.length} records)`]);
      ledgerData.push([
        'Due Date',
        'Vendor & Details',
        'Ref No.',
        'Status',
        'Total Amount (OMR)',
        'Paid (OMR)',
        'Outstanding (OMR)',
        'Notes'
      ]);

      catPayables.forEach(p => {
        let titleText = p.title;
        if (p.pdc && p.pdc.cheque_no) {
          titleText += ` (Cheque #${p.pdc.cheque_no} • ${p.pdc.bank_name || '—'} - Status: ${p.pdc.status})`;
        }

        let formattedDate = p.due_date;
        try {
          formattedDate = format(parseISO(p.due_date), 'dd MMM yyyy');
        } catch (err) {}

        const detailsText = `${p.vendor_name || '—'}\n${titleText}`;

        const paid = p.status === 'paid' ? Number(p.amount) : (p.status === 'partial' ? Number(p.paid_amount || 0) : 0);
        const outstanding = p.status === 'paid' || p.status === 'cancelled' ? 0 : (p.status === 'partial' ? Number(p.amount) - Number(p.paid_amount || 0) : Number(p.amount));

        ledgerData.push([
          formattedDate,
          detailsText,
          p.reference_no || '—',
          p.status,
          fNum(p.amount),
          fNum(paid),
          fNum(outstanding),
          p.notes || ''
        ]);
      });

      ledgerData.push([
        `Subtotal (${cat.name})`,
        '',
        '',
        `Paid: ${catPayables.filter(p => p.status === 'paid' || p.status === 'partial').length} | Due: ${catPayables.filter(p => p.status === 'pending' || p.status === 'overdue' || p.status === 'partial').length}`,
        fNum(catTotal),
        fNum(catPaid),
        fNum(catPending),
        ''
      ]);
      ledgerData.push([]);
    });

    // Sheet 3: Vendor Balances
    const vendorData: any[][] = [];
    vendorData.push(['Vendor Balances & Zoho Reconciliation Statement']);
    vendorData.push([`Generated: ${new Date().toLocaleDateString()}`]);
    vendorData.push([]);
    vendorData.push([
      '#',
      'Vendor / Entity Name',
      'Contact / Tel',
      'Bank Account',
      'All-Time Invoiced',
      'Settled / Paid',
      'Outstanding Balance',
      'Zoho Advance Credit',
      'Net Payable',
      'Status'
    ]);

    vendorLedgerData.forEach((v, idx) => {
      const statusText = v.allTimePending <= 0 
        ? (v.zohoCredit > 0 ? `Credit: ${v.zohoCredit.toFixed(3)}` : 'Fully Settled')
        : (v.allTimePaid > 0 ? 'Partially Paid' : 'Outstanding');

      const contactText = [v.vendorObj?.contact_person, v.vendorObj?.phone].filter(Boolean).join(' / ');
      const bankText = v.vendorObj?.bank_name && v.vendorObj?.account_no ? `${v.vendorObj.bank_name} - ${v.vendorObj.account_no}` : (v.vendorObj?.bank_account || '');

      vendorData.push([
        idx + 1,
        v.name,
        contactText,
        bankText,
        fNum(v.allTimeTotal),
        fNum(v.allTimePaid),
        fNum(v.allTimePending),
        fNum(v.zohoCredit),
        fNum(v.netPayable),
        statusText
      ]);
    });

    const totInv = vendorLedgerData.reduce((s, v) => s + v.allTimeTotal, 0);
    const totPaid = vendorLedgerData.reduce((s, v) => s + v.allTimePaid, 0);
    const totPending = vendorLedgerData.reduce((s, v) => s + v.allTimePending, 0);
    const totCredit = vendorLedgerData.reduce((s, v) => s + v.zohoCredit, 0);
    const totNet = vendorLedgerData.reduce((s, v) => s + v.netPayable, 0);

    vendorData.push([
      `TOTAL (${vendorLedgerData.length} Vendors)`,
      '',
      '',
      '',
      fNum(totInv),
      fNum(totPaid),
      fNum(totPending),
      fNum(totCredit),
      fNum(totNet),
      ''
    ]);

    // Create Workbook
    const wb = XLSX.utils.book_new();

    const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
    const ws2 = XLSX.utils.aoa_to_sheet(ledgerData);
    const ws3 = XLSX.utils.aoa_to_sheet(vendorData);

    // Add some basic column widths
    ws1['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }];
    ws2['!cols'] = [{ wch: 15 }, { wch: 40 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 30 }];
    ws3['!cols'] = [{ wch: 5 }, { wch: 30 }, { wch: 20 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 15 }];

    XLSX.utils.book_append_sheet(wb, ws1, 'Executive Summary');
    XLSX.utils.book_append_sheet(wb, ws2, 'Detailed Ledger');
    XLSX.utils.book_append_sheet(wb, ws3, 'Vendor Balances');

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Payables_Detailed_Report_${startMonth}_to_${endMonth}.xlsx`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // PDF Download using jsPDF + html2canvas with Smart Page Breaks
  const handleDownloadPDF = async () => {
    const element = reportRef.current;
    if (!element) return;

    setGeneratingPDF(true);
    try {
      // Find all sections marked for smart pagination
      const sections = element.querySelectorAll('[data-pdf-section]');
      
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
        compress: true
      });
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 12;
      const maxContentHeight = pageHeight - (margin * 2); // 273mm available height
      const imgWidth = pageWidth - (margin * 2); // 186mm available width
      
      let yPosition = margin;
      let isFirstPage = true;

      for (let i = 0; i < sections.length; i++) {
        const sectionEl = sections[i] as HTMLElement;
        
        const canvas = await html2canvas(sectionEl, {
          scale: 1.5, // Optimized rendering scale
          useCORS: true,
          backgroundColor: '#FFFFFF',
          logging: false
        });

        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        // 1. If it's a huge section that is taller than the maximum page height, crop and slice it
        if (imgHeight > maxContentHeight) {
          // If we have already written content on the current page, start a fresh page
          if (yPosition > margin) {
            pdf.addPage();
            yPosition = margin;
          }

          const maxContentHeightPx = (maxContentHeight * canvas.width) / imgWidth;
          let pixelsLeft = canvas.height;
          let srcY = 0;

          while (pixelsLeft > 0) {
            const chunkHeightPx = Math.min(pixelsLeft, maxContentHeightPx);
            const roundedChunkHeightPx = Math.round(chunkHeightPx);
            
            // Create a temporary crop canvas to extract the page segment
            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = canvas.width;
            cropCanvas.height = roundedChunkHeightPx;
            
            const ctx = cropCanvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(
                canvas,
                0, srcY, // sx, sy
                canvas.width, roundedChunkHeightPx, // sWidth, sHeight
                0, 0, // dx, dy
                cropCanvas.width, cropCanvas.height // dWidth, dHeight
              );
            }
            
            const chunkImgData = cropCanvas.toDataURL('image/jpeg', 0.6);
            
            if (!isFirstPage && srcY === 0) {
              // Add a page if we weren't already on a fresh page
              pdf.addPage();
              yPosition = margin;
            }

            const destHeight = (roundedChunkHeightPx * imgWidth) / canvas.width;
            pdf.addImage(chunkImgData, 'JPEG', margin, yPosition, imgWidth, destHeight, undefined, 'FAST');
            isFirstPage = false;
            
            pixelsLeft -= roundedChunkHeightPx;
            srcY += roundedChunkHeightPx;
            
            if (pixelsLeft > 0) {
              pdf.addPage();
              yPosition = margin;
            } else {
              yPosition += destHeight + 6;
            }
          }
        } 
        // 2. Normal section that fits on a page
        else {
          // Check if this fits in the remaining space of the current page
          if (yPosition + imgHeight > maxContentHeight + margin) {
            pdf.addPage();
            yPosition = margin;
            isFirstPage = false;
          }

          const imgData = canvas.toDataURL('image/jpeg', 0.6);
          
          // If this is the very first item on the first default page, we don't need addPage
          if (isFirstPage && i === 0) {
            pdf.addImage(imgData, 'JPEG', margin, yPosition, imgWidth, imgHeight, undefined, 'FAST');
            isFirstPage = false;
          } else {
            pdf.addImage(imgData, 'JPEG', margin, yPosition, imgWidth, imgHeight, undefined, 'FAST');
          }
          
          yPosition += imgHeight + 6; // Add 6mm spacing before next section
        }
      }

      pdf.save(`Payables_Report_${startMonth}_to_${endMonth}.pdf`);
    } catch (e) {
      console.error('Error generating PDF:', e);
    } finally {
      setGeneratingPDF(false);
    }
  };

  return (
    <AppLayout title="Monthly Analysis & Reports" showMonthSelector={false}>
      <div className="space-y-6 text-slate-800">
        {/* Settings Filter Bar */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-white border border-slate-200 rounded-xl p-4 shadow-sm print:hidden">
          <div className="flex flex-wrap items-center gap-3">
            {/* Range Pickers */}
            <div className="flex items-center gap-2 text-xs">
              <Calendar className="h-4 w-4 text-indigo-600" />
              <select
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-800 outline-none cursor-pointer focus:border-indigo-500 font-semibold"
              >
                {months.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={endMonth}
                onChange={(e) => setEndMonth(e.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-800 outline-none cursor-pointer focus:border-indigo-500 font-semibold"
              >
                {months.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold">
              <span className="text-slate-500">Category:</span>
              <select
                value={selectedCategoryFilter}
                onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                className="bg-transparent text-slate-800 outline-none cursor-pointer font-semibold max-w-[150px] truncate"
              >
                <option value="all">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* All vs Unpaid Filter */}
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold">
              <span className="text-slate-500">Show:</span>
              <select
                value={unpaidOnly ? 'unpaid' : 'all'}
                onChange={(e) => setUnpaidOnly(e.target.value === 'unpaid')}
                className="bg-transparent text-slate-800 outline-none cursor-pointer font-semibold"
              >
                <option value="all">All Expenses</option>
                <option value="unpaid">Only Unpaid Expenses</option>
              </select>
            </div>

            {/* View Mode */}
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold">
              <span className="text-slate-500">View:</span>
              <select
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value as any)}
                className="bg-transparent text-indigo-700 outline-none cursor-pointer font-bold"
              >
                <option value="vendor_ledger">Vendor Balances Statement &amp; Zoho Reconciliation (All-Time)</option>
                <option value="consolidated">Categorized Vendor Summary (Period)</option>
                <option value="detailed">Detailed Itemized Breakdown (By Category)</option>
              </select>
            </div>
          </div>

          {/* Export & Sync Actions */}
          <div className="flex items-center flex-wrap gap-2">
            <button
              onClick={handleZohoSync}
              disabled={syncingZoho}
              className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100/70 disabled:opacity-50 cursor-pointer transition-colors shadow-sm"
              title="Sync vendor balances and bills with Zoho Books"
            >
              <RefreshCw className={cn("h-3.5 w-3.5 text-blue-600", syncingZoho && "animate-spin")} />
              <span>{syncingZoho ? 'Syncing...' : 'Sync Zoho'}</span>
            </button>
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              title="Export Excel"
            >
              <Download className="h-4 w-4 text-slate-500" />
              <span className="hidden sm:inline">Export Excel</span>
            </button>
            <button
              disabled={generatingPDF}
              onClick={handleDownloadPDF}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 cursor-pointer"
              title="Download PDF Report"
            >
              {generatingPDF ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Download PDF Report</span>
            </button>
          </div>
        </div>

        {/* Zoho Sync Message Banner */}
        {zohoSyncMessage && (
          <div className={cn(
            "p-3 rounded-xl border text-xs font-semibold flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-2 duration-300",
            zohoSyncMessage.type === 'success' 
              ? "bg-emerald-50 text-emerald-800 border-emerald-200" 
              : "bg-rose-50 text-rose-800 border-rose-200"
          )}>
            <div className="flex items-center gap-2">
              {zohoSyncMessage.type === 'success' ? (
                <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
              )}
              <span>{zohoSyncMessage.text}</span>
            </div>
            <button 
              onClick={() => setZohoSyncMessage(null)}
              className="text-slate-400 hover:text-slate-700 ml-4 font-bold text-sm cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Detailed Document Container (LIGHT THEME) */}
        <div 
          ref={reportRef} 
          id="report-document" 
          className={cn(
            "p-8 rounded-2xl border border-slate-200 bg-white space-y-8 shadow-sm relative overflow-hidden text-slate-850",
            generatingPDF && "pdf-render-mode"
          )}
        >
          {/* Section 1: Document Header & KPI Grid */}
          <div data-pdf-section className="space-y-8 border-b border-slate-100 pb-6">
            {/* Document Header */}
            <div className="flex flex-col md:flex-row justify-between items-start gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 shadow-md shadow-indigo-500/20">
                  <Building2 className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                    {selectedCompany ? selectedCompany.name : 'All Companies Consolidated'}
                  </h2>
                  <p className="text-xs text-indigo-600 font-semibold uppercase tracking-wider mt-0.5">
                    {selectedCompany?.cr_number ? `CR: ${selectedCompany.cr_number} • ` : ''}Payables Report
                  </p>
                </div>
              </div>
              <div className="text-left md:text-right text-xs text-slate-500 space-y-1">
                <p><span className="font-semibold text-slate-800">Period:</span> {startMonth} to {endMonth}</p>
                <p suppressHydrationWarning><span className="font-semibold text-slate-800">Date Generated:</span> {format(new Date(), 'dd MMM yyyy, hh:mm a')}</p>
                <p><span className="font-semibold text-slate-800">Status Filter:</span> {unpaidOnly ? 'Only Unpaid / Outstanding' : 'All Expenses'}</p>
              </div>
            </div>

            {/* Overview KPI Grid */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Total Outgoing</span>
                <h3 className="text-xl font-bold font-numeric text-slate-900 mt-1.5">{formatOMR(grandTotal.totalAmount)}</h3>
                <p className="text-[10px] text-slate-500 mt-1">{grandTotal.totalCount} transactions</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Cleared Volume</span>
                <h3 className="text-xl font-bold font-numeric text-emerald-600 mt-1.5">{formatOMR(grandTotal.paidAmount)}</h3>
                <p className="text-[10px] text-emerald-600/80 font-semibold mt-1">
                  {grandTotal.completionRate.toFixed(1)}% settlement rate
                </p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Outstanding Balance</span>
                <h3 className="text-xl font-bold font-numeric text-amber-600 mt-1.5">{formatOMR(grandTotal.pendingAmount)}</h3>
                <p className="text-[10px] text-slate-500 mt-1">Pending approval & clearance</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Overdue items</span>
                {filteredPayables.filter(p => p.status === 'overdue').length > 0 ? (
                  <h3 className="text-xl font-bold font-numeric text-rose-600 mt-1.5">
                    {filteredPayables.filter(p => p.status === 'overdue').length} items
                  </h3>
                ) : (
                  <h3 className="text-xl font-bold font-numeric text-slate-500 mt-1.5">0 items</h3>
                )}
                <p className="text-[10px] text-slate-500 mt-1">Requiring immediate clearance</p>
              </div>
            </div>
          </div>

          {/* Section 2: Charts & Summary Table */}
          <div data-pdf-section className="space-y-6 pt-2">
            {/* Visual Analysis Chart Row */}
            {chartData.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/50 border border-slate-100 rounded-xl p-6">
                {/* Category Volume Shares */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">
                    Expense Weight per Category
                  </h4>
                  <div className="relative flex items-center justify-center" style={generatingPDF ? { height: '240px' } : { height: '176px' }}>
                    {!generatingPDF ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={chartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={45}
                            outerRadius={65}
                            paddingAngle={3}
                            dataKey="value"
                            isAnimationActive={true}
                          >
                            {chartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} stroke="#FFFFFF" strokeWidth={2} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <PieChart width={240} height={240}>
                        <Pie
                          data={chartData}
                          cx={120}
                          cy={120}
                          innerRadius={55}
                          outerRadius={85}
                          paddingAngle={3}
                          dataKey="value"
                          isAnimationActive={false}
                        >
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} stroke="#FFFFFF" strokeWidth={2} />
                          ))}
                        </Pie>
                      </PieChart>
                    )}
                  </div>
                </div>

                {/* Legend with values */}
                <div className="flex flex-col justify-center space-y-2.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Category Totals</h4>
                  {categorySummaries.map((c) => (
                    <div key={c.id} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full shrink-0", 
                          c.color === 'blue' ? 'bg-blue-500' :
                          c.color === 'violet' ? 'bg-violet-500' :
                          c.color === 'amber' ? 'bg-amber-500' :
                          c.color === 'orange' ? 'bg-orange-500' :
                          c.color === 'green' ? 'bg-emerald-500' :
                          c.color === 'rose' ? 'bg-rose-500' :
                          c.color === 'cyan' ? 'bg-cyan-500' : 'bg-slate-500'
                        )} />
                        <span className="text-slate-600">{c.name}</span>
                      </div>
                      <span className="font-bold text-slate-800 font-numeric">{formatOMR(c.totalAmount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section: Category Aggregates Table */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Category Summary Table
              </h4>
              <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-bold uppercase tracking-wider">
                      <th className="py-2.5 px-4">Category</th>
                      <th className="py-2.5 px-4 text-center">Volume</th>
                      <th className="py-2.5 px-4 text-right">Paid (OMR)</th>
                      <th className="py-2.5 px-4 text-right">Pending (OMR)</th>
                      <th className="py-2.5 px-4 text-right">Total (OMR)</th>
                      <th className="py-2.5 px-4 text-right">Rate (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {categorySummaries.map((summary) => (
                      <tr key={summary.id} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-4 font-semibold text-slate-800">{summary.name}</td>
                        <td className="py-2.5 px-4 text-center text-slate-600 font-numeric">{summary.totalCount}</td>
                        <td className="py-2.5 px-4 text-right text-emerald-600 font-numeric">{formatOMR(summary.paidAmount)}</td>
                        <td className="py-2.5 px-4 text-right text-amber-600 font-numeric">{formatOMR(summary.pendingAmount)}</td>
                        <td className="py-2.5 px-4 text-right font-bold text-slate-800 font-numeric">{formatOMR(summary.totalAmount)}</td>
                        <td className="py-2.5 px-4 text-right text-slate-600 font-numeric">{summary.completionRate.toFixed(1)}%</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-bold text-slate-900 border-t border-slate-200">
                      <td className="py-3 px-4">GRAND TOTAL</td>
                      <td className="py-3 px-4 text-center font-numeric">{grandTotal.totalCount}</td>
                      <td className="py-3 px-4 text-right text-emerald-600 font-numeric">{formatOMR(grandTotal.paidAmount)}</td>
                      <td className="py-3 px-4 text-right text-amber-600 font-numeric">{formatOMR(grandTotal.pendingAmount)}</td>
                      <td className="py-3 px-4 text-right font-numeric">{formatOMR(grandTotal.totalAmount)}</td>
                      <td className="py-3 px-4 text-right font-numeric">{grandTotal.completionRate.toFixed(1)}%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Section 3: Vendor Ledger / Consolidated Vendor Balances / Detailed Itemized Ledger */}
          <div className="space-y-6">
            {viewMode === 'vendor_ledger' ? (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-3">
                  <div>
                    <h4 className="text-sm font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-indigo-600" />
                      All-Time Vendor Balances &amp; Zoho Reconciliation Ledger
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Cumulative balances, settled payments, and live Zoho advance credits across all accounts.
                    </p>
                  </div>

                  {/* Search Bar */}
                  <div className="relative min-w-[240px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search vendor, contact, phone..."
                      value={vendorSearchQuery}
                      onChange={(e) => setVendorSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500 focus:bg-white transition-colors"
                    />
                    {vendorSearchQuery && (
                      <button 
                        onClick={() => setVendorSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <button
                    onClick={() => setVendorBalanceFilter('all')}
                    className={cn(
                      "px-3 py-1 rounded-full font-semibold border transition-colors cursor-pointer",
                      vendorBalanceFilter === 'all'
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    )}
                  >
                    All Vendors ({vendorLedgerData.length})
                  </button>
                  <button
                    onClick={() => setVendorBalanceFilter('with_balance')}
                    className={cn(
                      "px-3 py-1 rounded-full font-semibold border transition-colors cursor-pointer",
                      vendorBalanceFilter === 'with_balance'
                        ? "bg-rose-600 text-white border-rose-600"
                        : "bg-white text-rose-700 border-rose-200 hover:bg-rose-50"
                    )}
                  >
                    With Outstanding Balance ({vendorLedgerData.filter(v => v.allTimePending > 0).length})
                  </button>
                  <button
                    onClick={() => setVendorBalanceFilter('with_credit')}
                    className={cn(
                      "px-3 py-1 rounded-full font-semibold border transition-colors cursor-pointer",
                      vendorBalanceFilter === 'with_credit'
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                    )}
                  >
                    With Advance Credit ({vendorLedgerData.filter(v => v.zohoCredit > 0).length})
                  </button>
                  <button
                    onClick={() => setVendorBalanceFilter('settled')}
                    className={cn(
                      "px-3 py-1 rounded-full font-semibold border transition-colors cursor-pointer",
                      vendorBalanceFilter === 'settled'
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                    )}
                  >
                    Fully Settled ({vendorLedgerData.filter(v => v.allTimePending <= 0).length})
                  </button>
                </div>

                {/* Ledger Table */}
                <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-semibold uppercase tracking-wider">
                        <th className="py-3 px-3 w-10">#</th>
                        <th className="py-3 px-3 min-w-[200px]">Vendor / Entity Name</th>
                        <th className="py-3 px-3 text-center">Period Bills</th>
                        <th className="py-3 px-3 text-right">All-Time Invoiced</th>
                        <th className="py-3 px-3 text-right">Settled / Paid</th>
                        <th className="py-3 px-3 text-right">Outstanding Balance</th>
                        <th className="py-3 px-3 text-right">Zoho Advance Credit</th>
                        <th className="py-3 px-3 text-right">Net Payable</th>
                        <th className="py-3 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {filteredVendorLedgerData.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-8 text-center text-slate-400 italic">
                            No vendors matching the selected criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredVendorLedgerData.map((v, idx) => {
                          const hasCredit = v.zohoCredit > 0;
                          const hasBalance = v.allTimePending > 0;

                          return (
                            <tr key={v.name} className="hover:bg-slate-50/70 transition-colors">
                              <td className="py-3 px-3 text-slate-400 font-numeric">{idx + 1}</td>
                              <td className="py-3 px-3">
                                <span className="font-bold text-slate-900 text-xs block">{v.name}</span>
                                {v.vendorObj && (
                                  <div className="text-[11px] text-slate-500 mt-0.5 space-y-0.5">
                                    {v.vendorObj.contact_person && (
                                      <span>Contact: {v.vendorObj.contact_person} </span>
                                    )}
                                    {v.vendorObj.phone && (
                                      <span>• Tel: {v.vendorObj.phone} </span>
                                    )}
                                    {v.vendorObj.bank_name && v.vendorObj.account_no && (
                                      <span className="block text-[10px] text-slate-400 font-mono">
                                        {v.vendorObj.bank_name} - {v.vendorObj.account_no}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-3 text-center font-numeric text-slate-600">
                                {v.periodCount > 0 ? (
                                  <span className="font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                                    {v.periodCount} bills
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="py-3 px-3 text-right font-numeric text-slate-800">
                                {formatOMR(v.allTimeTotal)}
                              </td>
                              <td className="py-3 px-3 text-right font-numeric text-emerald-600 font-medium">
                                {formatOMR(v.allTimePaid)}
                              </td>
                              <td className="py-3 px-3 text-right font-numeric font-bold">
                                {hasBalance ? (
                                  <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200/60 font-mono">
                                    {formatOMR(v.allTimePending)}
                                  </span>
                                ) : (
                                  <span className="text-emerald-600 font-mono">
                                    {formatOMR(0)}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-3 text-right font-numeric font-semibold">
                                {hasCredit ? (
                                  <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-mono">
                                    {formatOMR(v.zohoCredit)}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 font-mono">
                                    {formatOMR(0)}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-3 text-right font-numeric font-bold">
                                {v.netPayable > 0 ? (
                                  <span className="text-slate-900 font-mono font-bold text-xs">
                                    {formatOMR(v.netPayable)}
                                  </span>
                                ) : (
                                  <span className="text-emerald-600 font-mono">
                                    {formatOMR(0)}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-3 text-center">
                                {!hasBalance ? (
                                  hasCredit ? (
                                    <span className="inline-block rounded px-2 py-0.5 text-[9px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                                      Credit: OMR {formatOMR(v.zohoCredit)}
                                    </span>
                                  ) : (
                                    <span className="inline-block rounded px-2 py-0.5 text-[9px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      Fully Settled
                                    </span>
                                  )
                                ) : v.allTimePaid > 0 ? (
                                  <span className="inline-block rounded px-2 py-0.5 text-[9px] font-bold uppercase bg-blue-50 text-blue-700 border border-blue-200">
                                    Partially Paid
                                  </span>
                                ) : (
                                  <span className="inline-block rounded px-2 py-0.5 text-[9px] font-bold uppercase bg-rose-50 text-rose-700 border border-rose-200">
                                    Outstanding
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-900 text-white font-bold text-xs border-t border-slate-300">
                        <td colSpan={2} className="py-3 px-3 uppercase tracking-wider text-[11px] text-slate-300">
                          Total ({filteredVendorLedgerData.length} Vendors)
                        </td>
                        <td className="py-3 px-3 text-center font-numeric text-slate-300">
                          {filteredVendorLedgerData.reduce((sum, v) => sum + v.periodCount, 0)} bills
                        </td>
                        <td className="py-3 px-3 text-right font-numeric text-white">
                          {formatOMR(filteredVendorLedgerData.reduce((sum, v) => sum + v.allTimeTotal, 0))}
                        </td>
                        <td className="py-3 px-3 text-right font-numeric text-emerald-400">
                          {formatOMR(filteredVendorLedgerData.reduce((sum, v) => sum + v.allTimePaid, 0))}
                        </td>
                        <td className="py-3 px-3 text-right font-numeric text-rose-400 font-mono">
                          {formatOMR(filteredVendorLedgerData.reduce((sum, v) => sum + v.allTimePending, 0))}
                        </td>
                        <td className="py-3 px-3 text-right font-numeric text-emerald-400 font-mono">
                          {formatOMR(filteredVendorLedgerData.reduce((sum, v) => sum + v.zohoCredit, 0))}
                        </td>
                        <td className="py-3 px-3 text-right font-numeric text-amber-300 font-mono">
                          {formatOMR(filteredVendorLedgerData.reduce((sum, v) => sum + v.netPayable, 0))}
                        </td>
                        <td className="py-3 px-3 text-center text-[10px] text-slate-400">
                          OMR
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ) : viewMode === 'consolidated' ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-indigo-600" />
                    Categorized Consolidated Payables (Vendor-wise)
                  </h4>
                  <span className="text-xs text-slate-500 font-semibold">
                    Categorized Summary
                  </span>
                </div>

                {(() => {
                  const vendorPrimaryCategory = new Map<string, string>();
                  allPayables.forEach(p => {
                    const vName = (p.vendor_name || '').trim().toLowerCase();
                    if (vName && p.category_id && !vendorPrimaryCategory.has(vName)) {
                      vendorPrimaryCategory.set(vName, p.category_id);
                    }
                  });

                  const uncatCategory = { id: 'uncategorized', name: 'Other / Uncategorized', color: 'slate' } as Category;
                  const displayCategories = [...categories, uncatCategory];

                  return displayCategories.map((cat) => {
                    const catPayables = filteredPayables.filter((p) => (p.category_id || 'uncategorized') === cat.id || (cat.id === 'uncategorized' && !p.category_id));
                    
                    const zohoVendorsForCat = vendors.filter(v => {
                      const out = Number(v.outstanding_payable_amount || 0);
                      if (out <= 0) return false;
                      const vName = (v.name || '').trim().toLowerCase();
                      const vCat = vendorPrimaryCategory.get(vName) || 'uncategorized';
                      return vCat === cat.id;
                    });

                    if (catPayables.length === 0 && zohoVendorsForCat.length === 0) return null;

                    // Group vendors within this category
                    const catVendorMap = new Map<string, {
                      name: string;
                      totalCount: number;
                      totalAmount: number;
                      paidAmount: number;
                      pendingAmount: number;
                    }>();

                    catPayables.forEach(p => {
                      const vName = p.vendor_name?.trim() || 'Other / Unassigned';
                      const key = vName.toLowerCase();
                      const existing = catVendorMap.get(key) || {
                        name: vName,
                        totalCount: 0,
                        totalAmount: 0,
                        paidAmount: 0,
                        pendingAmount: 0
                      };
                      existing.totalCount += 1;
                      existing.totalAmount += Number(p.amount);
                      if (p.status === 'paid') {
                        existing.paidAmount += Number(p.amount);
                      } else if (p.status === 'partial') {
                        existing.paidAmount += Number(p.paid_amount || 0);
                        existing.pendingAmount += (Number(p.amount) - Number(p.paid_amount || 0));
                      } else if (p.status !== 'cancelled') {
                        existing.pendingAmount += Number(p.amount);
                      }
                      catVendorMap.set(key, existing);
                    });

                    zohoVendorsForCat.forEach(v => {
                      const vName = v.name?.trim() || 'Unknown Vendor';
                      const key = vName.toLowerCase();
                      const existing = catVendorMap.get(key) || {
                        name: vName,
                        totalCount: 0,
                        totalAmount: 0,
                        paidAmount: 0,
                        pendingAmount: 0
                      };
                      const zohoOut = Number(v.outstanding_payable_amount || 0);
                      if (existing.pendingAmount === 0 && zohoOut > 0) {
                        existing.pendingAmount = zohoOut;
                      } else if (existing.pendingAmount > 0 && zohoOut > existing.pendingAmount) {
                        existing.pendingAmount = zohoOut;
                      }
                      catVendorMap.set(key, existing);
                    });

                    const catVendors = Array.from(catVendorMap.values()).sort((a, b) => b.pendingAmount - a.pendingAmount);
                    const catTotal = catVendors.reduce((sum, v) => sum + v.totalAmount, 0);
                    const catPaid = catVendors.reduce((sum, v) => sum + v.paidAmount, 0);
                    const catPending = catVendors.reduce((sum, v) => sum + v.pendingAmount, 0);

                  return (
                    <div key={cat.id} data-pdf-section className="space-y-3 bg-slate-50/50 p-4 rounded-xl border border-slate-200">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <h5 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                          <span className={cn("h-2.5 w-2.5 rounded-full",
                            cat.color === 'blue' ? 'bg-blue-500' :
                            cat.color === 'violet' ? 'bg-violet-500' :
                            cat.color === 'amber' ? 'bg-amber-500' :
                            cat.color === 'orange' ? 'bg-orange-500' :
                            cat.color === 'green' ? 'bg-emerald-500' :
                            cat.color === 'rose' ? 'bg-rose-500' :
                            cat.color === 'cyan' ? 'bg-cyan-500' : 'bg-slate-500'
                          )} />
                          {cat.name}
                        </h5>
                        <span className="text-[11px] text-slate-500 font-semibold">
                          {catVendors.length} {catVendors.length === 1 ? 'vendor' : 'vendors'} • Subtotal: <strong className="text-slate-900 font-mono">OMR {formatOMR(catTotal)}</strong>
                        </span>
                      </div>

                      <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white shadow-sm">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider">
                              <th className="py-2.5 px-3 w-10">#</th>
                              <th className="py-2.5 px-3">Vendor / Entity Name</th>
                              <th className="py-2.5 px-3 text-center">Bills Count</th>
                              <th className="py-2.5 px-3 text-right">Total Invoiced (OMR)</th>
                              <th className="py-2.5 px-3 text-right">Settled / Paid (OMR)</th>
                              <th className="py-2.5 px-3 text-right">Outstanding Balance (OMR)</th>
                              <th className="py-2.5 px-3 text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-700">
                            {catVendors.map((v, idx) => {
                              const vMatch = vendors.find(vend => vend.name.toLowerCase().trim() === v.name.toLowerCase().trim());
                              const hasCredits = Number(vMatch?.unused_credits_payable_amount || 0) > 0;

                              return (
                                <tr key={v.name} className="hover:bg-slate-50/60 transition-colors">
                                  <td className="py-2.5 px-3 text-slate-400 font-numeric">{idx + 1}</td>
                                  <td className="py-2.5 px-3">
                                    <span className="font-bold text-slate-900 text-xs block">{v.name}</span>
                                    {hasCredits && (
                                      <span className="inline-flex items-center gap-1 mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        <Zap className="h-2.5 w-2.5 text-emerald-600" />
                                        Zoho Advance Credit: OMR {formatOMR(vMatch!.unused_credits_payable_amount!)}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-numeric text-slate-600">{v.totalCount}</td>
                                  <td className="py-2.5 px-3 text-right font-numeric text-slate-800">{formatOMR(v.totalAmount)}</td>
                                  <td className="py-2.5 px-3 text-right font-numeric text-emerald-600 font-medium">{formatOMR(v.paidAmount)}</td>
                                  <td className="py-2.5 px-3 text-right font-numeric font-bold">
                                    {v.pendingAmount > 0 ? (
                                      <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200/60 font-mono">
                                        {formatOMR(v.pendingAmount)}
                                      </span>
                                    ) : (
                                      <span className="text-emerald-600 font-mono">
                                        {formatOMR(0)}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    {v.pendingAmount <= 0 ? (
                                      <span className="inline-block rounded px-2 py-0.5 text-[9px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        Fully Settled
                                      </span>
                                    ) : v.paidAmount > 0 ? (
                                      <span className="inline-block rounded px-2 py-0.5 text-[9px] font-bold uppercase bg-blue-50 text-blue-700 border border-blue-200">
                                        Partially Paid
                                      </span>
                                    ) : (
                                      <span className="inline-block rounded px-2 py-0.5 text-[9px] font-bold uppercase bg-rose-50 text-rose-700 border border-rose-200">
                                        Outstanding
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="bg-slate-100/80 text-slate-900 font-bold text-xs border-t border-slate-200">
                              <td colSpan={2} className="py-2.5 px-3 uppercase tracking-wider text-[10px] text-slate-500">
                                Category Subtotal
                              </td>
                              <td className="py-2.5 px-3 text-center font-numeric text-slate-600">
                                {catVendors.reduce((sum, v) => sum + v.totalCount, 0)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-numeric">{formatOMR(catTotal)}</td>
                              <td className="py-2.5 px-3 text-right font-numeric text-emerald-600">{formatOMR(catPaid)}</td>
                              <td className="py-2.5 px-3 text-right font-numeric text-rose-600 font-mono">{formatOMR(catPending)}</td>
                              <td className="py-2.5 px-3 text-center text-slate-400 text-[10px]">OMR</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  );
                });
              })()}

                {/* Grand Total Bar */}
                <div className="bg-slate-900 text-white rounded-xl p-4 flex items-center justify-between shadow-md">
                  <div>
                    <span className="text-xs uppercase tracking-wider text-slate-400 font-bold">Consolidated Grand Total</span>
                    <p className="text-lg font-bold font-numeric text-white mt-0.5">
                      OMR {formatOMR(grandTotal.totalAmount)}
                    </p>
                  </div>
                  <div className="flex items-center gap-6 text-right">
                    <div>
                      <span className="text-[10px] uppercase text-emerald-400 font-bold block">Total Cleared</span>
                      <span className="text-sm font-mono font-bold text-emerald-400">OMR {formatOMR(grandTotal.paidAmount)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-rose-400 font-bold block">Total Outstanding</span>
                      <span className="text-sm font-mono font-bold text-rose-400">OMR {formatOMR(grandTotal.pendingAmount)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              (() => {
                // Find the first category that has payables
                let firstVisibleCatId: string | null = null;
                for (const cat of categories) {
                  const hasPayables = filteredPayables.some((p) => p.category_id === cat.id);
                  if (hasPayables) {
                    firstVisibleCatId = cat.id;
                    break;
                  }
                }

                return categories.map((cat) => {
                  const catPayables = filteredPayables
                    .filter((p) => p.category_id === cat.id)
                    .sort((a, b) => a.due_date.localeCompare(b.due_date));

                  if (catPayables.length === 0) return null;

                const catTotal = catPayables.reduce((sum, p) => {
                  const amt = unpaidOnly 
                    ? (Number(p.amount) - Number(p.paid_amount || 0)) 
                    : Number(p.amount);
                  return sum + amt;
                }, 0);
                const catPaid = catPayables.reduce((sum, p) => {
                  if (p.status === 'paid') return sum + Number(p.amount);
                  if (p.status === 'partial') return sum + Number(p.paid_amount || 0);
                  return sum;
                }, 0);
                const catPending = catPayables.reduce((sum, p) => {
                  if (p.status === 'paid' || p.status === 'cancelled') return sum;
                  return sum + (Number(p.amount) - Number(p.paid_amount || 0));
                }, 0);

                const isFirst = cat.id === firstVisibleCatId;

                const cardContent = (
                  <div className="space-y-2 bg-slate-50/50 p-4 rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <h5 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full",
                          cat.color === 'blue' ? 'bg-blue-500' :
                          cat.color === 'violet' ? 'bg-violet-500' :
                          cat.color === 'amber' ? 'bg-amber-500' :
                          cat.color === 'orange' ? 'bg-orange-500' :
                          cat.color === 'green' ? 'bg-emerald-500' :
                          cat.color === 'rose' ? 'bg-rose-500' :
                          cat.color === 'cyan' ? 'bg-cyan-500' : 'bg-slate-500'
                        )} />
                        {cat.name}
                      </h5>
                      <span className="text-[10px] text-slate-400 font-semibold uppercase">
                        {catPayables.length} {catPayables.length === 1 ? 'record' : 'records'}
                      </span>
                    </div>

                    <div className="overflow-x-auto bg-white rounded-lg border border-slate-200">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                            <th className="py-2 px-3">Due Date</th>
                            <th className="py-2 px-3">Vendor &amp; Details</th>
                            <th className="py-2 px-3">Ref No.</th>
                            <th className="py-2 px-3 text-right">{unpaidOnly ? 'Outstanding (OMR)' : 'Amount (OMR)'}</th>
                            <th className="py-2 px-3 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {catPayables.map((p) => (
                            <tr key={p.id} className="hover:bg-slate-50/30">
                              <td className="py-2 px-3 font-numeric text-slate-500">
                                {format(parseISO(p.due_date), 'dd MMM yyyy')}
                              </td>
                              <td className="py-2 px-3 whitespace-pre-wrap break-words min-w-[200px]">
                                <span className="font-bold text-slate-950 block text-[13px]">{p.vendor_name || '—'}</span>
                                <span className="font-medium text-slate-700 block mt-1" title={p.title}>{p.title}</span>
                                {p.notes && (
                                  <span className="text-[11px] text-slate-500 block mt-1 leading-relaxed whitespace-pre-wrap break-words">{p.notes}</span>
                                )}
                                {p.pdc && p.pdc.cheque_no && (
                                  <span className="text-[10px] text-orange-600 font-semibold block mt-1">
                                    Cheque #{p.pdc.cheque_no} • {p.pdc.bank_name || '—'} (Status: {p.pdc.status})
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 font-numeric text-slate-500">{p.reference_no || '—'}</td>
                              <td className="py-2 px-3 text-right font-bold text-slate-800 font-numeric">
                                {p.status === 'partial' ? (
                                  <div className="text-right">
                                    <span className="block text-slate-900 font-bold">
                                      {formatOMR(Number(p.amount) - Number(p.paid_amount || 0))}
                                    </span>
                                    <span className="block text-[10px] text-slate-400 font-normal">
                                      of {formatOMR(Number(p.amount))}
                                    </span>
                                  </div>
                                ) : (
                                  formatOMR(unpaidOnly ? (Number(p.amount) - Number(p.paid_amount || 0)) : Number(p.amount))
                                )}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <span className={cn(
                                  "inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide border",
                                  p.status === 'paid' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
                                  p.status === 'partial' ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' :
                                  p.status === 'overdue' ? 'bg-rose-500/10 text-rose-600 border-rose-500/20' :
                                  p.status === 'cancelled' ? 'bg-slate-500/10 text-slate-500 border-slate-500/20' :
                                  'bg-amber-500/10 text-amber-600 border-amber-500/20'
                                )}>
                                  {p.status === 'partial' && p.paid_amount ? `partial (${p.paid_amount})` : p.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-50 font-bold text-slate-900 border-t border-slate-200">
                            <td colSpan={3} className="py-2.5 px-3 text-slate-500 text-[10px] uppercase tracking-wider">
                              Section Subtotal ({cat.name})
                            </td>
                            <td className="py-2.5 px-3 text-right font-numeric text-slate-950 font-bold">
                              {formatOMR(catTotal)}
                            </td>
                            <td className="py-2.5 px-3 text-center text-[9px] text-slate-500 font-numeric whitespace-nowrap">
                              Paid: <span className="text-emerald-600 font-bold">{catPayables.filter(p => p.status === 'paid' || p.status === 'partial').length}</span> | 
                              Due: <span className="text-amber-600 font-bold">{catPayables.filter(p => p.status === 'pending' || p.status === 'overdue' || p.status === 'partial').length}</span>
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                );

                if (isFirst) {
                  return (
                    <div key={cat.id} data-pdf-section className="space-y-6">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Detailed Transaction Ledger (Grouped by Category)
                      </h4>
                      {cardContent}
                    </div>
                  );
                }

                return (
                  <div key={cat.id} data-pdf-section className="space-y-6">
                    {cardContent}
                  </div>
                );
              });
            })())}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-900">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    }>
      <ReportsContent />
    </Suspense>
  );
}
