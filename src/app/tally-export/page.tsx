"use client";

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import PrinterLoader from '@/components/PrinterLoader';
import { listenToAuthChanges, AppUser } from '@/lib/auth';
import { listenToOrders, OrderRecord } from '@/lib/db';
import { toast } from 'react-hot-toast';
import * as XLSX from 'xlsx';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function TallyExportPage() {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  // Filter States
  const currentDate = new Date();
  const currentMonthStr = String(currentDate.getMonth() + 1).padStart(2, '0');
  const currentYearStr = String(currentDate.getFullYear());

  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);
  const [selectedYear, setSelectedYear] = useState<string>(currentYearStr);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [gstRateFilter, setGstRateFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Per-order tax rate overrides in UI (order.id -> rate e.g. 5, 18, 0)
  const [customTaxRates, setCustomTaxRates] = useState<Record<string, number>>({});

  // Listen to Auth
  useEffect(() => {
    const unsubscribe = listenToAuthChanges((authUser, appUserData) => {
      if (!authUser || !appUserData) {
        router.push('/');
      } else {
        setUser(appUserData);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  // Listen to Orders
  useEffect(() => {
    if (!user) return;
    setOrdersLoading(true);
    const unsubscribe = listenToOrders((data) => {
      setOrders(data);
      setOrdersLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  // Handle Tax Rate Override change for single order
  const handleTaxRateChange = (orderId: string, rate: number) => {
    setCustomTaxRates((prev) => ({
      ...prev,
      [orderId]: rate,
    }));
  };

  // Helper to extract year and month from order (uses deliveryDate or createdAt)
  const getOrderDateInfo = (order: OrderRecord) => {
    let dateStr = order.deliveryDate;
    if (!dateStr && order.createdAt?.toDate) {
      dateStr = order.createdAt.toDate().toISOString().split('T')[0];
    }
    if (!dateStr) {
      dateStr = new Date().toISOString().split('T')[0];
    }

    const parts = dateStr.split('-');
    const year = parts[0] || currentYearStr;
    const month = parts[1] || '01';
    const day = parts[2] || '01';

    return { dateStr, year, month, day, formattedDate: `${day}/${month}/${year}` };
  };

  // Filtered Orders List
  const filteredOrders = useMemo(() => {
    return orders.filter((ord) => {
      const { year, month } = getOrderDateInfo(ord);

      // Month Filter
      if (selectedMonth !== 'all' && month !== selectedMonth) {
        return false;
      }

      // Year Filter
      if (selectedYear !== 'all' && year !== selectedYear) {
        return false;
      }

      // Status Filter
      if (statusFilter !== 'all' && ord.status !== statusFilter) {
        return false;
      }

      // Effective GST Rate
      const effectiveGstRate = customTaxRates[ord.id || ''] ?? (ord.taxRate ?? 5);
      if (gstRateFilter !== 'all' && String(effectiveGstRate) !== gstRateFilter) {
        return false;
      }

      // Search Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const cust = (ord.customerName || '').toLowerCase();
        const phone = (ord.customerPhone || '').toLowerCase();
        const title = (ord.orderTitle || '').toLowerCase();
        const infoNum = String(ord.infoNumber || '');
        const orderNum = (ord.orderNumber || '').toLowerCase();

        if (!cust.includes(q) && !phone.includes(q) && !title.includes(q) && !infoNum.includes(q) && !orderNum.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [orders, selectedMonth, selectedYear, statusFilter, gstRateFilter, searchQuery, customTaxRates]);

  // Financial Metrics Summaries
  const metrics = useMemo(() => {
    let grossTotal = 0;
    let taxableTotal = 0;
    let gstTotal = 0;
    let balanceTotal = 0;
    let cgstTotal = 0;
    let sgstTotal = 0;

    filteredOrders.forEach((ord) => {
      const total = ord.totalAmount || 0;
      const balance = ord.balanceAmount || 0;
      const ratePercent = customTaxRates[ord.id || ''] ?? (ord.taxRate ?? 5);

      // Calculate taxable base & GST amount
      // If total includes GST: Taxable = Total / (1 + Rate/100)
      let taxable = total;
      let gstAmt = 0;

      if (ratePercent > 0) {
        taxable = Math.round((total / (1 + ratePercent / 100)) * 100) / 100;
        gstAmt = Math.round((total - taxable) * 100) / 100;
      }

      grossTotal += total;
      taxableTotal += taxable;
      gstTotal += gstAmt;
      balanceTotal += balance;
      cgstTotal += gstAmt / 2;
      sgstTotal += gstAmt / 2;
    });

    return {
      count: filteredOrders.length,
      grossTotal: Math.round(grossTotal),
      taxableTotal: Math.round(taxableTotal),
      gstTotal: Math.round(gstTotal),
      cgstTotal: Math.round(cgstTotal),
      sgstTotal: Math.round(sgstTotal),
      balanceTotal: Math.round(balanceTotal),
    };
  }, [filteredOrders, customTaxRates]);

  // ── EXPORT TO EXCEL (.xlsx) FOR TALLY ──
  const handleExportExcel = () => {
    if (filteredOrders.length === 0) {
      toast.error('No orders available to export for selected period');
      return;
    }

    try {
      const rows = filteredOrders.map((ord, idx) => {
        const { formattedDate } = getOrderDateInfo(ord);
        const ratePercent = customTaxRates[ord.id || ''] ?? (ord.taxRate ?? 5);
        const grossTotal = ord.totalAmount || 0;
        let taxable = grossTotal;
        let gstAmt = 0;

        if (ratePercent > 0) {
          taxable = Math.round((grossTotal / (1 + ratePercent / 100)) * 100) / 100;
          gstAmt = Math.round((grossTotal - taxable) * 100) / 100;
        }

        const cgst = Math.round((gstAmt / 2) * 100) / 100;
        const sgst = Math.round((gstAmt / 2) * 100) / 100;
        const voucherNo = ord.invoiceNumber || ord.orderNumber || `ORD-${ord.infoNumber}`;
        const itemDesc = `${ord.itemType || 'JERSEY'} (${ord.clothType || 'SALEENA'} - ${ord.sleeveType || 'Full'})`;

        return {
          'Sl No': idx + 1,
          'Voucher Date': formattedDate,
          'Voucher Type': 'Sales',
          'Voucher No / Inv No': voucherNo,
          'INFO No': ord.infoNumber || '-',
          'Buyer Name': ord.customerName || 'Walk-in Customer',
          'Buyer Phone': ord.customerPhone || '-',
          'Particulars': itemDesc,
          'Pieces / Qty': ord.pieces || (ord.players?.length || 1),
          'Taxable Value (₹)': taxable,
          'GST Rate %': `${ratePercent}%`,
          'CGST Amount (₹)': cgst,
          'SGST Amount (₹)': sgst,
          'Total GST (₹)': gstAmt,
          'Gross Total (₹)': grossTotal,
          'Advance Paid (₹)': ord.advanceAmount || 0,
          'Balance Due (₹)': ord.balanceAmount || 0,
          'Order Status': (ord.status || 'pending').toUpperCase(),
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(rows);

      // Set custom column widths for readability
      worksheet['!cols'] = [
        { wch: 6 },  // Sl No
        { wch: 14 }, // Date
        { wch: 14 }, // Voucher Type
        { wch: 18 }, // Voucher No
        { wch: 10 }, // INFO No
        { wch: 24 }, // Buyer Name
        { wch: 16 }, // Phone
        { wch: 30 }, // Particulars
        { wch: 12 }, // Qty
        { wch: 16 }, // Taxable
        { wch: 12 }, // GST %
        { wch: 14 }, // CGST
        { wch: 14 }, // SGST
        { wch: 14 }, // Total GST
        { wch: 16 }, // Gross
        { wch: 14 }, // Advance
        { wch: 14 }, // Balance
        { wch: 14 }, // Status
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Tally Sales Vouchers');

      const monthName = selectedMonth === 'all' ? 'All_Months' : MONTH_NAMES[parseInt(selectedMonth, 10) - 1];
      const filename = `PrintMart_Tally_Sales_${monthName}_${selectedYear}.xlsx`;

      XLSX.writeFile(workbook, filename);
      toast.success(`Successfully exported ${filteredOrders.length} orders to ${filename}!`);
    } catch (err) {
      console.error('Error generating Excel file:', err);
      toast.error('Failed to generate Tally Excel file');
    }
  };

  // ── EXPORT TO TALLY XML FILE (.xml) ──
  const handleExportXml = () => {
    if (filteredOrders.length === 0) {
      toast.error('No orders available to export for selected period');
      return;
    }

    try {
      let xmlContent = `<?xml version="1.0" encoding="UTF-8"?>\n`;
      xmlContent += `<ENVELOPE>\n`;
      xmlContent += `  <HEADER>\n`;
      xmlContent += `    <TALLYREQUEST>Import Data</TALLYREQUEST>\n`;
      xmlContent += `  </HEADER>\n`;
      xmlContent += `  <BODY>\n`;
      xmlContent += `    <IMPORTDATA>\n`;
      xmlContent += `      <REQUESTDESC>\n`;
      xmlContent += `        <REPORTNAME>Vouchers</REPORTNAME>\n`;
      xmlContent += `        <STATICVARIABLES>\n`;
      xmlContent += `          <SVCURRENTCOMPANY>PRINT MART</SVCURRENTCOMPANY>\n`;
      xmlContent += `        </STATICVARIABLES>\n`;
      xmlContent += `      </REQUESTDESC>\n`;
      xmlContent += `      <REQUESTDATA>\n`;

      filteredOrders.forEach((ord) => {
        const { dateStr } = getOrderDateInfo(ord);
        const tallyDate = dateStr.replace(/-/g, ''); // YYYYMMDD
        const voucherNo = ord.invoiceNumber || ord.orderNumber || `ORD-${ord.infoNumber}`;
        const partyName = (ord.customerName || 'Cash Sales').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const grossTotal = ord.totalAmount || 0;
        const ratePercent = customTaxRates[ord.id || ''] ?? (ord.taxRate ?? 5);

        let taxable = grossTotal;
        let gstAmt = 0;
        if (ratePercent > 0) {
          taxable = Math.round((grossTotal / (1 + ratePercent / 100)) * 100) / 100;
          gstAmt = Math.round((grossTotal - taxable) * 100) / 100;
        }

        const cgst = Math.round((gstAmt / 2) * 100) / 100;
        const sgst = Math.round((gstAmt / 2) * 100) / 100;

        xmlContent += `        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n`;
        xmlContent += `          <VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Accounting Voucher View">\n`;
        xmlContent += `            <DATE>${tallyDate}</DATE>\n`;
        xmlContent += `            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>\n`;
        xmlContent += `            <VOUCHERNUMBER>${voucherNo}</VOUCHERNUMBER>\n`;
        xmlContent += `            <PARTYLEDGERNAME>${partyName}</PARTYLEDGERNAME>\n`;
        xmlContent += `            <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>\n`;
        xmlContent += `            <NARRATION>Order INFO #${ord.infoNumber || ''} - ${ord.orderTitle || ''} (${ord.pieces || 1} Pcs)</NARRATION>\n`;

        // Party Entry (Debit Gross Total)
        xmlContent += `            <ALLLEDGERENTRIES.LIST>\n`;
        xmlContent += `              <LEDGERNAME>${partyName}</LEDGERNAME>\n`;
        xmlContent += `              <ISDEEMEDPOSITIVE>YES</ISDEEMEDPOSITIVE>\n`;
        xmlContent += `              <AMOUNT>-${grossTotal.toFixed(2)}</AMOUNT>\n`;
        xmlContent += `            </ALLLEDGERENTRIES.LIST>\n`;

        // Sales Income Entry (Credit Taxable Value)
        xmlContent += `            <ALLLEDGERENTRIES.LIST>\n`;
        xmlContent += `              <LEDGERNAME>Printing Sales Account</LEDGERNAME>\n`;
        xmlContent += `              <ISDEEMEDPOSITIVE>NO</ISDEEMEDPOSITIVE>\n`;
        xmlContent += `              <AMOUNT>${taxable.toFixed(2)}</AMOUNT>\n`;
        xmlContent += `            </ALLLEDGERENTRIES.LIST>\n`;

        // CGST Entry (if applicable)
        if (cgst > 0) {
          xmlContent += `            <ALLLEDGERENTRIES.LIST>\n`;
          xmlContent += `              <LEDGERNAME>Output CGST ${ratePercent / 2}%</LEDGERNAME>\n`;
          xmlContent += `              <ISDEEMEDPOSITIVE>NO</ISDEEMEDPOSITIVE>\n`;
          xmlContent += `              <AMOUNT>${cgst.toFixed(2)}</AMOUNT>\n`;
          xmlContent += `            </ALLLEDGERENTRIES.LIST>\n`;
        }

        // SGST Entry (if applicable)
        if (sgst > 0) {
          xmlContent += `            <ALLLEDGERENTRIES.LIST>\n`;
          xmlContent += `              <LEDGERNAME>Output SGST ${ratePercent / 2}%</LEDGERNAME>\n`;
          xmlContent += `              <ISDEEMEDPOSITIVE>NO</ISDEEMEDPOSITIVE>\n`;
          xmlContent += `              <AMOUNT>${sgst.toFixed(2)}</AMOUNT>\n`;
          xmlContent += `            </ALLLEDGERENTRIES.LIST>\n`;
        }

        xmlContent += `          </VOUCHER>\n`;
        xmlContent += `        </TALLYMESSAGE>\n`;
      });

      xmlContent += `      </REQUESTDATA>\n`;
      xmlContent += `    </IMPORTDATA>\n`;
      xmlContent += `  </BODY>\n`;
      xmlContent += `</ENVELOPE>`;

      const blob = new Blob([xmlContent], { type: 'application/xml;charset=utf-8' });
      const monthName = selectedMonth === 'all' ? 'All_Months' : MONTH_NAMES[parseInt(selectedMonth, 10) - 1];
      const filename = `Tally_Sales_Vouchers_${monthName}_${selectedYear}.xml`;

      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);

      toast.success(`Successfully generated Tally XML Vouchers file: ${filename}`);
    } catch (err) {
      console.error('Error generating Tally XML file:', err);
      toast.error('Failed to generate Tally XML file');
    }
  };

  // ── COPY TSV DATA FOR EXCEL / SHEETS PASTE ──
  const handleCopyTable = () => {
    if (filteredOrders.length === 0) {
      toast.error('No data to copy');
      return;
    }

    const headers = ['Date', 'Inv No', 'INFO No', 'Customer Name', 'Phone', 'Particulars', 'Qty', 'Taxable Amt', 'GST %', 'GST Amt', 'Gross Total', 'Balance', 'Status'];
    const rows = filteredOrders.map((ord) => {
      const { formattedDate } = getOrderDateInfo(ord);
      const ratePercent = customTaxRates[ord.id || ''] ?? (ord.taxRate ?? 5);
      const grossTotal = ord.totalAmount || 0;
      let taxable = grossTotal;
      let gstAmt = 0;
      if (ratePercent > 0) {
        taxable = Math.round((grossTotal / (1 + ratePercent / 100)) * 100) / 100;
        gstAmt = Math.round((grossTotal - taxable) * 100) / 100;
      }
      return [
        formattedDate,
        ord.invoiceNumber || ord.orderNumber || `ORD-${ord.infoNumber}`,
        ord.infoNumber || '',
        ord.customerName || '',
        ord.customerPhone || '',
        `${ord.itemType || 'JERSEY'} (${ord.clothType || ''})`,
        ord.pieces || 1,
        taxable,
        `${ratePercent}%`,
        gstAmt,
        grossTotal,
        ord.balanceAmount || 0,
        ord.status || 'pending',
      ].join('\t');
    });

    const tsvData = [headers.join('\t'), ...rows].join('\n');
    navigator.clipboard.writeText(tsvData).then(() => {
      toast.success(`Copied ${filteredOrders.length} order rows to clipboard!`);
    }).catch(() => {
      toast.error('Failed to copy to clipboard');
    });
  };

  // ── PRINT AUDIT REPORT ──
  const handlePrintReport = () => {
    window.print();
  };

  if (authLoading || ordersLoading) {
    return <PrinterLoader text="Preparing Tally Tax Export Manager..." />;
  }

  if (!user) return null;

  const monthLabel = selectedMonth === 'all' ? 'All Months' : MONTH_NAMES[parseInt(selectedMonth, 10) - 1];

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-primary)] pb-16">
      <Navbar user={user} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {/* ── TOP BANNER & TITLE ── */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)',
          borderRadius: '16px',
          padding: '1.25rem 1.5rem',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
          marginBottom: '1.5rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                <span style={{
                  background: '#d92525',
                  color: '#ffffff',
                  fontSize: '0.7rem',
                  fontWeight: 900,
                  padding: '0.2rem 0.6rem',
                  borderRadius: '6px',
                  letterSpacing: '0.05em'
                }}>
                  TEMPORARY FEATURE MODULE
                </span>
                <span style={{
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#10b981',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  padding: '0.2rem 0.6rem',
                  borderRadius: '6px'
                }}>
                  ✓ Tally Prime V2.0 Compatible
                </span>
              </div>

              <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#ffffff', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                Tally Prime Monthly Orders & GST Tax Converter
              </h1>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>
                Filter orders by month/status, convert into Tally Sales Vouchers Excel (.xlsx) or Tally XML format for GST tax filing.
              </p>
            </div>

            {/* Quick Export Buttons */}
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleExportExcel}
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  padding: '0.55rem 1rem',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                Download Tally Excel (.xlsx)
              </button>

              <button
                type="button"
                onClick={handleExportXml}
                style={{
                  background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  padding: '0.55rem 1rem',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                Export Tally XML Vouchers (.xml)
              </button>

              <button
                type="button"
                onClick={handleCopyTable}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: 'var(--text-primary)',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  padding: '0.55rem 0.85rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  cursor: 'pointer'
                }}
              >
                📋 Copy Data
              </button>
            </div>
          </div>
        </div>

        {/* ── FILTER CONTROL PANEL ── */}
        <div style={{
          background: 'var(--bg-surface)',
          padding: '1rem 1.25rem',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          marginBottom: '1.5rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.85rem',
          alignItems: 'center'
        }}>
          {/* Month Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Select Month</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{
                width: '100%',
                padding: '0.45rem 0.65rem',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg-main)',
                color: 'var(--text-primary)',
                fontSize: '0.83rem',
                fontWeight: 700,
                outline: 'none'
              }}
            >
              <option value="all" style={{ background: '#161e31', color: '#fff' }}>All Months</option>
              {MONTH_NAMES.map((name, idx) => {
                const val = String(idx + 1).padStart(2, '0');
                return (
                  <option key={val} value={val} style={{ background: '#161e31', color: '#fff' }}>
                    {name}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Year Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Select Year</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              style={{
                width: '100%',
                padding: '0.45rem 0.65rem',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg-main)',
                color: 'var(--text-primary)',
                fontSize: '0.83rem',
                fontWeight: 700,
                outline: 'none'
              }}
            >
              <option value="all" style={{ background: '#161e31', color: '#fff' }}>All Years</option>
              <option value="2027" style={{ background: '#161e31', color: '#fff' }}>2027</option>
              <option value="2026" style={{ background: '#161e31', color: '#fff' }}>2026</option>
              <option value="2025" style={{ background: '#161e31', color: '#fff' }}>2025</option>
              <option value="2024" style={{ background: '#161e31', color: '#fff' }}>2024</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Order Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '0.45rem 0.65rem',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg-main)',
                color: 'var(--text-primary)',
                fontSize: '0.83rem',
                fontWeight: 700,
                outline: 'none'
              }}
            >
              <option value="all" style={{ background: '#161e31', color: '#fff' }}>All Statuses</option>
              <option value="delivered" style={{ background: '#161e31', color: '#10b981' }}>Delivered Only</option>
              <option value="in_production" style={{ background: '#161e31', color: '#eab308' }}>In Production</option>
              <option value="ready" style={{ background: '#161e31', color: '#3b82f6' }}>Ready</option>
              <option value="pending" style={{ background: '#161e31', color: '#f97316' }}>Pending</option>
            </select>
          </div>

          {/* GST Rate Filter */}
          <div>
            <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>GST Tax Rate</label>
            <select
              value={gstRateFilter}
              onChange={(e) => setGstRateFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '0.45rem 0.65rem',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg-main)',
                color: 'var(--text-primary)',
                fontSize: '0.83rem',
                fontWeight: 700,
                outline: 'none'
              }}
            >
              <option value="all" style={{ background: '#161e31', color: '#fff' }}>All GST Rates</option>
              <option value="5" style={{ background: '#161e31', color: '#fff' }}>5% GST</option>
              <option value="18" style={{ background: '#161e31', color: '#fff' }}>18% GST</option>
              <option value="0" style={{ background: '#161e31', color: '#fff' }}>0% Exempt</option>
            </select>
          </div>

          {/* Search Box */}
          <div>
            <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Search Record</label>
            <input
              type="text"
              placeholder="Search Customer, INFO #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.45rem 0.65rem',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg-main)',
                color: 'var(--text-primary)',
                fontSize: '0.83rem',
                outline: 'none'
              }}
            />
          </div>
        </div>

        {/* ── METRICS OVERVIEW CARDS ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem'
        }}>
          {/* Total Orders Card */}
          <div className="card-glass" style={{ borderRadius: '12px', padding: '1rem', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Filtered Orders</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#3b82f6', marginTop: '0.2rem' }}>{metrics.count}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>Period: {monthLabel} {selectedYear}</div>
          </div>

          {/* Gross Sales Card */}
          <div className="card-glass" style={{ borderRadius: '12px', padding: '1rem', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Gross Sales Revenue</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#10b981', marginTop: '0.2rem' }}>₹{metrics.grossTotal.toLocaleString()}</div>
            <div style={{ fontSize: '0.72rem', color: '#10b981', marginTop: '0.2rem', fontWeight: 700 }}>Total Billed Value</div>
          </div>

          {/* Taxable Value Card */}
          <div className="card-glass" style={{ borderRadius: '12px', padding: '1rem', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Taxable Sales Value</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#f59e0b', marginTop: '0.2rem' }}>₹{metrics.taxableTotal.toLocaleString()}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>Net Sales Excl. GST</div>
          </div>

          {/* GST Amount Card */}
          <div className="card-glass" style={{ borderRadius: '12px', padding: '1rem', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total GST Tax Collected</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#ec4899', marginTop: '0.2rem' }}>₹{metrics.gstTotal.toLocaleString()}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>CGST: ₹{metrics.cgstTotal.toLocaleString()} | SGST: ₹{metrics.sgstTotal.toLocaleString()}</div>
          </div>

          {/* Pending Balance Card */}
          <div className="card-glass" style={{ borderRadius: '12px', padding: '1rem', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Uncollected Balance</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: metrics.balanceTotal > 0 ? '#ef4444' : '#10b981', marginTop: '0.2rem' }}>
              ₹{metrics.balanceTotal.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.72rem', color: metrics.balanceTotal > 0 ? '#ef4444' : '#10b981', marginTop: '0.2rem', fontWeight: 700 }}>
              {metrics.balanceTotal > 0 ? 'Outstanding Receivables' : 'All Clear / Fully Paid'}
            </div>
          </div>
        </div>

        {/* ── ORDERS TABLE FOR TALLY AUDIT ── */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              Tally Sales Voucher Records ({filteredOrders.length} Rows)
            </h3>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Tip: You can edit individual GST Tax Rates below before downloading your Tally file.
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
              <thead style={{ background: 'rgba(0,0,0,0.2)', color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: '0.7rem', fontWeight: 800 }}>
                <tr>
                  <th style={{ padding: '0.65rem 0.85rem' }}>#</th>
                  <th style={{ padding: '0.65rem 0.85rem' }}>Date</th>
                  <th style={{ padding: '0.65rem 0.85rem' }}>INFO / Voucher #</th>
                  <th style={{ padding: '0.65rem 0.85rem' }}>Customer Name</th>
                  <th style={{ padding: '0.65rem 0.85rem' }}>Particulars</th>
                  <th style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>Qty</th>
                  <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right' }}>Taxable (₹)</th>
                  <th style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>GST Rate</th>
                  <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right' }}>GST Amt (₹)</th>
                  <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right' }}>Gross Bill (₹)</th>
                  <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right' }}>Balance (₹)</th>
                  <th style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length > 0 ? (
                  filteredOrders.map((ord, idx) => {
                    const { formattedDate } = getOrderDateInfo(ord);
                    const ratePercent = customTaxRates[ord.id || ''] ?? (ord.taxRate ?? 5);
                    const grossTotal = ord.totalAmount || 0;
                    let taxable = grossTotal;
                    let gstAmt = 0;
                    if (ratePercent > 0) {
                      taxable = Math.round((grossTotal / (1 + ratePercent / 100)) * 100) / 100;
                      gstAmt = Math.round((grossTotal - taxable) * 100) / 100;
                    }

                    const voucherNo = ord.invoiceNumber || ord.orderNumber || `ORD-${ord.infoNumber}`;

                    return (
                      <tr key={ord.id || idx} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 1 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                        <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)' }}>{idx + 1}</td>
                        <td style={{ padding: '0.65rem 0.85rem', fontWeight: 700 }}>{formattedDate}</td>
                        <td style={{ padding: '0.65rem 0.85rem' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#ffffff', background: '#d92525', padding: '0.1rem 0.4rem', borderRadius: '4px', marginRight: '0.3rem' }}>
                            INFO #{ord.infoNumber}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{voucherNo}</span>
                        </td>
                        <td style={{ padding: '0.65rem 0.85rem', fontWeight: 800 }}>
                          {ord.customerName}
                          {ord.customerPhone && <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 400 }}>{ord.customerPhone}</div>}
                        </td>
                        <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                          {ord.itemType || 'JERSEY'} ({ord.clothType || 'SALEENA'})
                        </td>
                        <td style={{ padding: '0.65rem 0.85rem', textAlign: 'center', fontWeight: 800 }}>
                          {ord.pieces || (ord.players?.length || 1)}
                        </td>
                        <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontWeight: 700, color: '#f59e0b' }}>
                          ₹{taxable.toLocaleString()}
                        </td>
                        <td style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>
                          <select
                            value={ratePercent}
                            onChange={(e) => handleTaxRateChange(ord.id || '', Number(e.target.value))}
                            style={{
                              padding: '0.15rem 0.35rem',
                              borderRadius: '4px',
                              border: '1px solid var(--border)',
                              background: 'var(--bg-main)',
                              color: '#10b981',
                              fontWeight: 800,
                              fontSize: '0.73rem',
                              cursor: 'pointer'
                            }}
                          >
                            <option value={5} style={{ background: '#161e31', color: '#fff' }}>5% GST</option>
                            <option value={18} style={{ background: '#161e31', color: '#fff' }}>18% GST</option>
                            <option value={0} style={{ background: '#161e31', color: '#fff' }}>0% Exempt</option>
                          </select>
                        </td>
                        <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontWeight: 700, color: '#ec4899' }}>
                          ₹{gstAmt.toLocaleString()}
                        </td>
                        <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontWeight: 900, color: '#10b981' }}>
                          ₹{grossTotal.toLocaleString()}
                        </td>
                        <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontWeight: 800, color: ord.balanceAmount ? '#ef4444' : '#10b981' }}>
                          ₹{(ord.balanceAmount || 0).toLocaleString()}
                        </td>
                        <td style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>
                          <span style={{
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            padding: '0.15rem 0.45rem',
                            borderRadius: '4px',
                            background: ord.status === 'delivered' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                            color: ord.status === 'delivered' ? '#10b981' : '#eab308',
                            border: ord.status === 'delivered' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(234, 179, 8, 0.3)'
                          }}>
                            {ord.status || 'pending'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={12} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      No orders found matching selected month ({monthLabel}) and year ({selectedYear}).
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
