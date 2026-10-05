"use client";

import React, { useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { OrderRecord } from '@/lib/db';

export interface InvoiceItem {
  id?: string;
  itemType: string;
  clothType: string;
  sleeveType: string;
  neckType: string;
  hasShorts: boolean;
  bottomType?: 'shorts' | 'track_pant';
  pieces: number;
  ratePerPiece: number;
  subtotal: number;
  hsnCode?: string;
  dtfOption?: string;
  dtfRate?: number;
}

export interface InvoiceData {
  id?: string;
  docType?: 'QUOTATION' | 'INVOICE';
  billType?: 'GST' | 'NON_GST';
  invoiceNumber: string;
  quotationNumber?: string;
  invoiceDate: string;
  dueDate?: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  customerGstin?: string;
  stateName?: string;
  stateCode?: string;
  isInterState?: boolean;
  orderTitle?: string;
  infoNumber?: number;
  orderId?: string;
  itemType: string;
  clothType: string;
  sleeveType: string;
  neckType: string;
  hasShorts: boolean;
  bottomType?: 'shorts' | 'track_pant';
  pieces: number;
  ratePerPiece: number;
  subtotal: number;
  discountAmount: number;
  taxableAmount?: number;
  taxRate: number; // 0, 5, 12, 18, 28
  taxAmount: number;
  cgstRate?: number;
  cgstAmount?: number;
  sgstRate?: number;
  sgstAmount?: number;
  igstRate?: number;
  igstAmount?: number;
  roundOff?: number;
  totalAmount: number;
  advanceAmount: number;
  balanceAmount: number;
  paymentMode: string;
  paymentStatus?: 'PAID' | 'PARTIAL' | 'UNPAID';
  notes?: string;
  hsnCode?: string;
  dtfOption?: string;
  dtfRate?: number;
  items?: InvoiceItem[];
}

export function numberToWordsINR(num: number): string {
  if (!num || isNaN(num) || num <= 0) return 'Zero Rupees';

  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const inWords = (n: number): string => {
    if (n === 0) return '';
    if (n < 20) return a[n];
    const digit = n % 10;
    return b[Math.floor(n / 10)] + (digit ? ' ' + a[digit] : '');
  };

  const rounded = Math.round(num);
  const crore = Math.floor(rounded / 10000000);
  let rem = rounded % 10000000;
  const lakh = Math.floor(rem / 100000);
  rem = rem % 100000;
  const thousand = Math.floor(rem / 1000);
  rem = rem % 1000;
  const hundred = Math.floor(rem / 100);
  const rest = rem % 100;

  const parts: string[] = [];
  if (crore > 0) parts.push(`${inWords(crore)} Crore`);
  if (lakh > 0) parts.push(`${inWords(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${inWords(thousand)} Thousand`);
  if (hundred > 0) parts.push(`${inWords(hundred)} Hundred`);
  if (rest > 0) parts.push(inWords(rest));

  return `Rupees ${parts.join(' ').trim()} Only`;
}

interface InvoiceSlipProps {
  invoice: InvoiceData;
  order?: OrderRecord | null;
  onClose?: () => void;
}

export default function InvoiceSlip({ invoice, order, onClose }: InvoiceSlipProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [docType, setDocType] = useState<'QUOTATION' | 'INVOICE'>(invoice.docType || 'INVOICE');
  const [billType, setBillType] = useState<'GST' | 'NON_GST'>(invoice.billType || (invoice.taxRate > 0 ? 'GST' : 'NON_GST'));

  const handlePrint = () => {
    const originalTitle = document.title;
    document.title = `${docType}_${invoice.invoiceNumber || 'BILL'}`;
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  };

  const handleDownloadPDF = async () => {
    if (!printRef.current) return;
    const fileName = `${docType}_${invoice.invoiceNumber || 'BILL'}.pdf`;

    setDownloadingPdf(true);
    toast.loading(`Generating PDF ${fileName}...`, { id: 'pdf-inv-download' });

    try {
      // Dynamic import standalone html2pdf bundle
      // @ts-ignore
      const html2pdfModule = await import('html2pdf.js/dist/html2pdf.bundle.min.js');
      const html2pdf = html2pdfModule.default || html2pdfModule || (window as any).html2pdf;

      const element = printRef.current;
      const opt = {
        margin: [3, 3, 3, 3] as [number, number, number, number],
        filename: fileName,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, allowTaint: true, logging: false },
        jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const }
      };

      await html2pdf().from(element).set(opt).save();
      toast.dismiss('pdf-inv-download');
      toast.success(`Downloaded ${fileName}!`);
    } catch (err) {
      toast.dismiss('pdf-inv-download');
      console.error('Error generating PDF:', err);
      toast.error('Direct PDF export failed. Opening Print dialog...');
      handlePrint();
    } finally {
      setDownloadingPdf(false);
    }
  };

  const isGstActive = billType === 'GST' && (invoice.taxRate > 0 || invoice.taxAmount > 0);
  const isInterState = Boolean(invoice.isInterState);

  // Dynamic GST calculation if needed
  const effectiveTaxable = invoice.taxableAmount !== undefined ? invoice.taxableAmount : Math.max(0, invoice.subtotal - invoice.discountAmount);
  const effectiveTaxAmount = isGstActive ? (invoice.taxAmount || Math.round((effectiveTaxable * invoice.taxRate) / 100)) : 0;
  const effectiveCgst = isGstActive && !isInterState ? Math.round(effectiveTaxAmount / 2) : 0;
  const effectiveSgst = isGstActive && !isInterState ? (effectiveTaxAmount - effectiveCgst) : 0;
  const effectiveIgst = isGstActive && isInterState ? effectiveTaxAmount : 0;

  const currentDocNumber = docType === 'INVOICE'
    ? invoice.invoiceNumber
    : (invoice.quotationNumber || invoice.invoiceNumber.replace(/^INV-/, 'QT-'));

  const badgeTitle = docType === 'QUOTATION'
    ? 'QUOTATION / ESTIMATE'
    : isGstActive
      ? 'TAX INVOICE'
      : 'RETAIL INVOICE';

  return (
    <div className="invoice-modal-wrapper" style={{ padding: '1rem', color: '#000000' }}>
      {/* Top Controls Bar (Hidden in Print) */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Print Mart {badgeTitle} #{currentDocNumber}
            </h3>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Customer: <strong>{invoice.customerName}</strong> {invoice.customerPhone ? `(${invoice.customerPhone})` : ''}
            </p>
          </div>

          {/* Doc Type Toggle (Quotation vs Invoice) */}
          <div style={{ background: 'var(--bg-main)', padding: '0.2rem', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', gap: '0.2rem' }}>
            <button
              type="button"
              onClick={() => setDocType('INVOICE')}
              style={{
                padding: '0.3rem 0.75rem',
                borderRadius: '6px',
                border: 'none',
                background: docType === 'INVOICE' ? '#10b981' : 'transparent',
                color: docType === 'INVOICE' ? '#ffffff' : 'var(--text-secondary)',
                fontWeight: 800,
                fontSize: '0.78rem',
                cursor: 'pointer'
              }}
            >
              INVOICE
            </button>
            <button
              type="button"
              onClick={() => setDocType('QUOTATION')}
              style={{
                padding: '0.3rem 0.75rem',
                borderRadius: '6px',
                border: 'none',
                background: docType === 'QUOTATION' ? '#10b981' : 'transparent',
                color: docType === 'QUOTATION' ? '#ffffff' : 'var(--text-secondary)',
                fontWeight: 800,
                fontSize: '0.78rem',
                cursor: 'pointer'
              }}
            >
              QUOTATION
            </button>
          </div>

          {/* GST Mode Toggle */}
          <div style={{ background: 'var(--bg-main)', padding: '0.2rem', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', gap: '0.2rem' }}>
            <button
              type="button"
              onClick={() => setBillType('GST')}
              style={{
                padding: '0.3rem 0.75rem',
                borderRadius: '6px',
                border: 'none',
                background: billType === 'GST' ? '#3b82f6' : 'transparent',
                color: billType === 'GST' ? '#ffffff' : 'var(--text-secondary)',
                fontWeight: 800,
                fontSize: '0.78rem',
                cursor: 'pointer'
              }}
            >
              GST BILL
            </button>
            <button
              type="button"
              onClick={() => setBillType('NON_GST')}
              style={{
                padding: '0.3rem 0.75rem',
                borderRadius: '6px',
                border: 'none',
                background: billType === 'NON_GST' ? '#3b82f6' : 'transparent',
                color: billType === 'NON_GST' ? '#ffffff' : 'var(--text-secondary)',
                fontWeight: 800,
                fontSize: '0.78rem',
                cursor: 'pointer'
              }}
            >
              REGULAR BILL
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* Download PDF Button */}
          <button
            type="button"
            onClick={handleDownloadPDF}
            disabled={downloadingPdf}
            style={{
              padding: '0.55rem 1.1rem',
              borderRadius: '8px',
              border: 'none',
              background: '#10b981',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
              opacity: downloadingPdf ? 0.7 : 1
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
            <span>{downloadingPdf ? 'Generating PDF...' : `Download ${docType} PDF`}</span>
          </button>

          {/* Print Button */}
          <button
            type="button"
            onClick={handlePrint}
            style={{
              padding: '0.55rem 1.25rem',
              borderRadius: '8px',
              border: 'none',
              background: '#3b82f6',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
            <span>Print A4 Slip</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.55rem 1rem',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-primary)',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* ── PRINTABLE A4 BILL SHEET (WITH OFFICIAL PRINT MART LOGO) ── */}
      <div style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div
          ref={printRef}
          className="printable-invoice-sheet"
          style={{
            background: '#ffffff',
            color: '#000000',
            fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
            padding: '20px 24px',
            border: '1.5px solid #107c41',
            boxSizing: 'border-box',
            width: '100%',
            maxWidth: '840px',
            minWidth: '650px',
            minHeight: '280mm',
            margin: '0 auto',
            fontSize: '13px',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
        >
          <div>
            {/* Top Company Header Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              {/* Official Print Mart Logo Image from public/logo.png */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo.png"
                  alt="Print Mart Logo"
                  style={{
                    height: '65px',
                    width: 'auto',
                    objectFit: 'contain',
                    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))'
                  }}
                />
                <div>
                  <div style={{ fontSize: '26px', fontWeight: 900, color: '#000000', letterSpacing: '-0.02em', lineHeight: 1.05 }}>
                    Print<span style={{ color: '#107c41' }}>Mart</span>
                  </div>
                  <div style={{ fontSize: '10px', fontWeight: 800, color: '#4b5563', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: '2px' }}>
                    Custom Jersey & Sportswear Apparel
                  </div>
                </div>
              </div>

              {/* Category Pill Badge */}
              <div style={{
                background: '#107c41',
                color: '#ffffff',
                padding: '6px 24px',
                borderRadius: '20px',
                fontSize: '15px',
                fontWeight: 900,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                boxShadow: '0 2px 8px rgba(16, 124, 65, 0.25)'
              }}>
                JERSEY | UNIFORMS | T-SHIRTS
              </div>
            </div>

            {/* Subheader Company Address & GSTIN Information */}
            <div style={{ textAlign: 'center', fontSize: '12.5px', fontWeight: 700, color: '#1f2937', lineHeight: '1.45', marginBottom: '10px' }}>
              <div>Behind NSS Karayogam, Thattarkonam, Kottamkara, Kollam, Kerala - 691005</div>
              <div style={{ color: '#107c41', fontWeight: 800 }}>
                GSTIN: 32KRBPK8345C1ZW | State: Kerala, State Code: 32
              </div>
              <div style={{ fontSize: '11.5px', color: '#4b5563' }}>
                Mob: +91 7025005566, 9605222333 | Email: printmartklm@gmail.com
              </div>
            </div>

            {/* Separator Line with Centered Document Type Pill Badge */}
            <div style={{ position: 'relative', borderTop: '2px solid #107c41', margin: '14px 0 18px 0', textAlign: 'center' }}>
              <span style={{
                position: 'absolute',
                top: '-13px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: '#107c41',
                color: '#ffffff',
                padding: '3px 24px',
                borderRadius: '16px',
                fontSize: '13px',
                fontWeight: 900,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
              }}>
                {badgeTitle}
              </span>
            </div>

            {/* Customer (Billed To) & Invoice Meta Section */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1.4fr 1fr',
              gap: '16px',
              padding: '12px 14px',
              background: '#f9fafb',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              marginBottom: '14px'
            }}>
              {/* Customer Box */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 900, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  CUSTOMER (BILLED TO):
                </div>
                <div style={{ fontSize: '16px', fontWeight: 900, color: '#111827', textTransform: 'uppercase', marginTop: '2px' }}>
                  {invoice.customerName || 'VALUED CUSTOMER'}
                </div>
                {invoice.orderTitle && (
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#107c41' }}>
                    Team / Order: {invoice.orderTitle.toUpperCase()}
                  </div>
                )}
                {invoice.customerPhone && (
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginTop: '2px' }}>
                    Phone: <strong>{invoice.customerPhone}</strong>
                  </div>
                )}
                {invoice.customerAddress && (
                  <div style={{ fontSize: '12px', color: '#4b5563', marginTop: '2px' }}>
                    Address: {invoice.customerAddress}
                  </div>
                )}
                {isGstActive && (
                  <div style={{ marginTop: '4px', fontSize: '12px', fontWeight: 700, color: '#1f2937' }}>
                    GSTIN: <span style={{ fontFamily: 'monospace', fontWeight: 800, color: invoice.customerGstin ? '#107c41' : '#6b7280' }}>
                      {invoice.customerGstin || 'URP (Unregistered Person)'}
                    </span>
                  </div>
                )}
              </div>

              {/* Bill Meta Details */}
              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#111827' }}>
                  {docType === 'INVOICE' ? 'INVOICE NO' : 'QUOTATION NO'}:{' '}
                  <span style={{ fontFamily: 'monospace', fontWeight: 900, color: '#107c41', fontSize: '15px' }}>
                    {currentDocNumber}
                  </span>
                </div>
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#374151' }}>
                  DATE: <span>{invoice.invoiceDate}</span>
                </div>
                {invoice.dueDate && (
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                    DELIVERY DUE: {invoice.dueDate}
                  </div>
                )}
                {invoice.infoNumber != null && (
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#ef4444' }}>
                    ORDER INFO NO: #{invoice.infoNumber}
                  </div>
                )}
                {isGstActive && (
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#1f2937', marginTop: '2px' }}>
                    PLACE OF SUPPLY: <strong>{invoice.stateName || 'Kerala'} ({invoice.stateCode || '32'})</strong>
                  </div>
                )}
                <div style={{ fontSize: '11px', color: '#6b7280' }}>
                  Payment Mode: <strong>{invoice.paymentMode || 'UPI / Cash'}</strong>
                </div>
              </div>
            </div>

            {/* Table Container with Print Mart Watermark */}
            <div style={{ position: 'relative', border: '1.5px solid #107c41', borderRadius: '6px', overflow: 'hidden', marginBottom: '14px' }}>
              {/* Background Brand Logo Watermark */}
              <div style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
                opacity: 0.07,
                zIndex: 0
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo.png"
                  alt=""
                  style={{ width: '300px', height: '300px', objectFit: 'contain' }}
                />
              </div>

              {/* Line Items Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', position: 'relative', zIndex: 1 }}>
                <thead>
                  <tr style={{ background: '#107c41', color: '#ffffff', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase' }}>
                    <th style={{ padding: '8px 6px', width: '38px', textAlign: 'center', borderRight: '1px solid #ffffff' }}>#</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', borderRight: '1px solid #ffffff' }}>DESCRIPTION OF GOODS / SERVICES</th>
                    <th style={{ padding: '8px 6px', width: '75px', textAlign: 'center', borderRight: '1px solid #ffffff' }}>HSN/SAC</th>
                    <th style={{ padding: '8px 6px', width: '65px', textAlign: 'center', borderRight: '1px solid #ffffff' }}>QTY</th>
                    <th style={{ padding: '8px 8px', width: '90px', textAlign: 'right', borderRight: '1px solid #ffffff' }}>RATE (₹)</th>
                    <th style={{ padding: '8px 12px', width: '115px', textAlign: 'right' }}>AMOUNT (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items && invoice.items.length > 0 ? (
                    invoice.items.map((item, idx) => {
                      const itemDtfActive = item.dtfOption && item.dtfOption !== 'none';
                      const desc = `${item.clothType || 'SALEENA'} - ${item.itemType || 'JERSEY'} PRINT ${item.neckType || 'ROUND NECK'}${item.sleeveType ? ` (${item.sleeveType.toUpperCase()})` : ''}${itemDtfActive ? ` + DTF (${item.dtfOption?.toUpperCase()})` : ''}${item.hasShorts ? ` + ${item.bottomType === 'track_pant' ? 'TRACK PANT' : 'SHORTS'}` : ''}`.toUpperCase();
                      const itemSub = item.subtotal || (item.pieces * item.ratePerPiece);

                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid #107c41', fontSize: '12.5px', fontWeight: 700, color: '#111827', minHeight: '32px' }}>
                          <td style={{ padding: '6px 4px', textAlign: 'center', borderRight: '1px solid #107c41', color: '#6b7280' }}>
                            {idx + 1}
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'left', borderRight: '1px solid #107c41', fontWeight: 800 }}>
                            {desc}
                          </td>
                          <td style={{ padding: '6px 4px', textAlign: 'center', borderRight: '1px solid #107c41', color: '#4b5563', fontFamily: 'monospace', fontSize: '11.5px' }}>
                            {item.hsnCode || invoice.hsnCode || '6109'}
                          </td>
                          <td style={{ padding: '6px 4px', textAlign: 'center', borderRight: '1px solid #107c41', fontWeight: 800 }}>
                            {item.pieces} Pcs
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', borderRight: '1px solid #107c41' }}>
                            {item.ratePerPiece.toLocaleString()}
                          </td>
                          <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 900 }}>
                            {itemSub.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr style={{ borderBottom: '1px solid #107c41', fontSize: '12.5px', fontWeight: 700, color: '#111827' }}>
                      <td style={{ padding: '6px 4px', textAlign: 'center', borderRight: '1px solid #107c41' }}>1</td>
                      <td style={{ padding: '6px 10px', textAlign: 'left', borderRight: '1px solid #107c41', fontWeight: 800 }}>
                        {`${invoice.clothType || 'SALEENA'} ${invoice.itemType || 'JERSEY'} PRINT ${invoice.neckType || 'ROUND NECK'}`.toUpperCase()}
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'center', borderRight: '1px solid #107c41', fontFamily: 'monospace' }}>
                        {invoice.hsnCode || '6109'}
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'center', borderRight: '1px solid #107c41', fontWeight: 800 }}>
                        {invoice.pieces} Pcs
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', borderRight: '1px solid #107c41' }}>
                        {invoice.ratePerPiece.toLocaleString()}
                      </td>
                      <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 900 }}>
                        {invoice.subtotal.toLocaleString()}
                      </td>
                    </tr>
                  )}

                  {/* Lined Empty Rows to fill 10 rows for clean invoice layout */}
                  {Array.from({ length: Math.max(0, 10 - (invoice.items?.length || 1)) }).map((_, idx) => (
                    <tr key={`empty-${idx}`} style={{ borderBottom: '1px solid #e5e7eb', height: '26px' }}>
                      <td style={{ borderRight: '1px solid #107c41' }}></td>
                      <td style={{ borderRight: '1px solid #107c41' }}></td>
                      <td style={{ borderRight: '1px solid #107c41' }}></td>
                      <td style={{ borderRight: '1px solid #107c41' }}></td>
                      <td style={{ borderRight: '1px solid #107c41' }}></td>
                      <td></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary Grid: Amount in Words, Bank / UPI Info, and Tax Totals */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: '16px', marginTop: '6px' }}>
              {/* Left Column: Amount in words, Payment info & Official Stamp */}
              <div>
                {/* Amount In Words */}
                <div style={{
                  padding: '8px 12px',
                  background: '#f9fafb',
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb',
                  marginBottom: '10px'
                }}>
                  <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#6b7280', textTransform: 'uppercase' }}>
                    Total Amount in Words:
                  </div>
                  <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#107c41', fontStyle: 'italic', marginTop: '2px' }}>
                    {numberToWordsINR(invoice.totalAmount)}
                  </div>
                </div>

                {/* Bank / UPI Payment Account */}
                <div style={{
                  fontSize: '11.5px',
                  lineHeight: '1.45',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: 'rgba(16, 124, 65, 0.05)',
                  border: '1px dashed #107c41',
                  marginBottom: '12px'
                }}>
                  <div style={{ fontWeight: 800, color: '#107c41', textTransform: 'uppercase', marginBottom: '2px' }}>
                    💳 UPI / Bank Transfer Details:
                  </div>
                  <div>Account Name: <strong>PRINT MART</strong></div>
                  <div>GPay / PhonePe / Paytm: <strong>+91 7025005566</strong></div>
                  <div>UPI ID: <strong style={{ color: '#107c41' }}>7025005566@upi</strong></div>
                </div>

                {/* Official Blue Stamp Box */}
                <div style={{
                  display: 'inline-block',
                  border: '2px solid #1e40af',
                  color: '#1e40af',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  fontFamily: 'Arial, sans-serif',
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  transform: 'rotate(-2deg)',
                  boxShadow: '0 2px 6px rgba(30, 64, 175, 0.15)'
                }}>
                  <div style={{ fontSize: '13px', letterSpacing: '0.04em' }}>PRINT MART</div>
                  <div style={{ fontSize: '10px', letterSpacing: '0.02em' }}>THATTARKONAM, KOLLAM</div>
                  <div style={{ fontSize: '9px', marginTop: '1px' }}>GSTIN: 32KRBPK8345C1ZW</div>
                </div>
              </div>

              {/* Right Column: Financial Calculation Breakdown Table */}
              <div>
                <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid #107c41', borderRadius: '6px', overflow: 'hidden' }}>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #107c41' }}>
                      <td style={{ padding: '6px 10px', fontSize: '12.5px', fontWeight: 800, color: '#374151', borderRight: '1px solid #107c41' }}>
                        SUBTOTAL
                      </td>
                      <td style={{ padding: '6px 10px', fontSize: '13px', fontWeight: 800, textAlign: 'right' }}>
                        ₹{invoice.subtotal.toLocaleString()}
                      </td>
                    </tr>

                    {invoice.discountAmount > 0 && (
                      <tr style={{ borderBottom: '1px solid #107c41' }}>
                        <td style={{ padding: '6px 10px', fontSize: '12px', fontWeight: 800, color: '#ef4444', borderRight: '1px solid #107c41' }}>
                          DISCOUNT
                        </td>
                        <td style={{ padding: '6px 10px', fontSize: '12.5px', fontWeight: 800, color: '#ef4444', textAlign: 'right' }}>
                          - ₹{invoice.discountAmount.toLocaleString()}
                        </td>
                      </tr>
                    )}

                    {isGstActive && (
                      <>
                        <tr style={{ borderBottom: '1px solid #107c41', background: '#f9fafb' }}>
                          <td style={{ padding: '6px 10px', fontSize: '12px', fontWeight: 700, color: '#4b5563', borderRight: '1px solid #107c41' }}>
                            TAXABLE VALUE
                          </td>
                          <td style={{ padding: '6px 10px', fontSize: '12.5px', fontWeight: 700, textAlign: 'right' }}>
                            ₹{effectiveTaxable.toLocaleString()}
                          </td>
                        </tr>

                        {!isInterState ? (
                          <>
                            <tr style={{ borderBottom: '1px solid #107c41' }}>
                              <td style={{ padding: '5px 10px', fontSize: '12px', fontWeight: 700, color: '#107c41', borderRight: '1px solid #107c41' }}>
                                CGST ({invoice.taxRate / 2}%)
                              </td>
                              <td style={{ padding: '5px 10px', fontSize: '12.5px', fontWeight: 700, textAlign: 'right', color: '#107c41' }}>
                                ₹{effectiveCgst.toLocaleString()}
                              </td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid #107c41' }}>
                              <td style={{ padding: '5px 10px', fontSize: '12px', fontWeight: 700, color: '#107c41', borderRight: '1px solid #107c41' }}>
                                SGST ({invoice.taxRate / 2}%)
                              </td>
                              <td style={{ padding: '5px 10px', fontSize: '12.5px', fontWeight: 700, textAlign: 'right', color: '#107c41' }}>
                                ₹{effectiveSgst.toLocaleString()}
                              </td>
                            </tr>
                          </>
                        ) : (
                          <tr style={{ borderBottom: '1px solid #107c41' }}>
                            <td style={{ padding: '5px 10px', fontSize: '12px', fontWeight: 700, color: '#107c41', borderRight: '1px solid #107c41' }}>
                              IGST ({invoice.taxRate}%)
                            </td>
                            <td style={{ padding: '5px 10px', fontSize: '12.5px', fontWeight: 700, textAlign: 'right', color: '#107c41' }}>
                              ₹{effectiveIgst.toLocaleString()}
                            </td>
                          </tr>
                        )}
                      </>
                    )}

                    <tr style={{ background: '#107c41', color: '#ffffff' }}>
                      <td style={{ padding: '8px 10px', fontSize: '14px', fontWeight: 900, borderRight: '1px solid rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>
                        TOTAL AMOUNT
                      </td>
                      <td style={{ padding: '8px 10px', fontSize: '16px', fontWeight: 900, textAlign: 'right' }}>
                        ₹{invoice.totalAmount.toLocaleString()}
                      </td>
                    </tr>

                    {invoice.advanceAmount > 0 && (
                      <tr style={{ borderBottom: '1px solid #107c41', background: 'rgba(16, 185, 129, 0.08)' }}>
                        <td style={{ padding: '6px 10px', fontSize: '12px', fontWeight: 800, color: '#107c41', borderRight: '1px solid #107c41' }}>
                          ADVANCE RECEIVED
                        </td>
                        <td style={{ padding: '6px 10px', fontSize: '13px', fontWeight: 800, color: '#107c41', textAlign: 'right' }}>
                          ₹{invoice.advanceAmount.toLocaleString()}
                        </td>
                      </tr>
                    )}

                    <tr style={{ background: invoice.balanceAmount > 0 ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)' }}>
                      <td style={{ padding: '7px 10px', fontSize: '13px', fontWeight: 900, color: invoice.balanceAmount > 0 ? '#dc2626' : '#107c41', borderRight: '1px solid #107c41', textTransform: 'uppercase' }}>
                        {invoice.balanceAmount > 0 ? 'BALANCE DUE' : 'PAYMENT STATUS'}
                      </td>
                      <td style={{ padding: '7px 10px', fontSize: '15px', fontWeight: 900, textAlign: 'right', color: invoice.balanceAmount > 0 ? '#dc2626' : '#107c41' }}>
                        {invoice.balanceAmount > 0 ? `₹${invoice.balanceAmount.toLocaleString()}` : '✓ FULLY PAID'}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Manager / Authorized Signatory */}
                <div style={{ marginTop: '22px', textAlign: 'right' }}>
                  <div style={{ display: 'inline-block', textAlign: 'center', width: '160px' }}>
                    <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '18px', fontWeight: 900, color: '#107c41', marginBottom: '2px' }}>
                      Print Mart
                    </div>
                    <div style={{ borderTop: '1px solid #000000', paddingTop: '3px', fontSize: '9.5px', fontWeight: 800, color: '#000000', textTransform: 'uppercase' }}>
                      AUTHORIZED SIGNATORY
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Full-Width Footer Bar */}
          <div style={{
            background: '#107c41',
            color: '#ffffff',
            padding: '7px 12px',
            textAlign: 'center',
            fontSize: '11px',
            fontWeight: 700,
            marginTop: '16px',
            borderRadius: '4px'
          }}>
            <div>Thank you for choosing <strong>PRINT MART</strong>! For any questions, please contact us.</div>
            <div style={{ fontSize: '11.5px', fontWeight: 900, marginTop: '2px' }}>
              Helpline: +91 7025005566, 9605222333 | Website: printmart.in | Email: printmartklm@gmail.com
            </div>
          </div>
        </div>
      </div>

      {/* Embedded Print CSS for A4 Slip */}
      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 4mm;
        }
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          html, body {
            width: 100% !important;
            height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            overflow: visible !important;
          }
          body * {
            visibility: hidden !important;
          }
          .printable-invoice-sheet,
          .printable-invoice-sheet * {
            visibility: visible !important;
          }
          .invoice-modal-wrapper {
            padding: 0 !important;
            margin: 0 !important;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
          }
          .printable-invoice-sheet {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            min-height: 285mm !important;
            margin: 0 !important;
            padding: 4mm !important;
            background: #ffffff !important;
            border: 1.5px solid #107c41 !important;
            box-sizing: border-box !important;
            page-break-inside: avoid !important;
          }
          .no-print, .navbar, .mobile-tab-bar {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
