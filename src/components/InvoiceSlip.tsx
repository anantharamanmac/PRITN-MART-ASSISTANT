"use client";

import React, { useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { OrderRecord } from '@/lib/db';

export interface InvoiceData {
  docType?: 'QUOTATION' | 'INVOICE';
  invoiceNumber: string;
  quotationNumber?: string;
  invoiceDate: string;
  customerName: string;
  customerPhone: string;
  orderTitle?: string;
  itemType: string;
  clothType: string;
  sleeveType: string;
  neckType: string;
  hasShorts: boolean;
  pieces: number;
  ratePerPiece: number;
  subtotal: number;
  discountAmount: number;
  taxRate: number; // 0, 5, or 18
  taxAmount: number;
  totalAmount: number;
  advanceAmount: number;
  balanceAmount: number;
  paymentMode: string;
  notes?: string;
  dtfOption?: string;
  dtfRate?: number;
}

interface InvoiceSlipProps {
  invoice: InvoiceData;
  order?: OrderRecord | null;
  onClose?: () => void;
}

export default function InvoiceSlip({ invoice, order, onClose }: InvoiceSlipProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [docType, setDocType] = useState<'QUOTATION' | 'INVOICE'>(invoice.docType || 'QUOTATION');

  const handlePrint = () => {
    const originalTitle = document.title;
    document.title = `${docType}_${invoice.invoiceNumber}`;
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  };

  const handleDownloadPDF = async () => {
    if (!printRef.current) return;
    const fileName = `${docType}_${invoice.invoiceNumber}.pdf`;

    setDownloadingPdf(true);
    toast.loading(`Generating PDF ${fileName}...`, { id: 'pdf-inv-download' });

    try {
      // Dynamic import standalone html2pdf bundle
      // @ts-ignore
      const html2pdfModule = await import('html2pdf.js/dist/html2pdf.bundle.min.js');
      const html2pdf = html2pdfModule.default || html2pdfModule || (window as any).html2pdf;

      const element = printRef.current;
      const opt = {
        margin: [2, 2, 2, 2] as [number, number, number, number],
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

  const dtfOptionActive = invoice.dtfOption && invoice.dtfOption !== 'none';
  const dtfRate = invoice.dtfRate || 0;
  const baseRate = invoice.ratePerPiece - dtfRate;

  const baseDescriptionLine = `${invoice.clothType || 'PP'} - CLOTH ${invoice.itemType || 'JERSEY'} PRINT ${invoice.neckType || 'ROUND NECK'}${invoice.sleeveType ? ` (${invoice.sleeveType.toUpperCase()})` : ''}`.toUpperCase();
  const dtfDescriptionLine = dtfOptionActive ? `DTF PRINTING (${invoice.dtfOption?.toUpperCase()})` : '';

  // Create 12 table rows to fill page height perfectly like sample bill
  const totalRowsCount = 12;
  const emptyRowsNeeded = Math.max(0, totalRowsCount - 1);
  const emptyRowsCount = emptyRowsNeeded - (invoice.hasShorts ? 1 : 0) - (dtfOptionActive ? 1 : 0);

  return (
    <div className="invoice-modal-wrapper" style={{ padding: '1rem', color: '#000000' }}>
      {/* Top Controls Bar (Hidden in Print) */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Print Mart {docType} Slip #{docType === 'INVOICE' ? invoice.invoiceNumber : (invoice.quotationNumber || invoice.invoiceNumber.replace('INV-', 'QT-'))}
            </h3>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Customer: {invoice.customerName}
            </p>
          </div>

          {/* Doc Type Toggle */}
          <div style={{ background: 'var(--bg-main)', padding: '0.2rem', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', gap: '0.2rem' }}>
            <button
              type="button"
              onClick={() => setDocType('QUOTATION')}
              style={{
                padding: '0.3rem 0.75rem',
                borderRadius: '6px',
                border: 'none',
                background: docType === 'QUOTATION' ? '#38d39f' : 'transparent',
                color: docType === 'QUOTATION' ? '#ffffff' : 'var(--text-secondary)',
                fontWeight: 800,
                fontSize: '0.78rem',
                cursor: 'pointer'
              }}
            >
              QUOTATION
            </button>
            <button
              type="button"
              onClick={() => setDocType('INVOICE')}
              style={{
                padding: '0.3rem 0.75rem',
                borderRadius: '6px',
                border: 'none',
                background: docType === 'INVOICE' ? '#38d39f' : 'transparent',
                color: docType === 'INVOICE' ? '#ffffff' : 'var(--text-secondary)',
                fontWeight: 800,
                fontSize: '0.78rem',
                cursor: 'pointer'
              }}
            >
              INVOICE
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
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
              fontSize: '0.875rem',
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
              fontSize: '0.875rem',
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

      {/* ── PRINTABLE A4 BILL SHEET (MATCHING SAMPLE IMAGE) ── */}
      <div style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div
          ref={printRef}
          className="printable-invoice-sheet"
          style={{
            background: '#ffffff',
            color: '#000000',
            fontFamily: "'Times New Roman', Times, Georgia, serif",
            padding: '16px 20px',
            border: '1px solid #38d39f',
            boxSizing: 'border-box',
            width: '100%',
            maxWidth: '820px',
            minWidth: '600px',
            minHeight: '280mm',
            margin: '0 auto',
            fontSize: '14px',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
        >
        <div>
          {/* Top Company Header Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            {/* Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '42px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 100 100" width="42" height="42">
                  <path d="M20 15 C45 15 75 20 75 45 C75 70 45 75 20 75 Z" fill="#38d39f" />
                  <path d="M20 40 C38 40 60 42 60 58 C60 74 38 76 20 76 Z" fill="#ffffff" />
                  <path d="M20 15 L20 85" stroke="#38d39f" strokeWidth="14" strokeLinecap="round" />
                </svg>
              </div>
              <div style={{ fontFamily: 'Arial, sans-serif' }}>
                <span style={{ fontSize: '28px', fontWeight: 900, color: '#000000', letterSpacing: '-0.02em' }}>Print</span>
                <span style={{ fontSize: '28px', fontWeight: 900, color: '#38d39f', marginLeft: '2px' }}>Mart</span>
              </div>
            </div>

            {/* Mint Green Category Pill Header */}
            <div style={{
              background: '#38d39f',
              color: '#ffffff',
              padding: '6px 28px',
              borderRadius: '20px',
              fontSize: '18px',
              fontWeight: 900,
              fontFamily: 'Arial, sans-serif',
              letterSpacing: '0.08em',
              textTransform: 'uppercase'
            }}>
              JERSEY | UNIFORMS | T-SHIRTS
            </div>
          </div>

          {/* Subheader Address & GST Info */}
          <div style={{ textAlign: 'center', fontFamily: 'Arial, sans-serif', fontSize: '13px', fontWeight: 800, color: '#000000', lineHeight: '1.4', marginBottom: '8px' }}>
            <div>Behind NSS Karayogam, Thattarkonam, Kottamkara, Kollam</div>
            <div>GSTIN/UIN: 32KRBPK8345C1ZW | State Name : Kerala, Code : 691005</div>
          </div>

          {/* Thin Green Separator with Centered QUOTATION / INVOICE Pill Badge */}
          <div style={{ position: 'relative', borderTop: '1.5px solid #38d39f', margin: '14px 0 20px 0', textAlign: 'center' }}>
            <span style={{
              position: 'absolute',
              top: '-14px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#38d39f',
              color: '#ffffff',
              padding: '3px 26px',
              borderRadius: '16px',
              fontSize: '14px',
              fontWeight: 900,
              fontFamily: 'Arial, sans-serif',
              letterSpacing: '0.06em',
              textTransform: 'uppercase'
            }}>
              {docType}
            </span>
          </div>

          {/* Customer Name & Date Section */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', fontFamily: "'Times New Roman', serif" }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 900, color: '#000000' }}>CUSTOMER:</div>
              <div style={{ fontSize: '16px', fontWeight: 900, color: '#000000', textTransform: 'uppercase', marginTop: '4px', paddingLeft: '16px', lineHeight: '1.3' }}>
                {invoice.customerName || 'THE PRINCIPAL'}<br />
                {invoice.orderTitle ? invoice.orderTitle.toUpperCase() : ''}
              </div>
            </div>

            <div style={{ textAlign: 'right', fontSize: '17px', fontWeight: 900, color: '#000000' }}>
              <div style={{ marginBottom: '4px' }}>
                {docType === 'INVOICE' ? 'INVOICE NO' : 'QUOTATION NO'} : <span style={{ fontFamily: 'Arial, sans-serif', marginLeft: '6px' }}>{docType === 'INVOICE' ? invoice.invoiceNumber : (invoice.quotationNumber || invoice.invoiceNumber.replace('INV-', 'QT-'))}</span>
              </div>
              <div>
                DATE : <span style={{ fontFamily: 'Arial, sans-serif', marginLeft: '6px' }}>{invoice.invoiceDate}</span>
              </div>
            </div>
          </div>

          {/* Table Container with Watermark */}
          <div style={{ position: 'relative', border: '1.5px solid #38d39f', marginBottom: '16px' }}>
            {/* Background Watermark */}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', opacity: 0.06, zIndex: 0 }}>
              <svg viewBox="0 0 100 100" width="280" height="280">
                <path d="M20 15 C45 15 75 20 75 45 C75 70 45 75 20 75 Z" fill="#38d39f" />
                <path d="M20 40 C38 40 60 42 60 58 C60 74 38 76 20 76 Z" fill="#ffffff" />
                <path d="M20 15 L20 85" stroke="#38d39f" strokeWidth="14" strokeLinecap="round" />
              </svg>
            </div>

            {/* Line Items Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', position: 'relative', zIndex: 1, fontFamily: 'Arial, sans-serif' }}>
              <thead>
                <tr style={{ background: '#38d39f', color: '#ffffff', fontSize: '14px', fontWeight: 900, textAlign: 'center' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'center', borderRight: '1.5px solid #ffffff' }}>DESCRIPTION</th>
                  <th style={{ padding: '8px 8px', width: '100px', textAlign: 'center', borderRight: '1.5px solid #ffffff' }}>UNIT PRICE</th>
                  <th style={{ padding: '8px 8px', width: '60px', textAlign: 'center', borderRight: '1.5px solid #ffffff' }}>QTY</th>
                  <th style={{ padding: '8px 12px', width: '110px', textAlign: 'center' }}>AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                {/* Row 1: Item details (Base Garment) */}
                <tr style={{ borderBottom: '1px solid #38d39f', fontSize: '13px', fontWeight: 900, color: '#000000', height: '30px' }}>
                  <td style={{ padding: '6px 12px', textAlign: 'left', borderRight: '1px solid #38d39f' }}>
                    {baseDescriptionLine}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'center', borderRight: '1px solid #38d39f' }}>
                    {baseRate}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'center', borderRight: '1px solid #38d39f' }}>
                    {invoice.pieces}
                  </td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 900 }}>
                    {(baseRate * invoice.pieces).toLocaleString()}
                  </td>
                </tr>

                {/* Optional Row 2: DTF Printing details */}
                {dtfOptionActive && (
                  <tr style={{ borderBottom: '1px solid #38d39f', fontSize: '13px', fontWeight: 900, color: '#000000', height: '30px' }}>
                    <td style={{ padding: '6px 12px', textAlign: 'left', borderRight: '1px solid #38d39f' }}>
                      {dtfDescriptionLine}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'center', borderRight: '1px solid #38d39f' }}>
                      {dtfRate}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'center', borderRight: '1px solid #38d39f' }}>
                      {invoice.pieces}
                    </td>
                    <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 900 }}>
                      {(dtfRate * invoice.pieces).toLocaleString()}
                    </td>
                  </tr>
                )}

                {/* Optional Row 3: Shorts Add-on if applicable */}
                {invoice.hasShorts && (
                  <tr style={{ borderBottom: '1px solid #38d39f', fontSize: '13px', fontWeight: 900, color: '#000000', height: '30px' }}>
                    <td style={{ padding: '6px 12px', textAlign: 'left', borderRight: '1px solid #38d39f' }}>
                      INCLUDES SHORTS / PANTS ADD-ON
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'center', borderRight: '1px solid #38d39f' }}>
                      -
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'center', borderRight: '1px solid #38d39f' }}>
                      {invoice.pieces}
                    </td>
                    <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 900 }}>
                      INCLUDED
                    </td>
                  </tr>
                )}

                {/* Lined Empty Rows to fill 12 total table rows */}
                {Array.from({ length: Math.max(0, emptyRowsCount) }).map((_, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #38d39f', height: '28px' }}>
                    <td style={{ borderRight: '1px solid #38d39f' }}></td>
                    <td style={{ borderRight: '1px solid #38d39f' }}></td>
                    <td style={{ borderRight: '1px solid #38d39f' }}></td>
                    <td></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary Grid & Acceptance Signature Section */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px', marginTop: '10px' }}>
            {/* Left: Acceptance text + Stamp */}
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#444444', fontStyle: 'italic', marginBottom: '20px' }}>
                Please confirm your acceptance by signing this document:
              </div>

              {/* Official Blue Stamp Box */}
              <div style={{
                display: 'inline-block',
                border: '2.5px solid #1e40af',
                color: '#1e40af',
                padding: '8px 14px',
                borderRadius: '4px',
                fontFamily: 'Arial, sans-serif',
                fontWeight: 900,
                textTransform: 'uppercase',
                transform: 'rotate(-2deg)',
                boxShadow: '0 2px 8px rgba(30, 64, 175, 0.15)'
              }}>
                <div style={{ fontSize: '15px', letterSpacing: '0.04em' }}>PRINT MART</div>
                <div style={{ fontSize: '11px', letterSpacing: '0.02em' }}>THATTARKONAM</div>
                <div style={{ fontSize: '11px' }}>KOLLAM - 691005</div>
                <div style={{ fontSize: '10px', marginTop: '2px' }}>Mob: 7025005566, 9605222333</div>
              </div>
            </div>

            {/* Right: Subtotal / Advance / Balance Due Summary Table */}
            <div>
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid #38d39f', fontFamily: 'Arial, sans-serif' }}>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #38d39f' }}>
                    <td style={{ padding: '8px 12px', fontSize: '14px', fontWeight: 900, color: '#38d39f', borderRight: '1.5px solid #38d39f', textTransform: 'uppercase' }}>
                      SUBTOTAL
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: '15px', fontWeight: 900, textAlign: 'right', color: '#000000' }}>
                      {invoice.subtotal.toLocaleString()}
                    </td>
                  </tr>

                  {invoice.advanceAmount > 0 && (
                    <tr style={{ borderBottom: '1px solid #38d39f' }}>
                      <td style={{ padding: '8px 12px', fontSize: '14px', fontWeight: 900, color: '#10b981', borderRight: '1.5px solid #38d39f', textTransform: 'uppercase' }}>
                        ADVANCE PAID
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: '15px', fontWeight: 900, textAlign: 'right', color: '#10b981' }}>
                        {invoice.advanceAmount.toLocaleString()}
                      </td>
                    </tr>
                  )}

                  <tr style={{ background: 'rgba(56, 211, 159, 0.08)' }}>
                    <td style={{ padding: '8px 12px', fontSize: '14px', fontWeight: 900, color: invoice.balanceAmount > 0 ? '#d92525' : '#10b981', borderRight: '1.5px solid #38d39f', textTransform: 'uppercase' }}>
                      {invoice.balanceAmount > 0 ? 'BALANCE DUE' : 'TOTAL PAID'}
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: '16px', fontWeight: 900, textAlign: 'right', color: invoice.balanceAmount > 0 ? '#d92525' : '#10b981' }}>
                      {invoice.balanceAmount > 0 ? invoice.balanceAmount.toLocaleString() : invoice.totalAmount.toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Manager Sign Block */}
              <div style={{ marginTop: '24px', textAlign: 'right', fontFamily: 'Arial, sans-serif' }}>
                <div style={{ display: 'inline-block', textAlign: 'center', width: '150px' }}>
                  <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '20px', fontWeight: 900, color: '#1e3a8a', marginBottom: '2px' }}>
                    Amnas
                  </div>
                  <div style={{ borderTop: '1px solid #000000', paddingTop: '3px', fontSize: '10px', fontWeight: 800, color: '#000000', textTransform: 'uppercase' }}>
                    MANAGER SIGN
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Full-Width Mint Green Bottom Footer Bar */}
        <div style={{
          background: '#38d39f',
          color: '#ffffff',
          padding: '8px 12px',
          textAlign: 'center',
          fontFamily: 'Arial, sans-serif',
          fontSize: '12px',
          fontWeight: 800,
          marginTop: '16px',
          lineHeight: '1.4'
        }}>
          <div>If you have any question concerning this {docType.toLowerCase()} please contact PRINT MART</div>
          <div style={{ fontSize: '13px', fontWeight: 900, marginTop: '2px' }}>
            P : +91 7025005566, 9605222333 | E : printmartklm@gmail.com
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
            border: 1px solid #38d39f !important;
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
